/**
 * Merge and Split for files on the device: reads PDFs as raw bytes (no base64,
 * so large files fit in memory), parses each one once per session, and saves
 * results into the library.
 */

import type { PDFDocument } from 'pdf-lib';

import { createDocument, type PdfDocument, readFileBytes } from '@/lib/documents';

import { loadPdf, mergeParts, splitByRanges } from './merge-split';
import { formatRange, type PageRange } from './page-ranges';

/** A PDF to take pages from: a library document or a file picked from the device. */
export type PdfSource = { uri: string; name: string; size?: number };

const opened = new Map<string, Promise<PDFDocument>>();

/** Parses a PDF once and reuses it, so a file used in several merge parts loads once. */
function openSource(uri: string) {
  let pdf = opened.get(uri);
  if (!pdf) {
    pdf = readFileBytes(uri).then(loadPdf);
    // Allow a retry after a failure (e.g. a damaged file).
    pdf.catch(() => opened.delete(uri));
    opened.set(uri, pdf);
  }
  return pdf;
}

export async function pageCountOf(uri: string) {
  return (await openSource(uri)).getPageCount();
}

/** Frees parsed PDFs once the tool screen is closed. */
export function releaseSources() {
  opened.clear();
}

/** Lets the progress overlay paint before the CPU-heavy work starts. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 60));

export async function mergeToLibrary(
  parts: { uri: string; indices: number[] }[],
  name: string,
): Promise<PdfDocument> {
  await nextFrame();
  const sources = await Promise.all(parts.map((p) => openSource(p.uri)));
  const bytes = await mergeParts(parts.map((p, i) => ({ source: sources[i], indices: p.indices })));
  return createDocument(name, bytes, 'pdf');
}

export async function splitToLibrary(
  uri: string,
  ranges: PageRange[],
  baseName: string,
): Promise<PdfDocument[]> {
  await nextFrame();
  const source = await openSource(uri);
  const created: PdfDocument[] = [];
  await splitByRanges(source, ranges, async (range, bytes) => {
    created.push(await createDocument(`${baseName} (pages ${formatRange(range)})`, bytes, 'pdf'));
  });
  return created;
}

export async function extractToLibrary(uri: string, indices: number[], name: string) {
  await nextFrame();
  const bytes = await mergeParts([{ source: await openSource(uri), indices }]);
  return createDocument(name, bytes, 'pdf');
}
