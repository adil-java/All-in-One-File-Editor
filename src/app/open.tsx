import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { editorRouteFor, importSharedFile } from '@/lib/documents';

/** Imports a file opened from another app, then shows it in its editor. */
export default function OpenSharedFileScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    importSharedFile(uri)
      .then((doc) => router.replace(editorRouteFor(doc)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [uri]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Opening file' }} />
      {error ? (
        <>
          <Text style={[styles.title, { color: theme.text }]}>Could not open this file</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{error}</Text>
          <Pressable
            onPress={() => router.replace('/')}
            style={[styles.button, { backgroundColor: theme.tint }]}>
            <Text style={{ color: theme.tintText, fontWeight: '600' }}>Go to documents</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.tint} />
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Adding to your documents…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, textAlign: 'center' },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
});
