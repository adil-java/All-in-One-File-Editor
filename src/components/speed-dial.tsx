import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SpeedDialAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

type Props = {
  label: string;
  actions: SpeedDialAction[];
};

/** Each item starts animating this much later in the shared 0..1 progress. */
const STAGGER = 0.08;
/** Portion of the progress each item takes to fully appear. */
const ITEM_SPAN = 0.6;
const SPRING = { damping: 15, stiffness: 220 };

/**
 * Floating "New" button that springs open a column of labeled actions.
 * Actions animate in one after another (bottom first) and the + turns into ×.
 */
export function SpeedDial({ label, actions }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  const toggle = (next: boolean) => {
    setOpen(next);
    progress.set(next ? withSpring(1, SPRING) : withTiming(0, { duration: 180 }));
  };

  const run = (action: SpeedDialAction) => {
    toggle(false);
    action.onPress();
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const icon = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.get(), [0, 1], [0, 135])}deg` }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)} />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={[styles.container, { bottom: insets.bottom + Spacing.four }]}>
        {open &&
          actions.map((action, index) => (
            <SpeedDialItem
              key={action.label}
              action={action}
              // Bottom item first, so the menu unfolds upwards from the button.
              order={actions.length - 1 - index}
              progress={progress}
              onPress={() => run(action)}
            />
          ))}

        <Pressable
          onPress={() => toggle(!open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.tint, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}>
          <Animated.View style={icon}>
            <Ionicons name="add" size={24} color={theme.tintText} />
          </Animated.View>
          <Text style={[styles.fabText, { color: theme.tintText }]}>{open ? 'Close' : label}</Text>
        </Pressable>
      </View>
    </>
  );
}

function SpeedDialItem({
  action,
  order,
  progress,
  onPress,
}: {
  action: SpeedDialAction;
  order: number;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Staggered entrance: each item uses its own slice of the shared progress.
  const style = useAnimatedStyle(() => {
    const start = order * STAGGER;
    const appear = interpolate(
      progress.get(),
      [start, start + ITEM_SPAN],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: appear,
      transform: [
        { translateY: interpolate(appear, [0, 1], [24, 0]) },
        { scale: interpolate(appear, [0, 1], [0.8, 1]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.item, style]}>
      <Pressable onPress={onPress} style={styles.itemPressable} accessibilityRole="button">
        <View style={[styles.itemLabel, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.itemText, { color: theme.text }]}>{action.label}</Text>
        </View>
        <View style={[styles.itemIcon, { backgroundColor: action.color }]}>
          <Ionicons name={action.icon} size={20} color="#fff" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10 },
  container: {
    position: 'absolute',
    right: Spacing.four,
    alignItems: 'flex-end',
    gap: Spacing.three,
    zIndex: 11,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabText: { fontSize: 16, fontWeight: '700' },
  item: { alignItems: 'flex-end' },
  itemPressable: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  itemLabel: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  itemText: { fontSize: 15, fontWeight: '600' },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
