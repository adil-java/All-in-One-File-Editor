/**
 * Local document library. Every document is a plain .pdf or .docx file inside
 * `<documents>/pdfs`; the file name doubles as the document id.
 */

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type DocumentKind = 'pdf' | 'docx';

export type PdfDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  uri: string;
  size: number;
  modifiedAt: number;
};

const MIME_TYPES: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const SHARE_UTIS: Record<DocumentKind, string> = {
  pdf: 'com.adobe.pdf',
  docx: 'org.openxmlformats.wordprocessingml.document',
};

const EXTENSION = /\.(pdf|docx)$/i;

function kindOf(fileName: string): DocumentKind | null {
  const match = EXTENSION.exec(fileName);
  return match ? (match[1].toLowerCase() as DocumentKind) : null;
}

function libraryDir() {
  const dir = new Directory(Paths.document, 'pdfs');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function toDocument(file: File): PdfDocument {
  return {
    id: file.name,
    kind: kindOf(file.name) ?? 'pdf',
    name: file.name.replace(EXTENSION, ''),
    uri: file.uri,
    size: file.size,
    modifiedAt: file.modificationTime ?? 0,
  };
}

function sanitizeName(name: string) {
  const cleaned = name
    .replace(EXTENSION, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim();
  return cleaned || 'Untitled';
}

/** Returns a file in the library named `name.<kind>`, suffixed with a counter if taken. */
function uniqueFile(name: string, kind: DocumentKind) {
  const dir = libraryDir();
  const base = sanitizeName(name);
  let candidate = new File(dir, `${base}.${kind}`);
  for (let i = 2; candidate.exists; i++) {
    candidate = new File(dir, `${base} (${i}).${kind}`);
  }
  return candidate;
}

export function listDocuments(): PdfDocument[] {
  return libraryDir()
    .list()
    .filter((item): item is File => item instanceof File && kindOf(item.name) !== null)
    .map(toDocument)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function getDocument(id: string): PdfDocument | null {
  const file = new File(libraryDir(), id);
  return file.exists ? toDocument(file) : null;
}

/**
 * Lets the user pick documents of the given kinds from the system file picker.
 * Returns an empty list if canceled.
 *
 * On Android the picker's cache copy lives outside the directories Expo Go lets
 * expo-file-system read ("Missing 'READ' permission"), so the original content://
 * URI is used instead; content URIs are readable through `File`.
 */
export async function pickDocuments({ kinds = ['pdf'] as DocumentKind[], multiple = false } = {}) {
  const result = await DocumentPicker.getDocumentAsync({
    type: kinds.map((kind) => MIME_TYPES[kind]),
    copyToCacheDirectory: Platform.OS !== 'android',
    multiple,
  });
  if (result.canceled) return [];
  return result.assets.map(({ uri, name, mimeType }) => ({
    uri,
    name,
    kind:
      kindOf(name) ??
      (Object.keys(MIME_TYPES) as DocumentKind[]).find((k) => MIME_TYPES[k] === mimeType) ??
      kinds[0],
  }));
}

export function pickPdfs({ multiple = false } = {}) {
  return pickDocuments({ kinds: ['pdf'], multiple });
}

/** Copies a picked file into the library. */
export async function importDocument(
  sourceUri: string,
  name: string,
  kind: DocumentKind = 'pdf',
): Promise<PdfDocument> {
  // Read and write rather than File.copy, which cannot copy from content:// URIs.
  return createDocument(name, await new File(sourceUri).bytes(), kind);
}

export async function createDocument(
  name: string,
  bytes: Uint8Array,
  kind: DocumentKind = 'pdf',
): Promise<PdfDocument> {
  const target = uniqueFile(name, kind);
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
  if (sanitizeName(newName) === file.name.replace(EXTENSION, '')) return toDocument(file);
  const target = uniqueFile(newName, kindOf(file.name) ?? 'pdf');
  await file.move(target);
  return toDocument(file);
}

export async function duplicateDocument(id: string): Promise<PdfDocument> {
  const file = new File(libraryDir(), id);
  const target = uniqueFile(`${file.name.replace(EXTENSION, '')} copy`, kindOf(file.name) ?? 'pdf');
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
    mimeType: MIME_TYPES[doc.kind],
    UTI: SHARE_UTIS[doc.kind],
    dialogTitle: doc.name,
  });
}

/** Shares bytes that are not (yet) in the library, via a temporary file. */
export async function shareBytes(name: string, bytes: Uint8Array, kind: DocumentKind = 'pdf') {
  const file = new File(Paths.cache, `${sanitizeName(name)}.${kind}`);
  file.create({ overwrite: true });
  await file.write(bytes);
  await shareDocument(toDocument(file));
}

/** Decodes base64 (e.g. from a WebView) into bytes. */
export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
