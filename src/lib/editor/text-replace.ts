/**
 * "Editing" text that is part of the PDF: the original run is covered with a
 * white box and the new text is drawn on top at the same position and size.
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

/** Maps pdf.js's CSS generic family to the closest standard PDF font. */
export function fontFromFamily(family: string): TextFont {
  if (family.includes('monospace')) return 'mono';
  if (family.includes('serif') && !family.includes('sans')) return 'serif';
  return 'sans';
}

export function replaceTextAnnotations(item: PdfTextItem, text: string): Annotation[] {
  return [
    {
      id: makeId(),
      type: 'rect',
      ...textItemBox(item),
      color: '#FFFFFF',
      strokeWidth: 0,
      fill: '#FFFFFF',
      opacity: 1,
    },
    {
      id: makeId(),
      type: 'text',
      x: item.x,
      y: item.baseline - item.fontSize * BASELINE,
      text,
      fontSize: item.fontSize,
      color: '#000000',
      font: fontFromFamily(item.fontFamily),
    },
  ];
}
