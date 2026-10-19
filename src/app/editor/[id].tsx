import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';

import { PageEditor, type TextRequest } from '@/components/editor/page-editor';
import { PageManager } from '@/components/editor/page-manager';
import { SelectionBar } from '@/components/editor/selection-bar';
import { SignaturePad } from '@/components/editor/signature-pad';
import { Toolbar } from '@/components/editor/toolbar';
import { TextPromptModal } from '@/components/text-prompt-modal';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  createDocument,
  getDocument,
  overwriteDocument,
  pickPdfs,
  readDocumentBase64,
  shareBytes,
  shareDocument,
} from '@/lib/documents';
import { pagesFromSource, useEditorHistory } from '@/lib/editor/history';
import { defaultToolSettings, isDrawingTool, type ToolSettings } from '@/lib/editor/tools';
import { centeredBox, rotatedSize, translate } from '@/lib/editor/geometry';
import { type Annotation, type EditorPage, makeId, type Tool } from '@/lib/editor/types';
import { exportPdf } from '@/lib/pdf/export';
import { A4, appendBlankPage, appendDocument } from '@/lib/pdf/pages';
import type { Signature } from '@/lib/signatures';
import {
  type PageInfo,
  PdfRendererProvider,
  usePdfRenderer,
} from '@/lib/pdf-renderer/use-pdf-renderer';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 40 };

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [doc] = useState(() => getDocument(id));
  const [base64, setBase64] = useState<string | null>(null);
  const history = useEditorHistory();
  const { pages, dispatch } = history;

  const onLoaded = useCallback(
    (info: PageInfo[]) => {
      if (pages.length === 0) dispatch({ type: 'reset', pages: pagesFromSource(info.length) });
    },
    [pages.length, dispatch],
  );
  const renderer = usePdfRenderer(base64, onLoaded);
  const [tool, setTool] = useState<Tool>('select');
  const [toolSettings, setToolSettings] = useState(defaultToolSettings);
  const settings = toolSettings[tool];
  const setSettings = (next: ToolSettings) => setToolSettings((all) => ({ ...all, [tool]: next }));
  const [selection, setSelection] = useState<{ pageKey: string; id: string } | null>(null);
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const [signing, setSigning] = useState(false);
  const [visiblePageKey, setVisiblePageKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [managingPages, setManagingPages] = useState(false);
  const listRef = useRef<ComponentRef<typeof FlatList<EditorPage>>>(null);
  const navigation = useNavigation();

  // Set when leaving on purpose, so the unsaved-changes prompt is skipped.
  const leaving = useRef(false);

  /** Runs a long task behind a progress overlay. Resolves to whether it succeeded. */
  const runBusy = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
      return true;
    } catch (error) {
      Alert.alert('Something went wrong', error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** Flattens all edits into the document file and reloads it. */
  const save = () =>
    runBusy('Saving…', async () => {
      if (!doc || !base64) return;
      const bytes = await exportPdf(base64, pages);
      await overwriteDocument(doc.id, bytes);
      setSelection(null);
      dispatch({ type: 'reset', pages: pagesFromSource(pages.length) });
      setBase64(await readDocumentBase64(doc.id));
    });

  const saveCopy = () =>
    runBusy('Saving copy…', async () => {
      if (!doc || !base64) return;
      const copy = await createDocument(`${doc.name} edited`, await exportPdf(base64, pages));
      Alert.alert('Saved', `Saved as "${copy.name}".`, [
        { text: 'Stay here', style: 'cancel' },
        {
          text: 'Open copy',
          onPress: () => {
            leaving.current = true;
            router.replace({ pathname: '/editor/[id]', params: { id: copy.id } });
          },
        },
      ]);
    });

  const share = () =>
    runBusy('Preparing…', async () => {
      if (!doc || !base64) return;
      if (history.dirty) await shareBytes(doc.name, await exportPdf(base64, pages));
      else await shareDocument(doc);
    });

  const insertSourcePages = (afterIndex: number | null, sourceIndices: number[]) => {
    dispatch({
      type: 'insert-pages',
      index: (afterIndex ?? pages.length - 1) + 1,
      pages: sourceIndices.map((sourceIndex) => ({
        key: makeId('p'),
        sourceIndex,
        rotation: 0,
        annotations: [],
      })),
    });
  };

  const addBlankPage = (afterIndex: number | null) =>
    runBusy('Adding page…', async () => {
      if (!base64) return;
      // Match the size of the page it follows.
      const neighbor = pages[afterIndex ?? pages.length - 1];
      const info = neighbor && renderer.pages[neighbor.sourceIndex];
      const size = info ? rotatedSize(info.width, info.height, neighbor.rotation) : A4;
      const result = await appendBlankPage(base64, size);
      setBase64(result.base64);
      insertSourcePages(afterIndex, [result.index]);
    });

  const mergePdf = async (afterIndex: number | null) => {
    const [picked] = await pickPdfs();
    if (!picked) return;
    await runBusy('Merging…', async () => {
      if (!base64) return;
      const other = await new File(picked.uri).base64();
      const result = await appendDocument(base64, other);
      setBase64(result.base64);
      insertSourcePages(
        afterIndex,
        Array.from({ length: result.count }, (_, i) => result.startIndex + i),
      );
    });
  };

  const openPage = (index: number) => {
    setManagingPages(false);
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const showMore = () =>
    showActionSheet(doc?.name ?? 'Document', [
      { label: 'Manage pages', onPress: () => setManagingPages(true) },
      { label: 'Save as copy', onPress: saveCopy },
      { label: 'Share', onPress: share },
    ]);

  // Ask before leaving with unsaved edits. Re-dispatched actions pass through
  // because `leaving` is set first.
  const preventLeave = history.dirty && !busy;
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!preventLeave || leaving.current) return;
        e.preventDefault();
        const leave = () => {
          leaving.current = true;
          navigation.dispatch(e.data.action);
        };
        Alert.alert('Unsaved changes', 'Save your edits before leaving?', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: leave },
          {
            text: 'Save',
            onPress: async () => {
              if (await saveRef.current()) leave();
            },
          },
        ]);
      }),
    [navigation, preventLeave],
  );

  // FlatList does not support changing this callback after mount, so it must be stable.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<EditorPage>[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first) setVisiblePageKey(first.item.key);
    },
    [],
  );

  const selectedAnnotation = selection
    ? (pages
        .find((p) => p.key === selection.pageKey)
        ?.annotations.find((a) => a.id === selection.id) ?? null)
    : null;

  const onSelect = useCallback(
    (pageKey: string, annotationId: string | null) =>
      setSelection(annotationId ? { pageKey, id: annotationId } : null),
    [],
  );

  const changeTool = (next: Tool) => {
    setTool(next);
    setSelection(null);
  };

  const submitText = (text: string) => {
    const request = textRequest!;
    setTextRequest(null);
    if ('annotation' in request) {
      dispatch({
        type: 'replace-annotation',
        pageKey: request.pageKey,
        annotation: { ...request.annotation, text },
      });
      return;
    }
    const { color, size } = toolSettings.text;
    dispatch({
      type: 'add-annotation',
      pageKey: request.pageKey,
      annotation: { id: makeId(), type: 'text', ...request.point, text, fontSize: size, color },
    });
  };

  /** Adds an annotation centered on the page currently in view and selects it. */
  const placeOnVisiblePage = (build: (page: { width: number; height: number }) => Annotation) => {
    const page = pages.find((p) => p.key === visiblePageKey) ?? pages[0];
    const info = page && renderer.pages[page.sourceIndex];
    if (!info) return;
    const annotation = build(info);
    dispatch({ type: 'add-annotation', pageKey: page.key, annotation });
    setTool('select');
    setSelection({ pageKey: page.key, id: annotation.id });
  };

  const insertSignature = (signature: Signature) => {
    setSigning(false);
    placeOnVisiblePage((page) => ({
      id: makeId(),
      type: 'signature',
      ...centeredBox(page, signature.aspect, 0.4),
      strokes: signature.strokes,
      color: signature.color,
      strokeWidth: signature.strokeWidth,
    }));
  };

  const insertImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    if (!asset.width || !asset.height) {
      Alert.alert('Unsupported image', 'Could not read the size of this image.');
      return;
    }
    const aspect = asset.width / asset.height;
    placeOnVisiblePage((page) => ({
      id: makeId(),
      type: 'image',
      ...centeredBox(page, aspect, 0.6),
      uri: `data:image/jpeg;base64,${asset.base64}`,
    }));
  };

  const selectionActions = () => {
    if (!selection || !selectedAnnotation) return [];
    const { pageKey } = selection;
    return [
      ...(selectedAnnotation.type === 'text'
        ? [
            {
              label: 'Edit',
              icon: 'pencil' as const,
              onPress: () => setTextRequest({ pageKey, annotation: selectedAnnotation }),
            },
          ]
        : []),
      {
        label: 'Duplicate',
        icon: 'content-copy' as const,
        onPress: () => {
          const copy = { ...translate(selectedAnnotation, 12, 12), id: makeId() };
          dispatch({ type: 'add-annotation', pageKey, annotation: copy });
          setSelection({ pageKey, id: copy.id });
        },
      },
      {
        label: 'Delete',
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => {
          dispatch({ type: 'remove-annotation', pageKey, id: selectedAnnotation.id });
          setSelection(null);
        },
      },
      { label: 'Done', icon: 'check' as const, onPress: () => setSelection(null) },
    ];
  };

  useEffect(() => {
    if (doc) readDocumentBase64(doc.id).then(setBase64);
  }, [doc]);

  const pageWidth = windowWidth - Spacing.three * 2;

  // Page heights are known up front, which lets the list jump straight to any page.
  const pageHeight = (page: EditorPage) => {
    const info = renderer.pages[page.sourceIndex];
    if (!info) return 0;
    const size = rotatedSize(info.width, info.height, page.rotation);
    return (pageWidth * size.height) / size.width;
  };
  const getItemLayout = (data: ArrayLike<EditorPage> | null | undefined, index: number) => {
    let offset = Spacing.three;
    for (let i = 0; i < index; i++) offset += pageHeight(data![i]) + Spacing.three;
    return { length: pageHeight(data![index]), offset, index };
  };

  return (
    <PdfRendererProvider value={renderer}>
      <View style={[styles.container, { backgroundColor: theme.canvas }]}>
        <Stack.Screen
          options={{
            title: doc?.name ?? 'Document',
            headerRight: () => (
              <View style={styles.headerActions}>
                <HeaderButton
                  icon="arrow-undo"
                  disabled={!history.canUndo}
                  onPress={history.undo}
                />
                <HeaderButton
                  icon="arrow-redo"
                  disabled={!history.canRedo}
                  onPress={history.redo}
                />
                <HeaderButton
                  icon="save-outline"
                  disabled={!history.dirty || !!busy}
                  onPress={save}
                />
                <HeaderButton icon="ellipsis-horizontal-circle-outline" onPress={showMore} />
              </View>
            ),
          }}
        />
        {renderer.element}
        {!doc ? (
          <Text style={[styles.message, { color: theme.textSecondary }]}>Document not found</Text>
        ) : renderer.status === 'error' ? (
          <Text style={[styles.message, { color: theme.danger }]}>
            Could not open this PDF: {renderer.error}
          </Text>
        ) : pages.length === 0 ? (
          <ActivityIndicator style={styles.message} color={theme.tint} />
        ) : (
          <FlatList
            ref={listRef}
            data={pages}
            getItemLayout={getItemLayout}
            keyExtractor={(page) => page.key}
            contentContainerStyle={styles.list}
            scrollEnabled={!isDrawingTool(tool)}
            extraData={[tool, settings, selection, renderer.pages]}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY_CONFIG}
            renderItem={({ item }) => {
              const info = renderer.pages[item.sourceIndex];
              if (!info) return null;
              return (
                <PageEditor
                  page={item}
                  info={info}
                  width={pageWidth}
                  tool={tool}
                  settings={settings}
                  selectedId={selection?.pageKey === item.key ? selection.id : null}
                  onSelect={onSelect}
                  onTextRequest={setTextRequest}
                  dispatch={dispatch}
                />
              );
            }}
          />
        )}
        {doc && (
          <Toolbar
            tool={tool}
            settings={settings}
            onToolChange={changeTool}
            onSettingsChange={setSettings}
            actions={[
              { label: 'Sign', icon: 'draw-pen', onPress: () => setSigning(true) },
              { label: 'Image', icon: 'image-outline', onPress: insertImage },
              {
                label: 'Pages',
                icon: 'file-document-multiple-outline',
                onPress: () => setManagingPages(true),
              },
            ]}
            contextRow={
              tool === 'select' && selectedAnnotation ? (
                <SelectionBar actions={selectionActions()} />
              ) : undefined
            }
          />
        )}
        <PageManager
          visible={managingPages}
          pages={pages}
          dispatch={dispatch}
          onClose={() => setManagingPages(false)}
          onOpenPage={openPage}
          onAddBlankPage={addBlankPage}
          onMergePdf={mergePdf}
        />
        <SignaturePad
          visible={signing}
          onCancel={() => setSigning(false)}
          onDone={insertSignature}
        />
        <TextPromptModal
          visible={textRequest !== null}
          title={textRequest && 'annotation' in textRequest ? 'Edit text' : 'Add text'}
          initialValue={
            textRequest && 'annotation' in textRequest ? textRequest.annotation.text : ''
          }
          placeholder="Type something…"
          confirmLabel="Done"
          multiline
          onCancel={() => setTextRequest(null)}
          onSubmit={submitText}
        />
        {busy && (
          <View style={styles.busy}>
            <View style={[styles.busyCard, { backgroundColor: theme.backgroundElement }]}>
              <ActivityIndicator color={theme.tint} />
              <Text style={{ color: theme.text }}>{busy}</Text>
            </View>
          </View>
        )}
      </View>
    </PdfRendererProvider>
  );
}

function HeaderButton({
  icon,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={styles.headerButton}>
      <Ionicons name={icon} size={22} color={disabled ? theme.backgroundSelected : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  message: { flex: 1, textAlign: 'center', textAlignVertical: 'center', padding: Spacing.four },
  headerActions: { flexDirection: 'row', gap: Spacing.three },
  headerButton: { padding: Spacing.one },
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 12,
  },
});
