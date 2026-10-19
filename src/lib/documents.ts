/**
 * Local PDF library. Every document is a plain .pdf file inside
 * `<documents>/pdfs`; the file name doubles as the document id.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type PdfDocument = {
  id: string;
  name: string;
  uri: string;
  size: number;
  modifiedAt: number;
};

function libraryDir() {
  const dir = new Directory(Paths.document, 'pdfs');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function toDocument(file: File): PdfDocument {
  return {
    id: file.name,
    name: file.name.replace(/\.pdf$/i, ''),
    uri: file.uri,
    size: file.size,
    modifiedAt: file.modificationTime ?? 0,
  };
}

function sanitizeName(name: string) {
  const cleaned = name
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim();
  return cleaned || 'Untitled';
}

/** Returns a file in the library named `name.pdf`, suffixed with a counter if taken. */
function uniqueFile(name: string) {
  const dir = libraryDir();
  const base = sanitizeName(name);
  let candidate = new File(dir, `${base}.pdf`);
  for (let i = 2; candidate.exists; i++) {
    candidate = new File(dir, `${base} (${i}).pdf`);
  }
  return candidate;
}

export function listDocuments(): PdfDocument[] {
  return libraryDir()
    .list()
    .filter((item): item is File => item instanceof File && /\.pdf$/i.test(item.name))
    .map(toDocument)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function getDocument(id: string): PdfDocument | null {
  const file = new File(libraryDir(), id);
  return file.exists ? toDocument(file) : null;
}

/** Copies a picked file (e.g. from the document picker cache) into the library. */
export async function importDocument(sourceUri: string, name: string): Promise<PdfDocument> {
  const target = uniqueFile(name);
  await new File(sourceUri).copy(target);
  return toDocument(target);
}

export async function createDocument(name: string, bytes: Uint8Array): Promise<PdfDocument> {
  const target = uniqueFile(name);
  target.create();
  await target.write(bytes);
  return toDocument(target);
}

export async function overwriteDocument(id: string, bytes: Uint8Array): Promise<PdfDocument> {
  const file = new File(libraryDir(), id);
  await file.write(bytes);
  return toDocument(file);
}

export async function readDocumentBase64(id: string): Promise<string> {
  return new File(libraryDir(), id).base64();
}

export async function readDocumentBytes(id: string): Promise<Uint8Array> {
  return new File(libraryDir(), id).bytes();
}

export async function renameDocument(id: string, newName: string): Promise<PdfDocument> {
  const file = new File(libraryDir(), id);
  if (sanitizeName(newName) === file.name.replace(/\.pdf$/i, '')) return toDocument(file);
  const target = uniqueFile(newName);
  await file.move(target);
  return toDocument(file);
}

export async function duplicateDocument(id: string): Promise<PdfDocument> {
  const file = new File(libraryDir(), id);
  const target = uniqueFile(`${file.name.replace(/\.pdf$/i, '')} copy`);
  await file.copy(target);
  return toDocument(target);
}

export function deleteDocument(id: string) {
  const file = new File(libraryDir(), id);
  if (file.exists) file.delete();
}

export async function shareDocument(doc: PdfDocument) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(doc.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: doc.name,
  });
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
