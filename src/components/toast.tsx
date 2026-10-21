import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ToastType = 'success' | 'error' | 'info';

export type ToastOptions = {
  type?: ToastType;
  title: string;
  message?: string;
  /** Optional button, e.g. "Open PDF". */
  action?: { label: string; onPress: () => void };
  /** How long the toast stays, in ms. */
  duration?: number;
};

type ToastEntry = ToastOptions & { id: number };

const STYLES: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#1A9E5C' },
  error: { icon: 'alert-circle', color: '#E5383B' },
  info: { icon: 'information-circle', color: '#2F6FED' },
};

let nextId = 1;
let showToast: ((toast: ToastEntry) => void) | null = null;

/** Shows a toast from anywhere (the ToastHost must be mounted, e.g. in the root layout). */
export const toast = {
  show(options: ToastOptions) {
    showToast?.({ type: 'info', ...options, id: nextId++ });
  },
  success(title: string, message?: string) {
    toast.show({ type: 'success', title, message });
  },
  error(title: string, message?: string) {
    toast.show({ type: 'error', title, message, duration: 4500 });
  },
};

/** Error messages from thrown values, for toasts. */
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Renders the current toast. Mount once, above the app's screens. */
export function ToastHost() {
  const [current, setCurrent] = useState<ToastEntry | null>(null);

  useEffect(() => {
    // A newer toast replaces the one on screen.
    showToast = setCurrent;
    return () => {
      showToast = null;
    };
  }, []);

  if (!current) return null;
  return <ToastView key={current.id} toast={current} onHidden={() => setCurrent(null)} />;
}

function ToastView({ toast: entry, onHidden }: { toast: ToastEntry; onHidden: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const { icon, color } = STYLES[entry.type ?? 'info'];

  const hide = () => {
    offset.set(withTiming(-120, { duration: 220 }));
    opacity.set(
      withTiming(0, { duration: 220 }, (finished) => {
        if (finished) scheduleOnRN(onHidden);
      }),
    );
  };

  useEffect(() => {
    offset.set(withSpring(0, { damping: 16, stiffness: 180 }));
    opacity.set(withTiming(1, { duration: 180 }));
    const timer = setTimeout(hide, entry.duration ?? 2800);
    return () => clearTimeout(timer);
    // Runs once per toast; `hide` only touches shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe up to dismiss.
  const swipe = Gesture.Pan()
    .onUpdate((e) => {
      offset.set(Math.min(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY < -20) scheduleOnRN(hide);
      else offset.set(withSpring(0));
    });

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + Spacing.two }]}>
      <GestureDetector gesture={swipe}>
        <Animated.View
          style={[
            styles.toast,
            animated,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <View style={[styles.accent, { backgroundColor: color }]} />
          <Pressable style={styles.body} onPress={hide}>
            <View style={[styles.iconWrap, { backgroundColor: color + '1F' }]}>
              <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {entry.title}
              </Text>
              {entry.message ? (
                <Text style={[styles.message, { color: theme.textSecondary }]} numberOfLines={3}>
                  {entry.message}
                </Text>
              ) : null}
            </View>
            {entry.action ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  entry.action!.onPress();
                  hide();
                }}
                style={[styles.action, { backgroundColor: color }]}>
                <Text style={styles.actionText}>{entry.action.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: Spacing.three, right: Spacing.three, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  accent: { width: 4 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  message: { fontSize: 13, lineHeight: 18 },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
