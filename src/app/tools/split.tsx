import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText, toast } from '@/components/toast';
import { BusyOverlay } from '@/components/tools/busy-overlay';
import { LibraryPdfPicker } from '@/components/tools/library-pdf-picker';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import { getDocument, type PdfDocument, pickPdfs } from '@/lib/documents';
import { everyNPages, formatRange, type PageRange, parsePageRanges } from '@/lib/pdf/page-ranges';
import {
  extractToLibrary,
  pageCountOf,
  type PdfSource,
  releaseSources,
  splitToLibrary,
} from '@/lib/pdf/pdf-tools';

type Mode = 'ranges' | 'every' | 'extract';

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: 'ranges', label: 'By ranges', hint: 'Each range becomes its own PDF.' },
  { mode: 'every', label: 'Every N pages', hint: 'Cut the PDF into equal parts.' },
  { mode: 'extract', label: 'Extract pages', hint: 'Save the chosen pages as one PDF.' },
];

/** What the current inputs would produce: output ranges, or an error. */
function plan(mode: Mode, text: string, every: string, count: number) {
  if (mode === 'every') {
    const n = Number(every);
    if (!Number.isInteger(n) || n < 1) return { error: 'Enter how many pages per file' };
    return { files: everyNPages(count, n) };
  }
  if (!text.trim())
    return {
      error: mode === 'extract' ? 'Enter the pages to keep' : 'Enter ranges, e.g. 1-170, 171-end',
    };
  const parsed = parsePageRanges(text, count);
  if (!parsed.ok) return { error: parsed.error };
  return mode === 'extract' ? { files: parsed.ranges, single: true } : { files: parsed.ranges };
}

export default function SplitScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [source, setSource] = useState<PdfSource | null>(() => {
    const doc = id ? getDocument(id) : null;
    return doc && doc.kind === 'pdf' ? { uri: doc.uri, name: doc.name, size: doc.size } : null;
  });
  const [count, setCount] = useState<{ uri: string; pages: number | 'error' } | null>(null);
  const [mode, setMode] = useState<Mode>('ranges');
  const [text, setText] = useState('');
  const [every, setEvery] = useState('10');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    pageCountOf(source.uri)
      .then((pages) => !cancelled && setCount({ uri: source.uri, pages }))
      .catch(() => !cancelled && setCount({ uri: source.uri, pages: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => releaseSources, []);

  const pages = source && count?.uri === source.uri ? count.pages : undefined;
  const result = typeof pages === 'number' ? plan(mode, text, every, pages) : null;
  const files: PageRange[] = result?.files ?? [];

  const choose = () =>
    showActionSheet('Choose a PDF', [
      { label: 'From my files', icon: 'folder-outline', onPress: () => setPicking(true) },
      {
        label: 'From device',
        icon: 'phone-portrait-outline',
        onPress: async () => {
          try {
            const [picked] = await pickPdfs();
            if (picked) setSource({ uri: picked.uri, name: picked.name.replace(/\.pdf$/i, '') });
          } catch (error) {
            toast.error('Could not open the file', errorText(error));
          }
        },
      },
    ]);

  const run = async () => {
    if (!source || !result || 'error' in result) return;
    setBusy(true);
    try {
      if (result.single) {
        const indices = parsePageRanges(text, pages as number);
        const doc = await extractToLibrary(
          source.uri,
          indices.ok ? indices.indices : [],
          `${source.name} (pages ${files.map(formatRange).join(', ')})`,
        );
        toast.success('Pages extracted', `"${doc.name}"`);
      } else {
        const created = await splitToLibrary(source.uri, files, source.name);
        toast.success(`Split into ${created.length} PDFs`, 'You can find them in Files.');
      }
      router.back();
    } catch (error) {
      toast.error('Could not split', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: 'Split PDF' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={choose}
          style={[styles.source, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PDF</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.sourceName, { color: theme.text }]}>
              {source ? source.name : 'Choose a PDF to split'}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {!source
                ? 'From your files or your device'
                : pages === undefined
                  ? 'Reading…'
                  : pages === 'error'
                    ? 'Could not read this PDF'
                    : `${pages} pages · tap to change`}
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={20} color={theme.textSecondary} />
        </Pressable>

        <View style={[styles.segments, { backgroundColor: theme.backgroundElement }]}>
          {MODES.map((m) => (
            <Pressable
              key={m.mode}
              onPress={() => setMode(m.mode)}
              style={[styles.segment, mode === m.mode && { backgroundColor: theme.tint }]}>
              <Text style={[styles.segmentText, { color: mode === m.mode ? '#fff' : theme.text }]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: theme.textSecondary }}>
          {MODES.find((m) => m.mode === mode)!.hint}
        </Text>

        {mode === 'every' ? (
          <TextInput
            value={every}
            onChangeText={setEvery}
            keyboardType="number-pad"
            placeholder="Pages per file"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          />
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={mode === 'extract' ? 'e.g. 1-5, 12, 40-end' : 'e.g. 1-170, 171-end'}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          />
        )}

        {result && 'error' in result && result.error ? (
          <Text style={{ color: theme.danger }}>{result.error}</Text>
        ) : null}

        {files.length > 0 && (
          <View style={{ gap: Spacing.two }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {result?.single
                ? 'WILL CREATE 1 PDF'
                : `WILL CREATE ${files.length} PDF${files.length === 1 ? '' : 'S'}`}
            </Text>
            {(result?.single ? [files] : files.map((f) => [f])).slice(0, 50).map((group, i) => {
              const total = group.reduce((n, r) => n + r.to - r.from + 1, 0);
              return (
                <View key={i} style={[styles.output, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="document-outline" size={18} color={theme.tint} />
                  <Text style={{ color: theme.text, flex: 1 }}>
                    Pages {group.map(formatRange).join(', ')}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>{total} pg</Text>
                </View>
              );
            })}
            {!result?.single && files.length > 50 && (
              <Text style={{ color: theme.textSecondary }}>…and {files.length - 50} more</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + Spacing.three,
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
          },
        ]}>
        <Pressable
          onPress={run}
          disabled={files.length === 0 || busy}
          style={[
            styles.primary,
            { backgroundColor: theme.tint, opacity: files.length ? 1 : 0.4 },
          ]}>
          <Ionicons name="cut-outline" size={20} color="#fff" />
          <Text style={styles.primaryText}>
            {mode === 'extract' ? 'Extract pages' : 'Split PDF'}
          </Text>
        </Pressable>
      </View>

      <LibraryPdfPicker
        visible={picking}
        onCancel={() => setPicking(false)}
        onDone={([doc]: PdfDocument[]) => {
          setPicking(false);
          setSource({ uri: doc.uri, name: doc.name, size: doc.size });
        }}
      />
      {busy && <BusyOverlay label={mode === 'extract' ? 'Extracting…' : 'Splitting…'} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  badge: {
    width: 36,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E5383B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  sourceName: { fontSize: 16, fontWeight: '700' },
  segments: { flexDirection: 'row', borderRadius: Radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.sm, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  output: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.sm,
  },
  footer: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
