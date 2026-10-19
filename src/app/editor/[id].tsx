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

import { PageEditor } from '@/components/editor/page-editor';
import { Toolbar } from '@/components/editor/toolbar';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDocument, readDocumentBase64 } from '@/lib/documents';
import { pagesFromSource, useEditorHistory } from '@/lib/editor/history';
import { defaultToolSettings, isDrawingTool, type ToolSettings } from '@/lib/editor/tools';
import type { Tool } from '@/lib/editor/types';
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
            onToolChange={setTool}
            onSettingsChange={setSettings}
          />
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
});
