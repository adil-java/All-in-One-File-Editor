import { memo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, { Ellipse, G, Image, Line, Path, Rect, Text } from 'react-native-svg';

import {
  baseToDisplayTransform,
  BASELINE,
  bounds,
  isResizable,
  LINE_HEIGHT,
  textLines,
} from '@/lib/editor/geometry';
import { arrowHead, denormalize, inkPath } from '@/lib/editor/paths';
import type { Annotation, Rect as Box, Rotation, TextFont } from '@/lib/editor/types';

// Screen fonts matching the standard PDF fonts used on export.
const FONT_FAMILIES: Record<TextFont, string | undefined> = {
  sans: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  serif: Platform.select({ ios: 'Times New Roman', default: 'serif' }),
  mono: Platform.select({ ios: 'Courier', default: 'monospace' }),
};

type Props = {
  annotations: Annotation[];
  /** Annotation being drawn right now, not yet committed. */
  draft?: Annotation | null;
  selectedId?: string | null;
  /** Faint boxes drawn under annotations, e.g. editable text in the PDF. */
  hints?: Box[];
  /** Base page size in points. */
  base: { width: number; height: number };
  rotation: Rotation;
  /** On-screen size in pixels. */
  width: number;
  height: number;
};

export function AnnotationLayer({
  annotations,
  draft,
  selectedId,
  hints,
  base,
  rotation,
  width,
  height,
}: Props) {
  const display =
    rotation === 90 || rotation === 270
      ? { w: base.height, h: base.width }
      : { w: base.width, h: base.height };
  const pointsPerPixel = display.w / width;
  const selected = annotations.find((a) => a.id === selectedId);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${display.w} ${display.h}`}
      style={StyleSheet.absoluteFill}
      pointerEvents="none">
      <G transform={baseToDisplayTransform(base, rotation)}>
        {hints?.map((h, i) => (
          <Rect
            key={`hint${i}`}
            x={h.x}
            y={h.y}
            width={h.w}
            height={h.h}
            fill="rgba(47,111,237,0.12)"
            stroke="rgba(47,111,237,0.5)"
            strokeWidth={0.5}
          />
        ))}
        {annotations.map((a) => (
          <AnnotationShape key={a.id} annotation={a} />
        ))}
        {draft && <AnnotationShape annotation={draft} />}
        {selected && <SelectionOutline annotation={selected} pointsPerPixel={pointsPerPixel} />}
      </G>
    </Svg>
  );
}

const AnnotationShape = memo(function AnnotationShape({
  annotation: a,
}: {
  annotation: Annotation;
}) {
  switch (a.type) {
    case 'ink':
      return (
        <Path
          d={inkPath(a.points)}
          stroke={a.color}
          strokeWidth={a.width}
          strokeOpacity={a.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'rect':
      return (
        <Rect
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          stroke={a.strokeWidth > 0 ? a.color : 'none'}
          strokeWidth={a.strokeWidth}
          fill={a.fill ?? 'none'}
          opacity={a.opacity}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          cx={a.x + a.w / 2}
          cy={a.y + a.h / 2}
          rx={a.w / 2}
          ry={a.h / 2}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          fill={a.fill ?? 'none'}
          opacity={a.opacity}
        />
      );
    case 'line': {
      const [left, right] = arrowHead(a.from, a.to, a.strokeWidth);
      return (
        <G
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round">
          <Line x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
          {a.arrow && (
            <Path
              d={`M ${left.x} ${left.y} L ${a.to.x} ${a.to.y} L ${right.x} ${right.y}`}
              fill="none"
            />
          )}
        </G>
      );
    }
    case 'text':
      return (
        <G>
          {textLines(a.text).map((line, i) => (
            <Text
              key={i}
              x={a.x}
              y={a.y + a.fontSize * (BASELINE + i * LINE_HEIGHT)}
              fontSize={a.fontSize}
              fontFamily={FONT_FAMILIES[a.font ?? 'sans']}
              fontWeight={a.bold ? 'bold' : 'normal'}
              fontStyle={a.italic ? 'italic' : 'normal'}
              fill={a.color}>
              {line}
            </Text>
          ))}
        </G>
      );
    case 'image':
      return (
        <Image
          href={{ uri: a.uri }}
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          preserveAspectRatio="none"
        />
      );
    case 'signature':
      return (
        <G
          stroke={a.color}
          strokeWidth={a.strokeWidth * a.h}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none">
          {a.strokes.map((stroke, i) => (
            <Path key={i} d={inkPath(stroke.map((p) => denormalize(p, a)))} />
          ))}
        </G>
      );
  }
});

/** Size of the resize handle, in screen pixels. */
export const HANDLE_SIZE = 22;

function SelectionOutline({
  annotation,
  pointsPerPixel,
}: {
  annotation: Annotation;
  pointsPerPixel: number;
}) {
  const b = bounds(annotation);
  const pad = 4 * pointsPerPixel;
  const handle = HANDLE_SIZE * pointsPerPixel;
  return (
    <G>
      <Rect
        x={b.x - pad}
        y={b.y - pad}
        width={b.w + pad * 2}
        height={b.h + pad * 2}
        stroke="#2F6FED"
        strokeWidth={1.5 * pointsPerPixel}
        strokeDasharray={[6 * pointsPerPixel, 4 * pointsPerPixel]}
        fill="rgba(47,111,237,0.06)"
      />
      {isResizable(annotation) && (
        <Rect
          x={b.x + b.w + pad - handle / 2}
          y={b.y + b.h + pad - handle / 2}
          width={handle}
          height={handle}
          rx={handle / 2}
          fill="#2F6FED"
          stroke="#fff"
          strokeWidth={2 * pointsPerPixel}
        />
      )}
    </G>
  );
}
