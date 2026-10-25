import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Full-screen progress while a merge or split runs. */
export function BusyOverlay({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.busy}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ActivityIndicator color={theme.tint} size="large" />
        <Text style={[styles.title, { color: theme.text }]}>{label}</Text>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          Large files can take a minute. Keep the app open.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: { borderRadius: Radius.lg, padding: Spacing.four, alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 17, fontWeight: '700' },
});
