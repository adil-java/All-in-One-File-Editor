import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { getDocument } from '@/lib/documents';

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const doc = getDocument(id);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: doc?.name ?? 'Document' }} />
      <Text style={{ color: theme.textSecondary }}>
        {doc ? 'Viewer coming soon' : 'Document not found'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
