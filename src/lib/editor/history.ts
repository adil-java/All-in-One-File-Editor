import { useCallback, useReducer } from 'react';

import { type Annotation, type EditorPage, makeId, type Rotation } from './types';

export type EditorAction =
  | { type: 'reset'; pages: EditorPage[] }
  | { type: 'add-annotation'; pageKey: string; annotation: Annotation }
  | { type: 'add-annotations'; pageKey: string; annotations: Annotation[] }
  | { type: 'replace-annotation'; pageKey: string; annotation: Annotation }
  | { type: 'remove-annotation'; pageKey: string; id: string }
  | { type: 'clear-page'; pageKey: string }
  | { type: 'rotate-page'; pageKey: string; delta: 90 | -90 }
  | { type: 'delete-page'; pageKey: string }
  | { type: 'duplicate-page'; pageKey: string }
  | { type: 'move-page'; from: number; to: number }
  | { type: 'insert-pages'; index: number; pages: EditorPage[] };

type History = {
  past: EditorPage[][];
  present: EditorPage[];
  future: EditorPage[][];
  /** The `present` value that was last saved to disk. */
  saved: EditorPage[];
};

type HistoryAction = EditorAction | { type: 'undo' } | { type: 'redo' } | { type: 'mark-saved' };

const MAX_HISTORY = 100;

export function pagesFromSource(pageCount: number): EditorPage[] {
  return Array.from({ length: pageCount }, (_, i) => ({
    key: makeId('p'),
    sourceIndex: i,
    rotation: 0,
    annotations: [],
  }));
}

function updatePage(pages: EditorPage[], key: string, update: (page: EditorPage) => EditorPage) {
  return pages.map((page) => (page.key === key ? update(page) : page));
}

function apply(pages: EditorPage[], action: EditorAction): EditorPage[] {
  switch (action.type) {
    case 'reset':
      return action.pages;
    case 'add-annotation':
      return updatePage(pages, action.pageKey, (p) => ({
        ...p,
        annotations: [...p.annotations, action.annotation],
      }));
    case 'add-annotations':
      return updatePage(pages, action.pageKey, (p) => ({
        ...p,
        annotations: [...p.annotations, ...action.annotations],
      }));
    case 'replace-annotation':
      return updatePage(pages, action.pageKey, (p) => ({
        ...p,
        annotations: p.annotations.map((a) =>
          a.id === action.annotation.id ? action.annotation : a,
        ),
      }));
    case 'remove-annotation':
      return updatePage(pages, action.pageKey, (p) => ({
        ...p,
        annotations: p.annotations.filter((a) => a.id !== action.id),
      }));
    case 'clear-page':
      return updatePage(pages, action.pageKey, (p) => ({ ...p, annotations: [] }));
    case 'rotate-page':
      return updatePage(pages, action.pageKey, (p) => ({
        ...p,
        rotation: ((p.rotation + action.delta + 360) % 360) as Rotation,
      }));
    case 'delete-page':
      return pages.length > 1 ? pages.filter((p) => p.key !== action.pageKey) : pages;
    case 'duplicate-page': {
      const index = pages.findIndex((p) => p.key === action.pageKey);
      if (index < 0) return pages;
      const copy: EditorPage = {
        ...pages[index],
        key: makeId('p'),
        annotations: pages[index].annotations.map((a) => ({ ...a, id: makeId() })),
      };
      return [...pages.slice(0, index + 1), copy, ...pages.slice(index + 1)];
    }
    case 'move-page': {
      if (action.to < 0 || action.to >= pages.length) return pages;
      const next = [...pages];
      const [moved] = next.splice(action.from, 1);
      next.splice(action.to, 0, moved);
      return next;
    }
    case 'insert-pages':
      return [...pages.slice(0, action.index), ...action.pages, ...pages.slice(action.index)];
  }
}

function reducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'undo':
      if (state.past.length === 0) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    case 'redo':
      if (state.future.length === 0) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    case 'mark-saved':
      return { ...state, saved: state.present };
    case 'reset':
      return { past: [], present: action.pages, future: [], saved: action.pages };
    default: {
      const next = apply(state.present, action);
      if (next === state.present) return state;
      return {
        ...state,
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: [],
      };
    }
  }
}

export function useEditorHistory() {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: [],
    future: [],
    saved: [],
  });

  return {
    pages: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: state.present !== state.saved,
    dispatch: dispatch as (action: EditorAction) => void,
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    markSaved: useCallback(() => dispatch({ type: 'mark-saved' }), []),
  };
}
