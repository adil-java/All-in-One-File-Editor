import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextPromptModal } from '@/components/text-prompt-modal';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  formatDate,
  formatSize,
  importDocument,
  listDocuments,
  pickDocuments,
  type PdfDocument,
  renameDocument,
  shareDocument,
} from '@/lib/documents';
import { createBlankPdf } from '@/lib/pdf/pages';

const WORD_BLUE = '#2B579A';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [renaming, setRenaming] = useState<PdfDocument | null>(null);

  const refresh = useCallback(() => setDocuments(listDocuments()), []);
  useFocusEffect(refresh);

  const run = async (task: () => Promise<unknown> | unknown) => {
    try {
      await task();
    } catch (error) {
      Alert.alert('Something went wrong', error instanceof Error ? error.message : String(error));
    }
    refresh();
  };

  const pickPdf = () =>
    run(async () => {
      const imported = [];
      for (const asset of await pickDocuments({ kinds: ['pdf', 'docx'], multiple: true })) {
        imported.push(await importDocument(asset.uri, asset.name, asset.kind));
      }
      if (imported.length === 1) openDocument(imported[0]);
    });

  const createBlank = () =>
    run(async () => openDocument(await createDocument('Untitled', await createBlankPdf())));

  const openDocument = (doc: PdfDocument) =>
    router.push({
      pathname: doc.kind === 'docx' ? '/word/[id]' : '/editor/[id]',
      params: { id: doc.id },
    });

  const confirmDelete = (doc: PdfDocument) =>
    Alert.alert('Delete document?', `"${doc.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deleteDocument(doc.id)) },
    ]);

  const showActions = (doc: PdfDocument) =>
    showActionSheet(doc.name, [
      { label: 'Rename', onPress: () => setRenaming(doc) },
      { label: 'Duplicate', onPress: () => run(() => duplicateDocument(doc.id)) },
      { label: 'Share', onPress: () => run(() => shareDocument(doc)) },
      { label: 'Delete', onPress: () => confirmDelete(doc), destructive: true },
    ]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={createBlank} hitSlop={8} accessibilityLabel="New blank PDF">
              <Ionicons name="document-outline" size={22} color={theme.text} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          documents.length === 0 && styles.emptyList,
          { paddingBottom: insets.bottom + 96 },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No documents yet</Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              Import a PDF to annotate, sign, and rearrange its pages, or a Word document to edit
              and turn into a PDF.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDocument(item)}
            onLongPress={() => showActions(item)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <View
              style={[
                styles.fileIcon,
                { backgroundColor: item.kind === 'docx' ? WORD_BLUE : theme.tint },
              ]}>
              <Text style={styles.fileIconText}>{item.kind === 'docx' ? 'DOC' : 'PDF'}</Text>
            </View>
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
                {item.name}
              </Text>
              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                {formatSize(item.size)} · {formatDate(item.modifiedAt)}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => confirmDelete(item)}
              accessibilityLabel={`Delete ${item.name}`}>
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => showActions(item)}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
            </Pressable>
          </Pressable>
        )}
      />

      <Pressable
        onPress={pickPdf}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.tint,
            bottom: insets.bottom + Spacing.four,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Ionicons name="add" size={22} color={theme.tintText} />
        <Text style={[styles.fabText, { color: theme.tintText }]}>Import</Text>
      </Pressable>

      <TextPromptModal
        visible={renaming !== null}
        title="Rename document"
        initialValue={renaming?.name}
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          const doc = renaming!;
          setRenaming(null);
          run(() => renameDocument(doc.id, name));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.five },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: Spacing.two },
  emptyBody: { fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  fileIcon: {
    width: 40,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13 },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { fontSize: 16, fontWeight: '600' },
});
