import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TOOL_ORDER, TOOLS, type ToolSettings } from '@/lib/editor/tools';
import type { Tool } from '@/lib/editor/types';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type Props = {
  tool: Tool;
  settings: ToolSettings;
  onToolChange: (tool: Tool) => void;
  onSettingsChange: (settings: ToolSettings) => void;
  /** Replaces the tool options row, e.g. with actions for a selected annotation. */
  contextRow?: ReactNode;
  /** Extra buttons appended after the tools (insert actions, page manager). */
  actions?: { label: string; icon: IconName; onPress: () => void }[];
};

export function Toolbar({
  tool,
  settings,
  onToolChange,
  onSettingsChange,
  contextRow,
  actions = [],
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const definition = TOOLS[tool];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom,
        },
      ]}>
      <View style={styles.optionsRow}>
        {contextRow ?? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.options}>
            {definition.colors.map((color) => (
              <Pressable
                key={color}
                onPress={() => onSettingsChange({ ...settings, color })}
                style={[
                  styles.swatch,
                  { backgroundColor: color, borderColor: theme.border },
                  settings.color === color && { borderColor: theme.tint, borderWidth: 3 },
                ]}
              />
            ))}
            {definition.colors.length > 0 && definition.sizes.length > 0 && (
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            )}
            {definition.sizes.map((size) => (
              <Pressable
                key={size}
                onPress={() => onSettingsChange({ ...settings, size })}
                style={[
                  styles.sizeButton,
                  { borderColor: settings.size === size ? theme.tint : theme.border },
                ]}>
                {tool === 'text' ? (
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{size}</Text>
                ) : (
                  <View
                    style={{
                      width: Math.min(size + 2, 22),
                      height: Math.min(size + 2, 22),
                      borderRadius: 11,
                      backgroundColor: definition.colors.length ? settings.color : theme.text,
                    }}
                  />
                )}
              </Pressable>
            ))}
            {definition.hint && definition.colors.length === 0 && (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>{definition.hint}</Text>
            )}
          </ScrollView>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tools}>
        {TOOL_ORDER.map((t) => (
          <ToolButton
            key={t}
            label={TOOLS[t].label}
            icon={TOOLS[t].icon}
            active={t === tool}
            onPress={() => onToolChange(t)}
          />
        ))}
        {actions.length > 0 && (
          <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
        )}
        {actions.map((action) => (
          <ToolButton key={action.label} {...action} />
        ))}
      </ScrollView>
    </View>
  );
}

function ToolButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toolButton, active && { backgroundColor: theme.backgroundSelected }]}>
      <MaterialCommunityIcons name={icon} size={22} color={active ? theme.tint : theme.text} />
      <Text style={[styles.toolLabel, { color: active ? theme.tint : theme.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth },
  optionsRow: { height: 52, justifyContent: 'center' },
  options: { alignItems: 'center', gap: Spacing.two + 2, paddingHorizontal: Spacing.three },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  divider: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: Spacing.one },
  sizeButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 13 },
  tools: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.two, gap: Spacing.one },
  toolDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
    marginHorizontal: Spacing.one,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 60,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.sm,
  },
  toolLabel: { fontSize: 11, fontWeight: '500' },
});
