/**
 * Structural edits to the source PDF. The source is only ever appended to,
 * so existing page indices referenced by the editor stay valid.
 */

import { PDFDocument } from 'pdf-lib';

/** A4 in PDF points. */
export const A4 = { width: 595.28, height: 841.89 };

export async function createBlankPdf(size = A4): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([size.width, size.height]);
  return doc.save();
}

export async function appendBlankPage(sourceBase64: string, size = A4) {
  const doc = await PDFDocument.load(sourceBase64, { ignoreEncryption: true });
  doc.addPage([size.width, size.height]);
  return { base64: await doc.saveAsBase64(), index: doc.getPageCount() - 1 };
}

/** Appends every page of `otherBase64` to the source. */
export async function appendDocument(sourceBase64: string, otherBase64: string) {
  const doc = await PDFDocument.load(sourceBase64, { ignoreEncryption: true });
  const other = await PDFDocument.load(otherBase64, { ignoreEncryption: true });
  const startIndex = doc.getPageCount();
  const copied = await doc.copyPages(other, other.getPageIndices());
  copied.forEach((page) => doc.addPage(page));
  return { base64: await doc.saveAsBase64(), startIndex, count: copied.length };
}
