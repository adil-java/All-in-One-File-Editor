import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { inkPath } from '@/lib/editor/paths';
import { makeId, type Point } from '@/lib/editor/types';
import { deleteSignature, loadSignatures, saveSignature, type Signature } from '@/lib/signatures';

const COLORS = ['#111111', '#1D3FBB'];
const PEN_WIDTH = 3;

type Props = {
  visible: boolean;
  onCancel: () => void;
  onDone: (signature: Signature) => void;
};

export function SignaturePad({ visible, onCancel, onDone }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {visible && <SignaturePadContent onCancel={onCancel} onDone={onDone} />}
    </Modal>
  );
}

/** Normalizes raw strokes into a signature whose points lie in its bounding box. */
function toSignature(strokes: Point[][], color: string): Signature | null {
  const points = strokes.flat();
  if (points.length < 2) return null;
  const pad = PEN_WIDTH;
  const minX = Math.min(...points.map((p) => p.x)) - pad;
  const minY = Math.min(...points.map((p) => p.y)) - pad;
  const w = Math.max(...points.map((p) => p.x)) + pad - minX;
  const h = Math.max(...points.map((p) => p.y)) + pad - minY;
  return {
    id: makeId('s'),
    strokes: strokes.map((stroke) =>
      stroke.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h })),
    ),
    aspect: w / h,
    strokeWidth: PEN_WIDTH / h,
    color,
  };
}

function SignaturePadContent({ onCancel, onDone }: Omit<Props, 'visible'>) {
  const theme = useTheme();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [saved, setSaved] = useState<Signature[]>([]);

  useEffect(() => {
    loadSignatures().then(setSaved);
  }, []);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => setStrokes((s) => [...s, [{ x: e.x, y: e.y }]]))
    .onUpdate((e) =>
      setStrokes((s) => [...s.slice(0, -1), [...s[s.length - 1], { x: e.x, y: e.y }]]),
    );

  const done = async () => {
    const signature = toSignature(strokes, color);
    if (!signature) return;
    await saveSignature(signature);
    onDone(signature);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={[styles.headerButton, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Signature</Text>
          <Pressable onPress={done} hitSlop={8} disabled={strokes.length === 0}>
            <Text
              style={[
                styles.headerButton,
                { color: theme.tint, opacity: strokes.length ? 1 : 0.4 },
              ]}>
              Done
            </Text>
          </Pressable>
        </View>

        <GestureDetector gesture={pan}>
          <View style={[styles.canvas, { borderColor: theme.border }]}>
            <Svg style={StyleSheet.absoluteFill}>
              {strokes.map((stroke, i) => (
                <Path
                  key={i}
                  d={inkPath(stroke)}
                  stroke={color}
                  strokeWidth={PEN_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
            <View pointerEvents="none" style={[styles.baseline, { borderColor: '#C9CCD1' }]} />
            {strokes.length === 0 && (
              <Text pointerEvents="none" style={styles.placeholder}>
                Sign here
              </Text>
            )}
          </View>
        </GestureDetector>

        <View style={styles.controls}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c, borderColor: c === color ? theme.tint : 'transparent' },
              ]}
            />
          ))}
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setStrokes([])} style={styles.clear}>
            <MaterialCommunityIcons name="eraser" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        </View>

        {saved.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={[styles.savedTitle, { color: theme.textSecondary }]}>
              SAVED SIGNATURES
            </Text>
            <ScrollView horizontal contentContainerStyle={styles.savedRow}>
              {saved.map((signature) => (
                <Pressable
                  key={signature.id}
                  onPress={() => onDone(signature)}
                  onLongPress={() => deleteSignature(signature.id).then(setSaved)}
                  style={[styles.savedItem, { borderColor: theme.border }]}>
                  <SignaturePreview signature={signature} />
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.savedHint, { color: theme.textSecondary }]}>
              Tap to use · long-press to delete
            </Text>
          </View>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function SignaturePreview({ signature }: { signature: Signature }) {
  const height = 56;
  const width = Math.min(160, height * signature.aspect);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${signature.aspect} 1`}>
      {signature.strokes.map((stroke, i) => (
        <Path
          key={i}
          d={inkPath(stroke.map((p) => ({ x: p.x * signature.aspect, y: p.y })))}
          stroke={signature.color}
          strokeWidth={signature.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  title: { fontSize: 17, fontWeight: '600' },
  headerButton: { fontSize: 16, fontWeight: '600' },
  canvas: {
    height: 260,
    marginHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  baseline: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: 64,
    borderBottomWidth: 1,
  },
  placeholder: {
    position: 'absolute',
    left: Spacing.four,
    bottom: 72,
    color: '#A0A4AB',
    fontSize: 15,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  savedSection: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  savedTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  savedRow: { gap: Spacing.two },
  savedItem: {
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.sm,
    backgroundColor: '#fff',
  },
  savedHint: { fontSize: 12 },
});
