import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { Tool } from './types';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type ToolSettings = { color: string; size: number };

type ToolDefinition = {
  label: string;
  icon: IconName;
  /** Selectable colors; empty when the tool has no color option. */
  colors: string[];
  /** Selectable stroke widths or font sizes, in points. */
  sizes: number[];
  defaults: ToolSettings;
  hint?: string;
};

const INK_COLORS = ['#111111', '#E5383B', '#2F6FED', '#1A9E5C', '#F08C00', '#8E44AD'];
const HIGHLIGHT_COLORS = ['#FFE500', '#7CFC00', '#FF69B4', '#40E0FF', '#FFA500'];

export const TOOLS: Record<Tool, ToolDefinition> = {
  select: {
    label: 'Select',
    icon: 'cursor-default-outline',
    colors: [],
    sizes: [],
    defaults: { color: '#000000', size: 0 },
    hint: 'Tap an annotation to select it, drag to move',
  },
  pen: {
    label: 'Pen',
    icon: 'pen',
    colors: INK_COLORS,
    sizes: [1, 2, 4, 8],
    defaults: { color: '#2F6FED', size: 2 },
  },
  highlighter: {
    label: 'Highlight',
    icon: 'marker',
    colors: HIGHLIGHT_COLORS,
    sizes: [8, 14, 22],
    defaults: { color: '#FFE500', size: 14 },
  },
  text: {
    label: 'Text',
    icon: 'format-text',
    colors: INK_COLORS,
    sizes: [10, 14, 18, 24, 32],
    defaults: { color: '#111111', size: 14 },
    hint: 'Tap on the page to add text',
  },
  'edit-text': {
    label: 'Edit text',
    icon: 'form-textbox',
    colors: [],
    sizes: [],
    defaults: { color: '#000000', size: 0 },
    hint: 'Tap highlighted text in the PDF to change it',
  },
  rect: {
    label: 'Box',
    icon: 'square-outline',
    colors: INK_COLORS,
    sizes: [1, 2, 4],
    defaults: { color: '#E5383B', size: 2 },
  },
  ellipse: {
    label: 'Circle',
    icon: 'circle-outline',
    colors: INK_COLORS,
    sizes: [1, 2, 4],
    defaults: { color: '#E5383B', size: 2 },
  },
  line: {
    label: 'Line',
    icon: 'vector-line',
    colors: INK_COLORS,
    sizes: [1, 2, 4],
    defaults: { color: '#111111', size: 2 },
  },
  arrow: {
    label: 'Arrow',
    icon: 'arrow-top-right',
    colors: INK_COLORS,
    sizes: [1, 2, 4],
    defaults: { color: '#E5383B', size: 2 },
  },
  whiteout: {
    label: 'Whiteout',
    icon: 'eraser-variant',
    colors: [],
    sizes: [],
    defaults: { color: '#FFFFFF', size: 0 },
    hint: 'Drag over content to cover it, then add text on top',
  },
  eraser: {
    label: 'Eraser',
    icon: 'eraser',
    colors: [],
    sizes: [],
    defaults: { color: '#000000', size: 0 },
    hint: 'Tap or drag over annotations to remove them',
  },
};

export const TOOL_ORDER: Tool[] = [
  'select',
  'pen',
  'highlighter',
  'text',
  'edit-text',
  'rect',
  'ellipse',
  'line',
  'arrow',
  'whiteout',
  'eraser',
];

/** Tools that draw by dragging, so page scrolling must be disabled while active. */
export function isDrawingTool(tool: Tool) {
  return tool !== 'select' && tool !== 'text' && tool !== 'edit-text';
}

export function defaultToolSettings(): Record<Tool, ToolSettings> {
  return Object.fromEntries(TOOL_ORDER.map((t) => [t, { ...TOOLS[t].defaults }])) as Record<
    Tool,
    ToolSettings
  >;
}
