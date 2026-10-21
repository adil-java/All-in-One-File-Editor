/**
 * "Editing" text that is part of the PDF: the original run is covered with a
 * box in the page's background color and the new text is drawn on top at the
 * same position and size, matching the original's font style and color.
 */

import type { PdfTextItem } from '@/lib/pdf-renderer/use-pdf-renderer';

import { BASELINE } from './geometry';
import { type Annotation, makeId, type Rect, type TextFont } from './types';

/** Area covered by a text run, including ascenders and descenders. */
export function textItemBox(item: PdfTextItem): Rect {
  return {
    x: item.x - 1,
    y: item.baseline - item.fontSize * 0.95,
    w: item.width + 2,
    h: item.fontSize * 1.25,
  };
}

const MONO_FONT = /courier|mono|consol|menlo|inconsolata|code|typewriter/i;
const SERIF_FONT = /times|roman|serif|georgia|garamond|cambria|book|minion|palatino|baskerville/i;
const SANS_FONT = /sans|arial|helvetica|calibri|verdana|segoe|roboto|tahoma|gothic|grotesk/i;

/**
 * Picks the closest standard PDF font for a text run, from the PDF font's name
 * when it is recognizable, otherwise from pdf.js's CSS generic family.
 */
export function fontFor(item: Pick<PdfTextItem, 'fontName' | 'fontFamily'>): TextFont {
  // Drop the subset prefix, e.g. "ABCDEF+Calibri-Bold" -> "Calibri-Bold".
  const name = item.fontName.replace(/^[A-Z]{6}\+/, '');
  if (MONO_FONT.test(name)) return 'mono';
  if (SANS_FONT.test(name)) return 'sans';
  if (SERIF_FONT.test(name)) return 'serif';
  if (item.fontFamily.includes('monospace')) return 'mono';
  if (item.fontFamily.includes('serif') && !item.fontFamily.includes('sans')) return 'serif';
  return 'sans';
}

export function replaceTextAnnotations(item: PdfTextItem, text: string): Annotation[] {
  return [
    {
      id: makeId(),
      type: 'rect',
      ...textItemBox(item),
      // Cover with the page's own background color around the text.
      color: item.background,
      strokeWidth: 0,
      fill: item.background,
      opacity: 1,
    },
    {
      id: makeId(),
      type: 'text',
      x: item.x,
      y: item.baseline - item.fontSize * BASELINE,
      text,
      fontSize: item.fontSize,
      color: item.color,
      font: fontFor(item),
      bold: item.bold,
      italic: item.italic,
      sourceFont: item.fontName || undefined,
    },
  ];
}
