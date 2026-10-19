import { memo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  GestureStateManager,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';

import { AnnotationLayer, HANDLE_SIZE } from '@/components/editor/annotation-layer';
import { PageView } from '@/components/editor/page-view';
import {
  bounds,
  displayToBase,
  findAnnotationAt,
  isResizable,
  normalizeRect,
  resize,
  rotatedSize,
  translate,
} from '@/lib/editor/geometry';
import type { EditorAction } from '@/lib/editor/history';
import { isDrawingTool, type ToolSettings } from '@/lib/editor/tools';
import {
  type Annotation,
  type EditorPage,
  makeId,
  type Point,
  type TextAnnotation,
  type Tool,
} from '@/lib/editor/types';
import type { PageInfo } from '@/lib/pdf-renderer/use-pdf-renderer';

export type TextRequest =
  | { pageKey: string; point: Point }
  | { pageKey: string; annotation: TextAnnotation };

type Props = {
  page: EditorPage;
  info: PageInfo;
  /** On-screen width in pixels. */
  width: number;
  tool: Tool;
  settings: ToolSettings;
  /** Id of the selected annotation if it is on this page. */
  selectedId: string | null;
  onSelect: (pageKey: string, id: string | null) => void;
  onTextRequest: (request: TextRequest) => void;
  dispatch: (action: EditorAction) => void;
};

/** Touch slop for hit testing, in screen pixels. */
const TOUCH_SLOP = 10;
const MIN_SHAPE_SIZE = 3;

type GestureState = {
  mode: 'draw' | 'move' | 'resize';
  start: Point;
  points: Point[];
  original: Annotation | null;
  draft: Annotation | null;
};

export const PageEditor = memo(function PageEditor({
  page,
  info,
  width,
  tool,
  settings,
  selectedId,
  onSelect,
  onTextRequest,
  dispatch,
}: Props) {
  const display = rotatedSize(info.width, info.height, page.rotation);
  const height = (width * display.height) / display.width;
  const pointsPerPixel = display.width / width;
  const slop = TOUCH_SLOP * pointsPerPixel;
  const selected = page.annotations.find((a) => a.id === selectedId) ?? null;

  // `editing` marks a moved/resized copy of an existing annotation.
  const [draft, setDraft] = useState<{ annotation: Annotation; editing: boolean } | null>(null);
  const gesture = useRef<GestureState>({
    mode: 'draw',
    start: { x: 0, y: 0 },
    points: [],
    original: null,
    draft: null,
  });

  const toBase = (x: number, y: number) =>
    displayToBase({ x: x * pointsPerPixel, y: y * pointsPerPixel }, info, page.rotation);

  const updateDraft = (next: Annotation | null) => {
    gesture.current.draft = next;
    setDraft(next && { annotation: next, editing: gesture.current.original !== null });
  };

  const erase = (p: Point) => {
    const hit = findAnnotationAt(page.annotations, p, slop);
    if (hit) dispatch({ type: 'remove-annotation', pageKey: page.key, id: hit.id });
  };

  const isOnResizeHandle = (p: Point) => {
    if (!selected || !isResizable(selected)) return false;
    const b = bounds(selected);
    const corner = { x: b.x + b.w, y: b.y + b.h };
    return Math.hypot(p.x - corner.x, p.y - corner.y) <= HANDLE_SIZE * pointsPerPixel;
  };

  const buildDraft = (from: Point, to: Point): Annotation | null => {
    const id = makeId();
    const { color, size } = settings;
    switch (tool) {
      case 'pen':
      case 'highlighter':
        return {
          id,
          type: 'ink',
          points: gesture.current.points,
          color,
          width: size,
          opacity: tool === 'highlighter' ? 0.4 : 1,
        };
      case 'rect':
      case 'ellipse':
        return {
          id,
          type: tool,
          ...normalizeRect(from, to),
          color,
          strokeWidth: size,
          fill: null,
          opacity: 1,
        };
      case 'whiteout':
        return {
          id,
          type: 'rect',
          ...normalizeRect(from, to),
          color: '#FFFFFF',
          strokeWidth: 0,
          fill: '#FFFFFF',
          opacity: 1,
        };
      case 'line':
      case 'arrow':
        return { id, type: 'line', from, to, color, strokeWidth: size, arrow: tool === 'arrow' };
      default:
        return null;
    }
  };

  const isTooSmall = (a: Annotation) => {
    if (a.type === 'rect' || a.type === 'ellipse')
      return a.w < MIN_SHAPE_SIZE || a.h < MIN_SHAPE_SIZE;
    if (a.type === 'line') return Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) < MIN_SHAPE_SIZE;
    return false;
  };

  const drawPan = usePanGesture({
    runOnJS: true,
    enabled: isDrawingTool(tool),
    maxPointers: 1,
    minDistance: 2,
    onBegin: (e) => {
      const p = toBase(e.x, e.y);
      gesture.current = { mode: 'draw', start: p, points: [p], original: null, draft: null };
      if (tool === 'eraser') erase(p);
    },
    onUpdate: (e) => {
      const p = toBase(e.x, e.y);
      if (tool === 'eraser') return erase(p);
      gesture.current.points = [...gesture.current.points, p];
      updateDraft(buildDraft(gesture.current.start, p));
    },
    onFinalize: () => {
      const finished = gesture.current.draft;
      if (finished && !isTooSmall(finished)) {
        dispatch({ type: 'add-annotation', pageKey: page.key, annotation: finished });
      }
      updateDraft(null);
    },
  });

  // Moves or resizes annotations. Activates only when the touch lands on an
  // annotation, so touches elsewhere fall through to page scrolling.
  const selectPan = usePanGesture({
    runOnJS: true,
    enabled: tool === 'select',
    manualActivation: true,
    maxPointers: 1,
    onTouchesDown: (e) => {
      const touch = e.allTouches[0];
      const p = toBase(touch.x, touch.y);
      if (isOnResizeHandle(p)) {
        gesture.current = { mode: 'resize', start: p, points: [], original: selected, draft: null };
        GestureStateManager.activate(e.handlerTag);
        return;
      }
      const hit = findAnnotationAt(page.annotations, p, slop);
      if (!hit) {
        GestureStateManager.fail(e.handlerTag);
        return;
      }
      gesture.current = { mode: 'move', start: p, points: [], original: hit, draft: null };
      onSelect(page.key, hit.id);
      GestureStateManager.activate(e.handlerTag);
    },
    onUpdate: (e) => {
      const { original, start, mode } = gesture.current;
      if (!original) return;
      const p = toBase(e.x, e.y);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      updateDraft(mode === 'resize' ? resize(original, dx, dy) : translate(original, dx, dy));
    },
    onFinalize: () => {
      const finished = gesture.current.draft;
      if (finished)
        dispatch({ type: 'replace-annotation', pageKey: page.key, annotation: finished });
      gesture.current.original = null;
      updateDraft(null);
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    enabled: tool === 'select' || tool === 'text',
    onActivate: (e) => {
      const p = toBase(e.x, e.y);
      const hit = findAnnotationAt(page.annotations, p, slop);
      if (tool === 'select') {
        onSelect(page.key, hit?.id ?? null);
      } else if (hit?.type === 'text') {
        onTextRequest({ pageKey: page.key, annotation: hit });
      } else {
        onTextRequest({ pageKey: page.key, point: { x: p.x, y: p.y - settings.size * 0.6 } });
      }
    },
  });

  const gestures = useSimultaneousGestures(drawPan, selectPan, tap);

  // While moving/resizing, show the draft in place of the original annotation.
  const editing = draft?.editing ? draft.annotation : null;
  const annotations = editing
    ? page.annotations.map((a) => (a.id === editing.id ? editing : a))
    : page.annotations;

  return (
    <GestureDetector gesture={gestures}>
      <View>
        <PageView
          sourceIndex={page.sourceIndex}
          rotation={page.rotation}
          width={width}
          height={height}>
          <AnnotationLayer
            annotations={annotations}
            draft={editing ? null : draft?.annotation}
            selectedId={tool === 'select' ? selectedId : null}
            base={info}
            rotation={page.rotation}
            width={width}
            height={height}
          />
        </PageView>
      </View>
    </GestureDetector>
  );
});
