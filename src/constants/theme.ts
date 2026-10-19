/**
 * App-wide colors and spacing, defined for light and dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F5F6F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    border: '#DFE1E6',
    tint: '#E5383B',
    tintText: '#FFFFFF',
    danger: '#D92D20',
    canvas: '#E4E6EB',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0B0B0C',
    backgroundElement: '#1A1B1E',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    border: '#2E3135',
    tint: '#FF5A5F',
    tintText: '#FFFFFF',
    danger: '#FF6B5E',
    canvas: '#151618',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = { [K in ThemeColor]: string };

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
