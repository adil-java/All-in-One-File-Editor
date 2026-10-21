import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One button in the bottom bar shown while selecting files or notes. */
export function SelectionAction({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();
  const color = destructive ? '#E5383B' : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        {
          opacity: disabled ? 0.35 : 1,
          backgroundColor: pressed ? theme.backgroundSelected : undefined,
        },
      ]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
  label: { fontSize: 12, fontWeight: '600' },
});
