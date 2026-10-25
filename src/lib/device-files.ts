/**
 * Android "All files access": lets the app find documents anywhere in the phone's
 * storage (Download, WhatsApp, Documents, ...) instead of only through the picker.
 * Android 11+ grants it on a system settings page; older versions use the
 * READ_EXTERNAL_STORAGE runtime permission. iOS has no equivalent.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { PermissionsAndroid, Platform } from 'react-native';

import { type DocumentKind, kindOf } from '@/lib/documents';
import DeviceDocuments from '../../modules/device-documents';

const STORAGE_ROOT = 'file:///storage/emulated/0';

export type DeviceFile = {
  uri: string;
  name: string;
  /** Folder path below the storage root, e.g. "Download" or "Android/media/com.whatsapp/...". */
  folder: string;
  kind: DocumentKind;
  size: number;
  modified: number;
};

export const storageAccessSupported = Platform.OS === 'android';

/**
 * Expo Go's own manifest doesn't declare MANAGE_EXTERNAL_STORAGE, so Android
 * greys out its "All files access" switch. Access works in an installed build.
 */
export const runningInExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Android 11 (API 30) moved broad file access to the "All files access" setting. */
export const usesAllFilesAccess = Platform.OS === 'android' && Number(Platform.Version) >= 30;

export async function hasStorageAccess(): Promise<boolean> {
  if (!storageAccessSupported) return false;
  if (!usesAllFilesAccess) {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  }
  // Without All files access, apps can't write to the storage root, so creating
  // a probe file there tells whether the setting is on.
  try {
    new Directory(STORAGE_ROOT).createFile('.pdfeditor-access-check', 'text/plain').delete();
    return true;
  } catch {
    return false;
  }
}

/** Asks for access and resolves with whether it was granted. */
export async function requestStorageAccess(): Promise<boolean> {
  if (!storageAccessSupported) return false;
  if (!usesAllFilesAccess) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const appPackage = Constants.expoConfig?.android?.package;
  try {
    // Opens this app's own switch; resolves when the user comes back.
    await startActivityAsync(ActivityAction.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, {
      data: `package:${appPackage}`,
    });
  } catch {
    // Some phones only offer the list of all apps.
    await startActivityAsync(ActivityAction.MANAGE_ALL_FILES_ACCESS_PERMISSION);
  }
  return hasStorageAccess();
}

const askedFlag = () => new File(Paths.document, 'storage-access-asked');

/** Whether the first-launch access page has been shown already. */
export function storageAccessAsked() {
  return askedFlag().exists;
}

export function markStorageAccessAsked() {
  const flag = askedFlag();
  if (!flag.exists) flag.create();
}

const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx'];

/**
 * Folders where documents usually are, for when the MediaStore index isn't
 * available. Walking all of storage visits every photo folder and takes minutes.
 */
const COMMON_FOLDERS = [
  'Download',
  'Documents',
  'Bluetooth',
  'Telegram',
  'WhatsApp/Media/WhatsApp Documents',
  'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents',
  'Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents',
  'Android/media/org.telegram.messenger/Telegram/Telegram Documents',
];

/** "Download/Invoices" for a path or URI under the storage root. */
function folderOf(location: string) {
  const path = decodeURIComponent(location.replace(/^file:\/\//, ''));
  const relative = path.slice('/storage/emulated/0/'.length);
  const folder = relative.slice(0, Math.max(0, relative.lastIndexOf('/')));
  return folder || 'Phone storage';
}

/** Asks Android's MediaStore, which has every file in shared storage indexed. */
async function listFromIndex(): Promise<DeviceFile[]> {
  const indexed = await DeviceDocuments!.listDocuments(DOCUMENT_EXTENSIONS);
  const files: DeviceFile[] = [];
  for (const doc of indexed) {
    const kind = kindOf(doc.name);
    if (!kind) continue;
    files.push({
      uri: doc.uri,
      name: doc.name,
      folder: doc.path ? folderOf(doc.path) : 'Phone storage',
      kind,
      size: doc.size,
      modified: doc.modified,
    });
  }
  return files;
}

/** Walks the common document folders, a few levels deep. */
async function listFromCommonFolders(): Promise<DeviceFile[]> {
  const found: DeviceFile[] = [];
  const queue = COMMON_FOLDERS.map((folder) => ({ uri: `${STORAGE_ROOT}/${folder}`, depth: 0 }));
  while (queue.length) {
    const { uri, depth } = queue.shift()!;
    let entries: (File | Directory)[];
    try {
      entries = new Directory(uri).list();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry instanceof Directory) {
        if (depth < 3) queue.push({ uri: entry.uri.replace(/\/$/, ''), depth: depth + 1 });
        continue;
      }
      const kind = kindOf(entry.name);
      if (!kind || entry.size === 0) continue;
      found.push({
        uri: entry.uri,
        name: entry.name,
        folder: folderOf(entry.uri),
        kind,
        size: entry.size,
        modified: entry.modificationTime ?? 0,
      });
    }
    // Lets the screen update between folders.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return found.sort((a, b) => b.modified - a.modified);
}

const cacheFile = () => new File(Paths.cache, 'device-files.json');

/** The last list found, so the tab shows files immediately while it refreshes. */
export function cachedDeviceFiles(): DeviceFile[] | null {
  try {
    const file = cacheFile();
    return file.exists ? (JSON.parse(file.textSync()) as DeviceFile[]) : null;
  } catch {
    return null;
  }
}

/** Finds PDF, Word, Excel and PowerPoint files on the phone, newest first. */
export async function findDeviceFiles(): Promise<DeviceFile[]> {
  const files = DeviceDocuments ? await listFromIndex() : await listFromCommonFolders();
  try {
    const file = cacheFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(files));
  } catch {
    // The cache only speeds up the next visit.
  }
  return files;
}

/** The file's own folder name for display, e.g. "Download" or "WhatsApp Documents". */
export function shortFolder(folder: string) {
  return folder.split('/').pop() || folder;
}
