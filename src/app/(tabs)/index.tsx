import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirm } from '@/components/confirm-dialog';
import { SelectionAction } from '@/components/selection-action';
import { SpeedDial } from '@/components/speed-dial';
import { TextPromptModal } from '@/components/text-prompt-modal';
import { errorText, toast } from '@/components/toast';
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
  shareDocuments,
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
  // Ids of selected documents while in selection mode; null when not selecting.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selecting = selected !== null;
  const allSelected = selecting && documents.length > 0 && selected.size === documents.length;

  const refresh = useCallback(() => {
    const docs = listDocuments();
    setDocuments(docs);
    // Drop selections of documents that no longer exist.
    setSelected((current) =>
      current ? new Set(docs.filter((d) => current.has(d.id)).map((d) => d.id)) : current,
    );
  }, []);
  useFocusEffect(refresh);

  const run = async (task: () => Promise<unknown> | unknown) => {
    try {
      await task();
    } catch (error) {
      toast.error('Something went wrong', errorText(error));
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

  const openDocument = (doc: PdfDocument) => router.push(editorRouteFor(doc));

  const confirmDelete = (doc: PdfDocument) =>
    confirm({
      title: 'Delete document?',
      message: `"${doc.name}" will be permanently removed.`,
      tone: 'danger',
      buttons: [
        { label: 'Delete', style: 'destructive', onPress: () => run(() => deleteDocument(doc.id)) },
        { label: 'Cancel', style: 'cancel' },
      ],
    });

  const toggleSelected = (doc: PdfDocument) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });

  const selectedDocs = selected ? documents.filter((d) => selected.has(d.id)) : [];

  /** One file is shared as is; several are shared together as a zip. */
  const shareSelected = () => run(() => shareDocuments(selectedDocs));

  const duplicateSelected = () =>
    run(async () => {
      for (const doc of selectedDocs) await duplicateDocument(doc.id);
      const count = selectedDocs.length;
      setSelected(null);
      toast.success(`Duplicated ${count} ${count === 1 ? 'document' : 'documents'}`);
    });

  const renameSelected = () => {
    if (selectedDocs.length !== 1) return;
    setRenaming(selectedDocs[0]);
    setSelected(null);
  };

  const deleteSelected = () => {
    if (!selected || selected.size === 0) return;
    const ids = [...selected];
    const count = ids.length;
    const noun = count === 1 ? 'document' : 'documents';
    confirm({
      title: `Delete ${count} ${noun}?`,
      message: `The selected ${noun} will be permanently removed.`,
      tone: 'danger',
      buttons: [
        {
          label: `Delete ${count}`,
          style: 'destructive',
          onPress: () =>
            run(() => {
              ids.forEach(deleteDocument);
              setSelected(null);
              toast.success(`Deleted ${count} ${noun}`);
            }),
        },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const showActions = (doc: PdfDocument) =>
    showActionSheet(doc.name, [
      {
        label: 'Select',
        icon: 'checkmark-circle-outline',
        onPress: () => setSelected(new Set([doc.id])),
      },
      { label: 'Rename', icon: 'create-outline', onPress: () => setRenaming(doc) },
      {
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => run(() => duplicateDocument(doc.id)),
      },
      { label: 'Share', icon: 'share-outline', onPress: () => run(() => shareDocument(doc)) },
      {
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => confirmDelete(doc),
        destructive: true,
      },
    ]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        {selecting ? (
          <>
            <Pressable hitSlop={8} onPress={() => setSelected(null)}>
              <Text style={[styles.headerButton, { color: theme.tint }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.selectionTitle, { color: theme.text }]}>
              {selected.size} selected
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() =>
                setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)))
              }>
              <Text style={[styles.headerButton, { color: theme.tint }]}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Files</Text>
            {documents.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setSelected(new Set())}>
                <Text style={[styles.headerButton, { color: theme.tint }]}>Select</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
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
        extraData={selected}
        renderItem={({ item }) => {
          const checked = selected?.has(item.id) ?? false;
          return (
            <Pressable
              onPress={() => (selecting ? toggleSelected(item) : openDocument(item))}
              onLongPress={() => (selecting ? toggleSelected(item) : showActions(item))}
              accessibilityState={selecting ? { checked } : undefined}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor:
                    pressed || checked ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              {selecting && (
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={checked ? theme.tint : theme.textSecondary}
                />
              )}
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
              {!selecting && (
                <Pressable hitSlop={8} onPress={() => showActions(item)}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      {selecting ? (
        <View
          style={[
            styles.selectionBar,
            {
              paddingBottom: insets.bottom + Spacing.three,
              backgroundColor: theme.backgroundElement,
              borderTopColor: theme.border,
            },
          ]}>
          {/* Same actions as a file's menu, applied to every selected file. */}
          <SelectionAction
            icon="share-outline"
            label="Share"
            disabled={selected.size === 0}
            onPress={shareSelected}
          />
          <SelectionAction
            icon="copy-outline"
            label="Duplicate"
            disabled={selected.size === 0}
            onPress={duplicateSelected}
          />
          <SelectionAction
            icon="create-outline"
            label="Rename"
            disabled={selected.size !== 1}
            onPress={renameSelected}
          />
          <SelectionAction
            icon="trash-outline"
            label={selected.size > 0 ? `Delete (${selected.size})` : 'Delete'}
            destructive
            disabled={selected.size === 0}
            onPress={deleteSelected}
          />
        </View>
      ) : (
        <SpeedDial
          label="New"
          actions={[
            {
              label: 'Import from device',
              icon: 'folder-open',
              color: '#5B6475',
              onPress: importFromDevice,
            },
            {
              label: 'New PDF',
              icon: 'document-text',
              color: '#E5383B',
              onPress: () => createNew('pdf'),
            },
            {
              label: 'Word document',
              icon: 'document',
              color: '#2B579A',
              onPress: () => createNew('docx'),
            },
            {
              label: 'Excel workbook',
              icon: 'grid',
              color: '#1D7A45',
              onPress: () => createNew('xlsx'),
            },
            {
              label: 'PowerPoint',
              icon: 'easel',
              color: '#D35230',
              onPress: () => createNew('pptx'),
            },
          ]}
        />
      )}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  pageTitle: { fontSize: 30, fontWeight: '800' },
  headerButton: { fontSize: 16, fontWeight: '600' },
  selectionTitle: { fontSize: 17, fontWeight: '700' },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
});
