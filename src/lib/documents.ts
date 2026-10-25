/**
 * Local document library. Every document is a plain .pdf, .docx, .xlsx or
 * .pptx file inside `<documents>/pdfs`; the file name doubles as the document id.
 */

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { Platform, TurboModuleRegistry } from 'react-native';

import { BLANK_DOCX, BLANK_PPTX, BLANK_XLSX } from './office/templates';
import { createBlankPdf } from './pdf/pages';

export type DocumentKind = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export const ALL_KINDS: DocumentKind[] = ['pdf', 'docx', 'xlsx', 'pptx'];

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
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const SHARE_UTIS: Record<DocumentKind, string> = {
  pdf: 'com.adobe.pdf',
  docx: 'org.openxmlformats.wordprocessingml.document',
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
  pptx: 'org.openxmlformats.presentationml.presentation',
};

const EXTENSION = /\.(pdf|docx|xlsx|pptx)$/i;

export function kindOf(fileName: string): DocumentKind | null {
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
  // Native streaming copy (also from Android content:// URIs): the file never
  // passes through JS memory, so large files (hundreds of MB) import fine.
  const target = uniqueFile(name, kind);
  const source = new File(sourceUri);
  // A temporary copy made by the picker (iOS cache) is moved rather than copied,
  // so the file doesn't take up storage twice.
  if (sourceUri.startsWith(Paths.cache.uri)) await source.move(target);
  else await source.copy(target);
  return toDocument(target);
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

/**
 * Whether react-native-share's native module is in this build. It is in EAS
 * builds but not in Expo Go, where importing the library would throw.
 */
function hasNativeMultiShare() {
  return TurboModuleRegistry.get('RNShare') != null;
}

/**
 * Shares several documents at once as separate files (EAS builds), or bundled
 * into one zip where only single-file sharing exists (Expo Go).
 */
export async function shareDocuments(docs: PdfDocument[]) {
  if (docs.length === 0) return;
  if (docs.length === 1) return shareDocument(docs[0]);

  if (hasNativeMultiShare()) {
    // react-native-share can only read files from the cache directory on
    // Android, so share copies placed there.
    const dir = new Directory(Paths.cache, 'share');
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });
    const urls: string[] = [];
    for (const doc of docs) {
      const copy = new File(dir, doc.id);
      await new File(doc.uri).copy(copy);
      urls.push(copy.uri);
    }
    const kinds = new Set(docs.map((d) => d.kind));
    const { default: Share } = await import('react-native-share');
    await Share.open({
      urls,
      type: kinds.size === 1 ? MIME_TYPES[docs[0].kind] : '*/*',
      title: `${docs.length} documents`,
      failOnCancel: false,
    });
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  const zip = new JSZip();
  for (const doc of docs) zip.file(doc.id, await new File(doc.uri).bytes());
  const file = new File(Paths.cache, `Documents (${docs.length}).zip`);
  file.create({ overwrite: true });
  await file.write(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: `${docs.length} documents`,
  });
}

/** Shares bytes that are not (yet) in the library, via a temporary file. */
export async function shareBytes(name: string, bytes: Uint8Array, kind: DocumentKind = 'pdf') {
  const file = new File(Paths.cache, `${sanitizeName(name)}.${kind}`);
  file.create({ overwrite: true });
  await file.write(bytes);
  await shareDocument(toDocument(file));
}

const BLANK_NAMES: Record<DocumentKind, string> = {
  pdf: 'Untitled PDF',
  docx: 'Untitled document',
  xlsx: 'Untitled workbook',
  pptx: 'Untitled presentation',
};

/** Creates an empty document of the given kind in the library. */
export async function createBlankDocument(kind: DocumentKind): Promise<PdfDocument> {
  const bytes =
    kind === 'pdf'
      ? await createBlankPdf()
      : base64ToBytes({ docx: BLANK_DOCX, xlsx: BLANK_XLSX, pptx: BLANK_PPTX }[kind]);
  return createDocument(BLANK_NAMES[kind], bytes, kind);
}

/** Route of the editor for a document. */
export function editorRouteFor(doc: PdfDocument) {
  const pathname = {
    pdf: '/editor/[id]',
    docx: '/word/[id]',
    xlsx: '/excel/[id]',
    pptx: '/powerpoint/[id]',
  }[doc.kind] as '/editor/[id]';
  return { pathname, params: { id: doc.id } };
}

function containsAscii(bytes: Uint8Array, text: string) {
  const first = text.charCodeAt(0);
  outer: for (let i = 0; i <= bytes.length - text.length; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < text.length; j++) if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/**
 * Works out a file's kind from its name, or else its contents: PDFs start with
 * "%PDF", and Office files are zips whose entry names (stored as plain text)
 * reveal the type. Files shared from other apps often have meaningless names.
 */
export function detectKind(name: string, bytes: Uint8Array): DocumentKind | null {
  const fromName = kindOf(name);
  if (fromName) return fromName;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (containsAscii(bytes, 'word/document.xml')) return 'docx';
    if (containsAscii(bytes, 'xl/workbook.xml')) return 'xlsx';
    if (containsAscii(bytes, 'ppt/presentation.xml')) return 'pptx';
  }
  return null;
}

/** Imports a file another app opened with this one (e.g. "Open with" from WhatsApp). */
export async function importSharedFile(uri: string): Promise<PdfDocument> {
  const file = new File(uri);
  let name = '';
  try {
    name = decodeURIComponent(file.name);
  } catch {
    name = file.name;
  }
  // Only read the contents when the name doesn't tell the type (large files
  // with a proper extension are copied without being loaded into memory).
  const kind = kindOf(name) ?? detectKind(name, await file.bytes());
  if (!kind)
    throw new Error('This file type is not supported. Open a PDF, Word, Excel or PowerPoint file.');
  const base = name.replace(EXTENSION, '').replace(/^\d+$/, '') || 'Shared document';
  return importDocument(uri, base, kind);
}

/** Files above this size are too large for the editor's viewer; Merge and Split still work. */
export const LARGE_PDF_BYTES = 80 * 1024 * 1024;

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
