import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SheetAction = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

type SheetRequest = { id: number; title: string; actions: SheetAction[] };

let nextId = 1;
let showSheet: ((request: SheetRequest) => void) | null = null;

/** Shows a bottom sheet of options with a Cancel button (needs ActionSheetHost mounted). */
export function showActionSheet(title: string, actions: SheetAction[]) {
  showSheet?.({ id: nextId++, title, actions });
}

/** Renders the current options sheet. Mount once, above the app's screens. */
export function ActionSheetHost() {
  const [current, setCurrent] = useState<SheetRequest | null>(null);

  useEffect(() => {
    showSheet = setCurrent;
    return () => {
      showSheet = null;
    };
  }, []);

  if (!current) return null;
  return <Sheet key={current.id} request={current} onClosed={() => setCurrent(null)} />;
}

const DANGER = '#E5383B';

function Sheet({ request, onClosed }: { request: SheetRequest; onClosed: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  /** Closes the sheet at once, then runs the chosen action (if any). */
  const close = (action?: SheetAction) => {
    onClosed();
    // Next tick, so a follow-up dialog (e.g. delete confirmation) opens after this one is gone.
    if (action) setTimeout(action.onPress, 0);
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => close()}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={() => close()} />
      <View style={styles.bottom} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + Spacing.three, backgroundColor: theme.background },
          ]}>
          <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />
          <Text numberOfLines={1} style={[styles.title, { color: theme.textSecondary }]}>
            {request.title}
          </Text>
          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {request.actions.map((action, index) => {
              const color = action.destructive ? DANGER : theme.text;
              return (
                <Pressable
                  key={action.label}
                  onPress={() => close(action)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  {action.icon ? (
                    <View
                      style={[
                        styles.icon,
                        { backgroundColor: (action.destructive ? DANGER : theme.tint) + '1A' },
                      ]}>
                      <Ionicons
                        name={action.icon}
                        size={19}
                        color={action.destructive ? DANGER : theme.tint}
                      />
                    </View>
                  ) : null}
                  <Text style={[styles.label, { color }]}>{action.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => close()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(10, 14, 25, 0.45)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.lg + 8,
    borderTopRightRadius: Radius.lg + 8,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.one },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.one,
  },
  group: { borderRadius: Radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 54,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '600' },
  cancel: { borderRadius: Radius.md, paddingVertical: Spacing.three + 2, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
