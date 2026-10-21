import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ConfirmButton = {
  label: string;
  /** 'primary' is the main action, 'destructive' is red, 'cancel' is subtle. */
  style?: 'primary' | 'destructive' | 'cancel';
  onPress?: () => void;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Sets the icon and its color. */
  tone?: 'danger' | 'warning' | 'info';
  /** Shown top to bottom. Tapping outside the card runs the 'cancel' button, if any. */
  buttons: ConfirmButton[];
};

const TONES = {
  danger: { icon: 'trash-outline', color: '#E5383B' },
  warning: { icon: 'alert-circle-outline', color: '#E69500' },
  info: { icon: 'information-circle-outline', color: '#2F6FED' },
} as const;

let showConfirm: ((options: ConfirmOptions) => void) | null = null;

/** Shows a confirmation dialog (the ConfirmHost must be mounted, e.g. in the root layout). */
export function confirm(options: ConfirmOptions) {
  showConfirm?.(options);
}

/** Renders the current confirmation dialog. Mount once, above the app's screens. */
export function ConfirmHost() {
  const [current, setCurrent] = useState<(ConfirmOptions & { id: number }) | null>(null);

  useEffect(() => {
    let id = 0;
    showConfirm = (options) => setCurrent({ ...options, id: ++id });
    return () => {
      showConfirm = null;
    };
  }, []);

  if (!current) return null;
  return <ConfirmDialog key={current.id} options={current} onClosed={() => setCurrent(null)} />;
}

function ConfirmDialog({ options, onClosed }: { options: ConfirmOptions; onClosed: () => void }) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const tone = TONES[options.tone ?? 'info'];

  useEffect(() => {
    progress.set(withSpring(1, { damping: 18, stiffness: 260 }));
  }, [progress]);

  /** Animates out, then runs the button's action. */
  const close = (button?: ConfirmButton) => {
    progress.set(
      withTiming(0, { duration: 160 }, (finished) => {
        if (finished) scheduleOnRN(onClosed);
      }),
    );
    button?.onPress?.();
  };

  const cancelButton = options.buttons.find((b) => b.style === 'cancel');

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(progress.get(), 1) }));
  const card = useAnimatedStyle(() => ({
    opacity: Math.min(progress.get(), 1),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.88, 1]) }],
  }));

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => close(cancelButton)}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(cancelButton)} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, card, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.iconWrap, { backgroundColor: tone.color + '1F' }]}>
            <Ionicons name={tone.icon} size={28} color={tone.color} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{options.title}</Text>
          {options.message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{options.message}</Text>
          ) : null}
          <View style={styles.buttons}>
            {options.buttons.map((button) => {
              const background =
                button.style === 'destructive'
                  ? '#E5383B'
                  : button.style === 'cancel'
                    ? theme.backgroundSelected
                    : theme.tint;
              const color = button.style === 'cancel' ? theme.text : '#fff';
              return (
                <Pressable
                  key={button.label}
                  onPress={() => close(button)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: background, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <Text style={[styles.buttonText, { color }]}>{button.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(10, 14, 25, 0.5)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.lg + 4,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
  button: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
