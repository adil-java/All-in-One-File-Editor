/**
 * Reuses fonts that are already in a PDF page, so edited text can be written in
 * exactly the font the original text used.
 *
 * Embedded fonts use their own character codes (and are often subsets with only
 * the glyphs the document needs), so text is encoded through the inverse of the
 * font's ToUnicode CMap. Characters the font has no code for can't be drawn
 * with it.
 */

import {
  decodePDFRawStream,
  PDFDict,
  PDFName,
  type PDFPage,
  PDFRawStream,
  PDFStream,
} from 'pdf-lib';

export type PageFont = {
  /** Resource name on the page, e.g. /F1. */
  key: PDFName;
  /** BaseFont, normalized the way pdf.js reports font names. */
  name: string;
  /** Character -> hex code in this font. */
  codes: Map<string, string>;
};

/** pdf.js replaces commas and underscores in font names with hyphens. */
export function normalizeFontName(name: string) {
  return name.replace(/[,_]/g, '-');
}

function streamText(stream: PDFStream) {
  const bytes =
    stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

/** Decodes a UTF-16BE hex string from a CMap into text. */
function utf16(hex: string) {
  let text = '';
  for (let i = 0; i + 4 <= hex.length; i += 4)
    text += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return text;
}

const hexTokens = (s: string) =>
  Array.from(s.matchAll(/<([0-9A-Fa-f\s]*)>/g), (m) => m[1].replace(/\s/g, ''));

/** Inverts a ToUnicode CMap into character -> code (hex). */
export function parseToUnicode(cmap: string) {
  const codes = new Map<string, string>();
  const add = (code: string, text: string) => {
    // Only single characters; ligatures like "fi" can't be typed back as one code.
    if (Array.from(text).length === 1 && !codes.has(text)) codes.set(text, code.toUpperCase());
  };

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const tokens = hexTokens(block[1]);
    for (let i = 0; i + 1 < tokens.length; i += 2) add(tokens[i], utf16(tokens[i + 1]));
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // Each entry is "<lo> <hi> <dst>" or "<lo> <hi> [<d1> <d2> ...]".
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g,
    )) {
      const [, loHex, hiHex, dst] = entry;
      const lo = parseInt(loHex, 16);
      const hi = parseInt(hiHex, 16);
      const width = loHex.length;
      const code = (n: number) => n.toString(16).padStart(width, '0');
      if (dst.startsWith('[')) {
        hexTokens(dst).forEach((d, i) => add(code(lo + i), utf16(d)));
      } else {
        const start = hexTokens(dst)[0];
        const prefix = start.slice(0, -4);
        const last = parseInt(start.slice(-4), 16);
        for (let n = lo; n <= hi && n - lo < 0x10000; n++) {
          add(code(n), utf16(prefix + (last + n - lo).toString(16).padStart(4, '0')));
        }
      }
    }
  }
  return codes;
}

const cache = new WeakMap<PDFPage, PageFont[]>();

/** Fonts in a page's resources that have a ToUnicode map (so text can be encoded). */
export function pageFonts(page: PDFPage): PageFont[] {
  const cached = cache.get(page);
  if (cached) return cached;
  const fonts: PageFont[] = [];
  const dict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  for (const [key, value] of dict?.entries() ?? []) {
    try {
      const font = page.doc.context.lookupMaybe(value, PDFDict);
      const baseFont = font?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText();
      const toUnicode = font?.lookupMaybe(PDFName.of('ToUnicode'), PDFStream);
      if (!baseFont || !toUnicode) continue;
      const codes = parseToUnicode(streamText(toUnicode));
      if (codes.size > 0) fonts.push({ key, name: normalizeFontName(baseFont), codes });
    } catch {
      // Unreadable font: text in it falls back to a standard font.
    }
  }
  cache.set(page, fonts);
  return fonts;
}

export function findPageFont(page: PDFPage, name: string | undefined) {
  if (!name) return null;
  const wanted = normalizeFontName(name);
  return pageFonts(page).find((font) => font.name === wanted) ?? null;
}
