import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import { router, Stack, useNavigation } from 'expo-router';
import { type ComponentType, type Ref, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Spacing } from '@/constants/theme';
import { confirm } from '@/components/confirm-dialog';
import { errorText, toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  base64ToBytes,
  createDocument,
  type DocumentKind,
  getDocument,
  overwriteDocument,
  readDocumentBase64,
  shareBytes,
  shareDocument,
} from '@/lib/documents';

/** What differs between the Word, Excel and PowerPoint editors. */
export type OfficeEditorConfig = {
  kind: Exclude<DocumentKind, 'pdf'>;
  /** Editor page; see the bridge contract in each editor-html.ts (word, excel, powerpoint). */
  html: string;
  /** Page function that posts the document as a file of `kind` (base64). */
  exportFunction: '__toDocx' | '__toXlsx' | '__toPptx';
  /** Builds the printable document and page size from the page's `html` message. */
  print: (message: HtmlMessage) => { html: string; width: number; height: number };
};

// react-native-webview's props type collapses to `never` with current RN typings,
// so expose just the props this screen uses.
const EditorWebView = WebView as unknown as ComponentType<{
  ref: Ref<WebView>;
  source: { html: string };
  originWhitelist: string[];
  onMessage: (event: WebViewMessageEvent) => void;
  style: StyleProp<ViewStyle>;
  keyboardDisplayRequiresUserAction: boolean;
  hideKeyboardAccessoryView: boolean;
}>;

export type HtmlMessage = { type: 'html'; requestId: number; html: string } & Record<
  string,
  unknown
>;

type Message =
  | { type: 'ready' }
  | { type: 'opened' }
  | { type: 'open-error'; message: string }
  | { type: 'changed' }
  | HtmlMessage
  | { type: 'docx' | 'xlsx' | 'pptx'; requestId: number; base64: string }
  | { type: 'error'; requestId: number; message: string };

/** Hosts an office document editor page and handles saving, PDF export and sharing. */
export function OfficeEditorScreen({ id, config }: { id: string; config: OfficeEditorConfig }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const [doc] = useState(() => getDocument(id));
  const webView = useRef<WebView>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const leaving = useRef(false);

  const nextRequestId = useRef(1);
  const pending = useRef(
    new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>(),
  );

  /** Asks the page for its printable HTML, or the document as a file (base64). */
  function request(what: 'html'): Promise<HtmlMessage>;
  function request(what: 'file'): Promise<string>;
  function request(what: 'html' | 'file') {
    const requestId = nextRequestId.current++;
    return new Promise((resolve, reject) => {
      pending.current.set(requestId, { resolve, reject });
      const fn = what === 'html' ? '__getHtml' : config.exportFunction;
      webView.current?.injectJavaScript(`window.${fn}(${requestId}); true;`);
    });
  }

  const onMessage = async (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as Message;
    switch (message.type) {
      case 'ready':
        if (!doc) return;
        try {
          const base64 = await readDocumentBase64(doc.id);
          webView.current?.injectJavaScript(`window.__open(${JSON.stringify(base64)}); true;`);
        } catch (e) {
          setStatus('error');
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      case 'opened':
        setStatus('ready');
        break;
      case 'open-error':
        setStatus('error');
        setError(message.message);
        break;
      case 'changed':
        setDirty(true);
        break;
      case 'html':
      case 'docx':
      case 'xlsx':
      case 'pptx': {
        const entry = pending.current.get(message.requestId);
        pending.current.delete(message.requestId);
        entry?.resolve((message.type === 'html' ? message : message.base64) as never);
        break;
      }
      case 'error': {
        const entry = pending.current.get(message.requestId);
        pending.current.delete(message.requestId);
        entry?.reject(new Error(message.message));
        break;
      }
    }
  };

  /** Runs a long task behind a progress overlay. Resolves to whether it succeeded. */
  const runBusy = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
      return true;
    } catch (e) {
      toast.error('Something went wrong', errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    runBusy('Saving…', async () => {
      if (!doc) return;
      await overwriteDocument(doc.id, base64ToBytes(await request('file')));
      setDirty(false);
      toast.success('Saved');
    });

  const saveAsPdf = () =>
    runBusy('Creating PDF…', async () => {
      if (!doc) return;
      const page = config.print(await request('html'));
      const { uri } = await Print.printToFileAsync({
        ...page,
        // iOS ignores @page margins and takes them here instead (Word documents only).
        ...(Platform.OS === 'ios' &&
          config.kind === 'docx' && { margins: { top: 57, bottom: 57, left: 51, right: 51 } }),
      });
      const pdf = await createDocument(doc.name, await new File(uri).bytes(), 'pdf');
      toast.show({
        type: 'success',
        title: 'Saved as PDF',
        message: `"${pdf.name}" was added to your documents.`,
        action: {
          label: 'Open',
          onPress: () => router.push({ pathname: '/editor/[id]', params: { id: pdf.id } }),
        },
      });
    });

  const share = () =>
    runBusy('Preparing…', async () => {
      if (!doc) return;
      if (dirty) await shareBytes(doc.name, base64ToBytes(await request('file')), config.kind);
      else await shareDocument(doc);
    });

  const showMore = () =>
    showActionSheet(doc?.name ?? 'Document', [
      { label: 'Save as PDF', onPress: saveAsPdf },
      { label: 'Share', onPress: share },
    ]);

  // Ask before leaving with unsaved edits. Re-dispatched actions pass through
  // because `leaving` is set first.
  const preventLeave = dirty && !busy;
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
        confirm({
          title: 'Unsaved changes',
          message: 'Save your edits before leaving?',
          tone: 'warning',
          buttons: [
            {
              label: 'Save',
              style: 'primary',
              onPress: async () => {
                if (await saveRef.current()) leave();
              },
            },
            { label: 'Discard', style: 'destructive', onPress: leave },
            { label: 'Keep editing', style: 'cancel' },
          ],
        });
      }),
    [navigation, preventLeave],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <Stack.Screen
        options={{
          title: doc?.name ?? 'Document',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable onPress={save} disabled={!dirty || !!busy} hitSlop={8}>
                <Ionicons
                  name="save-outline"
                  size={22}
                  color={!dirty || busy ? theme.backgroundSelected : theme.text}
                />
              </Pressable>
              <Pressable onPress={showMore} disabled={status !== 'ready'} hitSlop={8}>
                <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={theme.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      {doc ? (
        <EditorWebView
          ref={webView}
          source={{ html: config.html }}
          originWhitelist={['*']}
          onMessage={onMessage}
          style={[styles.webView, status !== 'ready' && styles.hidden]}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
        />
      ) : null}
      {!doc ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>Document not found</Text>
      ) : status === 'error' ? (
        <Text style={[styles.message, { color: theme.danger }]}>
          Could not open this document: {error}
        </Text>
      ) : status === 'loading' ? (
        <ActivityIndicator style={styles.message} color={theme.tint} />
      ) : null}
      {busy && (
        <View style={styles.busy}>
          <View style={[styles.busyCard, { backgroundColor: theme.backgroundElement }]}>
            <ActivityIndicator color={theme.tint} />
            <Text style={{ color: theme.text }}>{busy}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webView: { flex: 1, backgroundColor: 'transparent' },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  message: {
    ...StyleSheet.absoluteFill,
    textAlign: 'center',
    textAlignVertical: 'center',
    padding: Spacing.four,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.three },
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
