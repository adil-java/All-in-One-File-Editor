/**
 * Writes the editor state into the PDF with pdf-lib: pages are arranged in
 * editor order with their rotation, and annotations are flattened into the
 * page content as vector paths, text and images.
 */

import {
  beginText,
  BlendMode,
  degrees,
  endText,
  LineCapStyle,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFImage,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  StandardFonts,
} from 'pdf-lib';

import { BASELINE, LINE_HEIGHT, textLines } from '@/lib/editor/geometry';
import { arrowHead, denormalize, inkPath } from '@/lib/editor/paths';
import type { Annotation, EditorPage, Point, TextAnnotation, TextFont } from '@/lib/editor/types';

import { findPageFont, type PageFont } from './page-fonts';

/** Standard PDF fonts by family, indexed by [bold][italic]. */
const STANDARD_FONTS: Record<
  TextFont,
  [[StandardFonts, StandardFonts], [StandardFonts, StandardFonts]]
> = {
  sans: [
    [StandardFonts.Helvetica, StandardFonts.HelveticaOblique],
    [StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique],
  ],
  serif: [
    [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic],
    [StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic],
  ],
  mono: [
    [StandardFonts.Courier, StandardFonts.CourierOblique],
    [StandardFonts.CourierBold, StandardFonts.CourierBoldOblique],
  ],
};

function color(hex: string) {
  const value = parseInt(hex.replace('#', ''), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/**
 * Maps base page coordinates (pdf.js view: intrinsic /Rotate applied, origin
 * top-left, y down) to PDF user space (unrotated, origin bottom-left, y up).
 */
function makeMapper(page: PDFPage) {
  const box = page.getCropBox();
  const rotation = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const { x: mx, y: my, width: cw, height: ch } = box;
  const map = ({ x, y }: Point): Point => {
    switch (rotation) {
      case 90:
        return { x: mx + y, y: my + x };
      case 180:
        return { x: mx + cw - x, y: my + y };
      case 270:
        return { x: mx + cw - y, y: my + ch - x };
      default:
        return { x: mx + x, y: my + ch - y };
    }
  };
  return { map, rotation };
}

/**
 * pdf-lib's drawSvgPath flips the y axis, so points are given as (X, -Y) to
 * land at user-space (X, Y) when drawn at the origin.
 */
function toSvgSpace(points: Point[]) {
  return points.map((p) => ({ x: p.x, y: -p.y }));
}

function polygonPath(points: Point[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

/** Four cubic Bézier arcs approximating an ellipse inscribed in the box. */
function ellipsePoints(x: number, y: number, w: number, h: number) {
  const k = 0.5522847498;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  return [
    { x: cx + rx, y: cy },
    { x: cx + rx, y: cy + k * ry },
    { x: cx + k * rx, y: cy + ry },
    { x: cx, y: cy + ry },
    { x: cx - k * rx, y: cy + ry },
    { x: cx - rx, y: cy + k * ry },
    { x: cx - rx, y: cy },
    { x: cx - rx, y: cy - k * ry },
    { x: cx - k * rx, y: cy - ry },
    { x: cx, y: cy - ry },
    { x: cx + k * rx, y: cy - ry },
    { x: cx + rx, y: cy - k * ry },
    { x: cx + rx, y: cy },
  ];
}

function bezierPath(points: Point[]) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i + 2 < points.length; i += 3) {
    const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
    d += ` C ${a.x} ${a.y} ${b.x} ${b.y} ${c.x} ${c.y}`;
  }
  return `${d} Z`;
}

/** Replaces characters the standard Helvetica font cannot encode. */
function encodable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text)
    .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

type Resources = {
  doc: PDFDocument;
  fonts: Map<StandardFonts, PDFFont>;
  images: Map<string, PDFImage>;
  /** Resource names of embedded standard fonts, per page. */
  fontKeys: WeakMap<PDFPage, Map<PDFFont, PDFName>>;
};

function fontKey(page: PDFPage, font: PDFFont, resources: Resources) {
  let keys = resources.fontKeys.get(page);
  if (!keys) resources.fontKeys.set(page, (keys = new Map()));
  let key = keys.get(font);
  if (!key) keys.set(font, (key = page.node.newFontDictionary(font.name, font.ref)));
  return key;
}

/**
 * Draws text with a font that is already in the page (the font of the text it
 * replaces), so it looks exactly like the original. Characters the embedded
 * font can't encode (e.g. missing from a subset) use `fallback` instead; the
 * viewer advances by each font's real glyph widths, so runs line up.
 */
function drawTextInPageFont(
  page: PDFPage,
  a: TextAnnotation,
  source: PageFont,
  fallback: PDFFont,
  map: (p: Point) => Point,
  rotation: number,
  resources: Resources,
) {
  const supported = new Set(fallback.getCharacterSet());
  const fallbackKey = fontKey(page, fallback, resources);
  const radians = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  const { red, green, blue } = color(a.color) as { red: number; green: number; blue: number };

  const ops: PDFOperator[] = [
    pushGraphicsState(),
    beginText(),
    setFillingRgbColor(red, green, blue),
  ];
  textLines(a.text).forEach((line, i) => {
    const origin = map({ x: a.x, y: a.y + a.fontSize * (BASELINE + i * LINE_HEIGHT) });
    ops.push(setTextMatrix(cos, sin, -sin, cos, origin.x, origin.y));
    // Split the line into runs that use the same font.
    let run = '';
    let runInSource = true;
    const flush = () => {
      if (!run) return;
      ops.push(
        runInSource
          ? setFontAndSize(source.key, a.fontSize)
          : setFontAndSize(fallbackKey, a.fontSize),
        showText(
          runInSource
            ? PDFHexString.of(Array.from(run, (ch) => source.codes.get(ch)).join(''))
            : fallback.encodeText(run),
        ),
      );
      run = '';
    };
    for (const ch of Array.from(line)) {
      const inSource = source.codes.has(ch);
      if (inSource !== runInSource) flush();
      runInSource = inSource;
      run += inSource || supported.has(ch.codePointAt(0)!) ? ch : '?';
    }
    flush();
  });
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

async function embedImage(uri: string, resources: Resources) {
  let image = resources.images.get(uri);
  if (!image) {
    image = uri.startsWith('data:image/png')
      ? await resources.doc.embedPng(uri)
      : await resources.doc.embedJpg(uri);
    resources.images.set(uri, image);
  }
  return image;
}

async function embedFont(
  {
    font = 'sans',
    bold = false,
    italic = false,
  }: { font?: TextFont; bold?: boolean; italic?: boolean },
  resources: Resources,
) {
  const standard = STANDARD_FONTS[font][bold ? 1 : 0][italic ? 1 : 0];
  let embedded = resources.fonts.get(standard);
  if (!embedded) {
    embedded = await resources.doc.embedFont(standard);
    resources.fonts.set(standard, embedded);
  }
  return embedded;
}

async function drawAnnotation(page: PDFPage, a: Annotation, resources: Resources) {
  const { map, rotation } = makeMapper(page);
  const mapAll = (points: Point[]) => toSvgSpace(points.map(map));
  const round = { borderLineCap: LineCapStyle.Round };

  switch (a.type) {
    case 'ink':
      page.drawSvgPath(inkPath(mapAll(a.points)), {
        x: 0,
        y: 0,
        borderColor: color(a.color),
        borderWidth: a.width,
        borderOpacity: a.opacity,
        blendMode: a.opacity < 1 ? BlendMode.Multiply : undefined,
        ...round,
      });
      break;
    case 'rect': {
      const corners = [
        { x: a.x, y: a.y },
        { x: a.x + a.w, y: a.y },
        { x: a.x + a.w, y: a.y + a.h },
        { x: a.x, y: a.y + a.h },
      ];
      page.drawSvgPath(polygonPath(mapAll(corners)), {
        x: 0,
        y: 0,
        color: a.fill ? color(a.fill) : undefined,
        opacity: a.opacity,
        borderColor: a.strokeWidth > 0 ? color(a.color) : undefined,
        borderWidth: a.strokeWidth,
        borderOpacity: a.opacity,
      });
      break;
    }
    case 'ellipse':
      page.drawSvgPath(bezierPath(mapAll(ellipsePoints(a.x, a.y, a.w, a.h))), {
        x: 0,
        y: 0,
        color: a.fill ? color(a.fill) : undefined,
        borderColor: color(a.color),
        borderWidth: a.strokeWidth,
        borderOpacity: a.opacity,
      });
      break;
    case 'line': {
      const [from, to] = mapAll([a.from, a.to]);
      let d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      if (a.arrow) {
        const [left, right] = mapAll(arrowHead(a.from, a.to, a.strokeWidth));
        d += ` M ${left.x} ${left.y} L ${to.x} ${to.y} L ${right.x} ${right.y}`;
      }
      page.drawSvgPath(d, {
        x: 0,
        y: 0,
        borderColor: color(a.color),
        borderWidth: a.strokeWidth,
        ...round,
      });
      break;
    }
    case 'signature':
      for (const stroke of a.strokes) {
        page.drawSvgPath(inkPath(mapAll(stroke.map((p) => denormalize(p, a)))), {
          x: 0,
          y: 0,
          borderColor: color(a.color),
          borderWidth: a.strokeWidth * a.h,
          ...round,
        });
      }
      break;
    case 'text': {
      const font = await embedFont(a, resources);
      const source = findPageFont(page, a.sourceFont);
      if (source) {
        drawTextInPageFont(page, a, source, font, map, rotation, resources);
        break;
      }
      textLines(a.text).forEach((line, i) => {
        const origin = map({ x: a.x, y: a.y + a.fontSize * (BASELINE + i * LINE_HEIGHT) });
        page.drawText(encodable(line, font), {
          x: origin.x,
          y: origin.y,
          size: a.fontSize,
          font,
          color: color(a.color),
          rotate: degrees(rotation),
        });
      });
      break;
    }
    case 'image': {
      const image = await embedImage(a.uri, resources);
      // Images are positioned by their own bottom-left corner.
      const origin = map({ x: a.x, y: a.y + a.h });
      page.drawImage(image, {
        x: origin.x,
        y: origin.y,
        width: a.w,
        height: a.h,
        rotate: degrees(rotation),
      });
      break;
    }
  }
}

/**
 * Removes form fields whose widgets all sit on pages that were deleted, so the
 * form does not point at pages that are no longer in the document.
 */
function removeOrphanedFields(doc: PDFDocument, kept: PDFPage[]) {
  const keptRefs = new Set(kept.map((page) => page.ref.toString()));
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const pageRefs = field.acroField.getWidgets().map((widget) => widget.P()?.toString());
    if (pageRefs.length > 0 && pageRefs.every((ref) => ref && !keptRefs.has(ref))) {
      form.acroForm.removeField(field.acroField);
    }
  }
}

/**
 * Builds the final PDF from the source document (base64) and the editor pages.
 *
 * The source document is edited in place rather than copied into a new one,
 * because copying pages drops the document's fillable form.
 */
export async function exportPdf(sourceBase64: string, pages: EditorPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBase64, { ignoreEncryption: true });
  const original = doc.getPages();

  // Reuse each source page once; extra uses of a page (duplicates) get copies.
  const used = new Set<number>();
  const finalPages: PDFPage[] = [];
  for (const { sourceIndex } of pages) {
    if (used.has(sourceIndex)) {
      const [copy] = await doc.copyPages(doc, [sourceIndex]);
      finalPages.push(copy);
    } else {
      used.add(sourceIndex);
      finalPages.push(original[sourceIndex]);
    }
  }

  // Rebuild the page tree in editor order, dropping deleted pages.
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  finalPages.forEach((page) => doc.addPage(page));
  removeOrphanedFields(doc, finalPages);

  const resources: Resources = {
    doc,
    fonts: new Map(),
    images: new Map(),
    fontKeys: new WeakMap(),
  };
  for (let i = 0; i < pages.length; i++) {
    const page = finalPages[i];
    for (const annotation of pages[i].annotations) {
      await drawAnnotation(page, annotation, resources);
    }
    if (pages[i].rotation) {
      page.setRotation(degrees((page.getRotation().angle + pages[i].rotation) % 360));
    }
  }

  return doc.save();
}
