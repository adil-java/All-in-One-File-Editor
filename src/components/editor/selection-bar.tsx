import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type SelectionAction = {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
};

/** Row of actions shown in the toolbar while an annotation is selected. */
export function SelectionBar({ actions }: { actions: SelectionAction[] }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {actions.map(({ label, icon, onPress, destructive }) => {
        const color = destructive ? theme.danger : theme.text;
        return (
          <Pressable
            key={label}
            onPress={onPress}
            style={[styles.button, { backgroundColor: theme.background }]}>
            <MaterialCommunityIcons name={icon} size={18} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
  label: { fontSize: 14, fontWeight: '600' },
});
