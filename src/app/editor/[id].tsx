import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';

import { PageEditor, type TextRequest } from '@/components/editor/page-editor';
import { SelectionBar } from '@/components/editor/selection-bar';
import { Toolbar } from '@/components/editor/toolbar';
import { TextPromptModal } from '@/components/text-prompt-modal';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDocument, readDocumentBase64 } from '@/lib/documents';
import { pagesFromSource, useEditorHistory } from '@/lib/editor/history';
import { defaultToolSettings, isDrawingTool, type ToolSettings } from '@/lib/editor/tools';
import { translate } from '@/lib/editor/geometry';
import { makeId, type Tool } from '@/lib/editor/types';
import {
  type PageInfo,
  PdfRendererProvider,
  usePdfRenderer,
} from '@/lib/pdf-renderer/use-pdf-renderer';

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [doc] = useState(() => getDocument(id));
  const [base64, setBase64] = useState<string | null>(null);
  const history = useEditorHistory();
  const { pages, dispatch } = history;
  const [tool, setTool] = useState<Tool>('select');
  const [toolSettings, setToolSettings] = useState(defaultToolSettings);
  const settings = toolSettings[tool];
  const setSettings = (next: ToolSettings) => setToolSettings((all) => ({ ...all, [tool]: next }));
  const [selection, setSelection] = useState<{ pageKey: string; id: string } | null>(null);
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);

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

  const onLoaded = useCallback(
    (info: PageInfo[]) => {
      if (pages.length === 0) dispatch({ type: 'reset', pages: pagesFromSource(info.length) });
    },
    [pages.length, dispatch],
  );
  const renderer = usePdfRenderer(base64, onLoaded);

  useEffect(() => {
    if (doc) readDocumentBase64(doc.id).then(setBase64);
  }, [doc]);

  const pageWidth = windowWidth - Spacing.three * 2;

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
            data={pages}
            keyExtractor={(page) => page.key}
            contentContainerStyle={styles.list}
            scrollEnabled={!isDrawingTool(tool)}
            extraData={[tool, settings, selection, renderer.pages]}
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
            contextRow={
              tool === 'select' && selectedAnnotation ? (
                <SelectionBar actions={selectionActions()} />
              ) : undefined
            }
          />
        )}
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
});
