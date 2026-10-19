/**
 * Saved signatures, kept in a JSON file so they can be reused across documents.
 */

import { File, Paths } from 'expo-file-system';

import type { Point } from './editor/types';

export type Signature = {
  id: string;
  /** Points normalized (0..1) within the signature's bounding box. */
  strokes: Point[][];
  /** Width / height of the bounding box. */
  aspect: number;
  /** Stroke width as a fraction of the box height. */
  strokeWidth: number;
  color: string;
};

const MAX_SAVED = 6;

function storeFile() {
  return new File(Paths.document, 'signatures.json');
}

export async function loadSignatures(): Promise<Signature[]> {
  const file = storeFile();
  if (!file.exists) return [];
  try {
    return JSON.parse(await file.text()) as Signature[];
  } catch {
    return [];
  }
}

async function persist(signatures: Signature[]) {
  const file = storeFile();
  if (!file.exists) file.create();
  await file.write(JSON.stringify(signatures));
}

export async function saveSignature(signature: Signature) {
  const existing = await loadSignatures();
  const next = [signature, ...existing].slice(0, MAX_SAVED);
  await persist(next);
  return next;
}

export async function deleteSignature(id: string) {
  const next = (await loadSignatures()).filter((s) => s.id !== id);
  await persist(next);
  return next;
}
