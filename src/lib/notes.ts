/**
 * Quick notes and to-do lists, stored on the device in a JSON file.
 *
 * Notes are kept in memory and written back (debounced) on every change.
 * Screens subscribe with `useNotes`, so the list and the editor stay in sync.
 */

import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { makeId } from '@/lib/editor/types';

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Note = {
  id: string;
  kind: 'note' | 'checklist';
  title: string;
  /** Text of a plain note. */
  body: string;
  /** Items of a checklist. */
  items: ChecklistItem[];
  pinned: boolean;
  /** Card color, one of NOTE_COLORS, or null for the default. */
  color: string | null;
  createdAt: number;
  updatedAt: number;
};

export const NOTE_COLORS = ['#FFF4BF', '#FFD9D6', '#D9F2E3', '#D8E8FF', '#EBDDFC'];

const SAVE_DELAY_MS = 300;

let notes: Note[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function storeFile() {
  return new File(Paths.document, 'notes.json');
}

function load() {
  if (loaded) return;
  loaded = true;
  const file = storeFile();
  if (!file.exists) return;
  try {
    notes = JSON.parse(file.textSync()) as Note[];
  } catch {
    notes = [];
  }
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const file = storeFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(notes));
  }, SAVE_DELAY_MS);
}

function update(next: Note[]) {
  notes = next;
  persist();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return notes;
}

/** All notes: pinned first, then most recently edited. */
export function useNotes() {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return [...all].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function useNote(id: string) {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return all.find((note) => note.id === id) ?? null;
}

export function createNote(kind: Note['kind']): Note {
  load();
  const now = Date.now();
  const note: Note = {
    id: makeId('n'),
    kind,
    title: '',
    body: '',
    items: kind === 'checklist' ? [{ id: makeId('i'), text: '', done: false }] : [],
    pinned: false,
    color: null,
    createdAt: now,
    updatedAt: now,
  };
  update([note, ...notes]);
  return note;
}

export function updateNote(id: string, changes: Partial<Omit<Note, 'id' | 'createdAt'>>) {
  load();
  update(
    notes.map((note) => (note.id === id ? { ...note, ...changes, updatedAt: Date.now() } : note)),
  );
}

export function deleteNote(id: string) {
  load();
  update(notes.filter((note) => note.id !== id));
}

/** Removes notes with no content, e.g. after creating one and backing out. */
export function deleteIfEmpty(id: string) {
  load();
  const note = notes.find((n) => n.id === id);
  if (note && !note.title.trim() && !note.body.trim() && note.items.every((i) => !i.text.trim())) {
    deleteNote(id);
  }
}

export function noteMatches(note: Note, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [note.title, note.body, ...note.items.map((i) => i.text)].some((text) =>
    text.toLowerCase().includes(q),
  );
}
