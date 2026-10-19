import type { ReactNode } from 'react';
import { ActivityIndicator, Image, PixelRatio, StyleSheet, View } from 'react-native';

import { usePageImage } from '@/lib/pdf-renderer/use-pdf-renderer';

const MAX_PIXEL_WIDTH = 2048;

type Props = {
  sourceIndex: number;
  /** Rotation applied on top of the page's own /Rotate, in degrees. */
  rotation: number;
  width: number;
  height: number;
  children?: ReactNode;
};

/** A rendered PDF page with optional overlay content (annotations) on top. */
export function PageView({ sourceIndex, rotation, width, height, children }: Props) {
  // Capped so zoomed-in pages stay within a reasonable memory budget.
  const pixelWidth = Math.round(Math.min(width * Math.min(PixelRatio.get(), 2), MAX_PIXEL_WIDTH));
  const uri = usePageImage(sourceIndex, pixelWidth, rotation);

  return (
    <View style={[styles.page, { width, height }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
      ) : (
        <ActivityIndicator style={StyleSheet.absoluteFill} color="#999" />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#fff',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});
