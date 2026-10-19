import { memo, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { AnnotationLayer } from '@/components/editor/annotation-layer';
import { PageView } from '@/components/editor/page-view';
import { displayToBase, findAnnotationAt, normalizeRect, rotatedSize } from '@/lib/editor/geometry';
import type { EditorAction } from '@/lib/editor/history';
import { isDrawingTool, type ToolSettings } from '@/lib/editor/tools';
import {
  type Annotation,
  type EditorPage,
  makeId,
  type Point,
  type Tool,
} from '@/lib/editor/types';
import type { PageInfo } from '@/lib/pdf-renderer/use-pdf-renderer';

type Props = {
  page: EditorPage;
  info: PageInfo;
  /** On-screen width in pixels. */
  width: number;
  tool: Tool;
  settings: ToolSettings;
  dispatch: (action: EditorAction) => void;
};

/** Touch slop for hit testing, in screen pixels. */
const TOUCH_SLOP = 10;
const MIN_SHAPE_SIZE = 3;

export const PageEditor = memo(function PageEditor({
  page,
  info,
  width,
  tool,
  settings,
  dispatch,
}: Props) {
  const display = rotatedSize(info.width, info.height, page.rotation);
  const height = (width * display.height) / display.width;
  const pointsPerPixel = display.width / width;

  const [draft, setDraft] = useState<Annotation | null>(null);
  const gesture = useRef<{ start: Point; points: Point[]; draft: Annotation | null }>({
    start: { x: 0, y: 0 },
    points: [],
    draft: null,
  });

  const toBase = (x: number, y: number) =>
    displayToBase({ x: x * pointsPerPixel, y: y * pointsPerPixel }, info, page.rotation);

  const updateDraft = (next: Annotation | null) => {
    gesture.current.draft = next;
    setDraft(next);
  };

  const erase = (p: Point) => {
    const hit = findAnnotationAt(page.annotations, p, TOUCH_SLOP * pointsPerPixel);
    if (hit) dispatch({ type: 'remove-annotation', pageKey: page.key, id: hit.id });
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

  const pan = usePanGesture({
    runOnJS: true,
    enabled: isDrawingTool(tool),
    maxPointers: 1,
    minDistance: 2,
    onBegin: (e) => {
      const p = toBase(e.x, e.y);
      gesture.current = { start: p, points: [p], draft: null };
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

  return (
    <GestureDetector gesture={pan}>
      <View>
        <PageView
          sourceIndex={page.sourceIndex}
          rotation={page.rotation}
          width={width}
          height={height}>
          <AnnotationLayer
            annotations={page.annotations}
            draft={draft}
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
