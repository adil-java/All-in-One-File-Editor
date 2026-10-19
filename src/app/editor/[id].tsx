import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PageView } from '@/components/editor/page-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDocument, readDocumentBase64 } from '@/lib/documents';
import { PdfRendererProvider, usePdfRenderer } from '@/lib/pdf-renderer/use-pdf-renderer';

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [doc] = useState(() => getDocument(id));
  const [base64, setBase64] = useState<string | null>(null);
  const renderer = usePdfRenderer(base64);

  useEffect(() => {
    if (doc) readDocumentBase64(doc.id).then(setBase64);
  }, [doc]);

  const pageWidth = windowWidth - Spacing.three * 2;

  return (
    <PdfRendererProvider value={renderer}>
      <View style={[styles.container, { backgroundColor: theme.canvas }]}>
        <Stack.Screen options={{ title: doc?.name ?? 'Document' }} />
        {renderer.element}
        {!doc ? (
          <Text style={[styles.message, { color: theme.textSecondary }]}>Document not found</Text>
        ) : renderer.status === 'error' ? (
          <Text style={[styles.message, { color: theme.danger }]}>
            Could not open this PDF: {renderer.error}
          </Text>
        ) : renderer.pages.length === 0 ? (
          <ActivityIndicator style={styles.message} color={theme.tint} />
        ) : (
          <FlatList
            data={renderer.pages}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <PageView
                sourceIndex={index}
                rotation={0}
                width={pageWidth}
                height={(pageWidth * item.height) / item.width}
              />
            )}
          />
        )}
      </View>
    </PdfRendererProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  message: { flex: 1, textAlign: 'center', textAlignVertical: 'center', padding: Spacing.four },
});
