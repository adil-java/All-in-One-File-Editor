/**
 * Merging and splitting PDFs by page ranges (like iLovePDF's Merge and Split).
 *
 * Works on raw bytes rather than base64 so large files (hundreds of MB) don't
 * need extra copies, parses each source once even when several parts use it,
 * and copies only the selected pages into the output.
 */

import { PDFDocument } from 'pdf-lib';

import type { PageRange } from './page-ranges';

export async function loadPdf(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/** One piece of the merged output: these pages of this source, in this order. */
export type MergePart = { source: PDFDocument; indices: number[] };

/** Builds a new PDF from the parts in order. */
export async function mergeParts(parts: MergePart[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const { source, indices } of parts) {
    const pages = await out.copyPages(source, indices);
    pages.forEach((page) => out.addPage(page));
  }
  return out.save();
}

/**
 * One output file per range. Each output is handed to `onOutput` (e.g. to be
 * written to disk) before the next is built, so only one is in memory at a time.
 */
export async function splitByRanges(
  source: PDFDocument,
  ranges: PageRange[],
  onOutput: (range: PageRange, bytes: Uint8Array, index: number) => Promise<void>,
) {
  for (let i = 0; i < ranges.length; i++) {
    const { from, to } = ranges[i];
    const indices = Array.from({ length: to - from + 1 }, (_, k) => from - 1 + k);
    await onOutput(ranges[i], await mergeParts([{ source, indices }]), i);
  }
}
