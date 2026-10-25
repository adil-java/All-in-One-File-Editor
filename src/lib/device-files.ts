/**
 * Android "All files access": lets the app find documents anywhere in the phone's
 * storage (Download, WhatsApp, Documents, ...) instead of only through the picker.
 * Android 11+ grants it on a system settings page; older versions use the
 * READ_EXTERNAL_STORAGE runtime permission. iOS has no equivalent.
 */

import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { PermissionsAndroid, Platform } from 'react-native';

import { type DocumentKind, kindOf } from '@/lib/documents';

const STORAGE_ROOT = 'file:///storage/emulated/0';

/** Folders that hold app data or caches rather than the user's documents. */
const SKIPPED_FOLDERS = new Set(['Android', 'LOST.DIR']);

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

/** Lets the list render between folders while a large storage is scanned. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Finds PDF, Word, Excel and PowerPoint files in shared storage, newest first.
 * WhatsApp's documents live under Android/media, so that folder is scanned even
 * though the rest of Android/ is skipped.
 */
export async function scanDeviceFiles(onProgress?: (found: number) => void) {
  const found: DeviceFile[] = [];
  const queue: string[] = [STORAGE_ROOT, `${STORAGE_ROOT}/Android/media`];
  let visited = 0;

  while (queue.length) {
    const uri = queue.shift()!;
    let entries: (File | Directory)[];
    try {
      entries = new Directory(uri).list();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry instanceof Directory) {
        if (uri === STORAGE_ROOT && SKIPPED_FOLDERS.has(entry.name)) continue;
        queue.push(entry.uri.replace(/\/$/, ''));
        continue;
      }
      const kind = kindOf(entry.name);
      if (!kind || entry.size === 0) continue;
      found.push({
        uri: entry.uri,
        name: entry.name,
        folder: decodeURIComponent(uri.slice(STORAGE_ROOT.length + 1)) || 'Phone storage',
        kind,
        size: entry.size,
        modified: entry.modificationTime ?? 0,
      });
    }
    if (++visited % 40 === 0) {
      onProgress?.(found.length);
      await breathe();
    }
  }
  return found.sort((a, b) => b.modified - a.modified);
}

/** The file's own folder name for display, e.g. "Download" or "WhatsApp Documents". */
export function shortFolder(folder: string) {
  return folder.split('/').pop() || folder;
}
