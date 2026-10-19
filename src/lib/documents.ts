/**
 * Local PDF library. Every document is a plain .pdf file inside
 * `<documents>/pdfs`; the file name doubles as the document id.
 */

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

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

/**
 * Lets the user pick PDFs from the system file picker. Returns an empty list if canceled.
 *
 * On Android the picker's cache copy lives outside the directories Expo Go lets
 * expo-file-system read ("Missing 'READ' permission"), so the original content://
 * URI is used instead; content URIs are readable through `File`.
 */
export async function pickPdfs({ multiple = false } = {}) {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: Platform.OS !== 'android',
    multiple,
  });
  return result.canceled ? [] : result.assets.map(({ uri, name }) => ({ uri, name }));
}

/** Copies a picked file into the library. */
export async function importDocument(sourceUri: string, name: string): Promise<PdfDocument> {
  // Read and write rather than File.copy, which cannot copy from content:// URIs.
  return createDocument(name, await new File(sourceUri).bytes());
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

/** Shares bytes that are not (yet) in the library, via a temporary file. */
export async function shareBytes(name: string, bytes: Uint8Array) {
  const file = new File(Paths.cache, `${sanitizeName(name)}.pdf`);
  file.create({ overwrite: true });
  await file.write(bytes);
  await shareDocument(toDocument(file));
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
