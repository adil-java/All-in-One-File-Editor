import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextPromptModal } from '@/components/text-prompt-modal';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  createBlankDocument,
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
  ALL_KINDS,
  type DocumentKind,
  editorRouteFor,
} from '@/lib/documents';

/** File icon label and color per document kind. */
const FILE_BADGES: Record<DocumentKind, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: '#E5383B' },
  docx: { label: 'DOC', color: '#2B579A' },
  xlsx: { label: 'XLS', color: '#1D7A45' },
  pptx: { label: 'PPT', color: '#D35230' },
};

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

  const importFromDevice = () =>
    run(async () => {
      const imported = [];
      for (const asset of await pickDocuments({ kinds: ALL_KINDS, multiple: true })) {
        imported.push(await importDocument(asset.uri, asset.name, asset.kind));
      }
      if (imported.length === 1) openDocument(imported[0]);
    });

  const createNew = (kind: DocumentKind) =>
    run(async () => openDocument(await createBlankDocument(kind)));

  /** The "New" button: import from the device or start a blank document. */
  const showNewMenu = () =>
    showActionSheet('New', [
      { label: 'Import from device', onPress: importFromDevice },
      { label: 'New PDF', onPress: () => createNew('pdf') },
      { label: 'New Word document', onPress: () => createNew('docx') },
      { label: 'New Excel workbook', onPress: () => createNew('xlsx') },
      { label: 'New PowerPoint presentation', onPress: () => createNew('pptx') },
    ]);

  const openDocument = (doc: PdfDocument) => router.push(editorRouteFor(doc));

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
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No documents yet</Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              Import PDF, Word, Excel and PowerPoint files to view, edit and convert them.
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
            <View style={[styles.fileIcon, { backgroundColor: FILE_BADGES[item.kind].color }]}>
              <Text style={styles.fileIconText}>{FILE_BADGES[item.kind].label}</Text>
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
        onPress={showNewMenu}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.tint,
            bottom: insets.bottom + Spacing.four,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Ionicons name="add" size={22} color={theme.tintText} />
        <Text style={[styles.fabText, { color: theme.tintText }]}>New</Text>
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
  logo: { width: 96, height: 96, marginBottom: Spacing.one },
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
