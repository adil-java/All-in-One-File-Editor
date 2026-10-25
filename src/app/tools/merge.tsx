import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { TextPromptModal } from '@/components/text-prompt-modal';
import { BusyOverlay } from '@/components/tools/busy-overlay';
import { errorText, toast } from '@/components/toast';
import { LibraryPdfPicker } from '@/components/tools/library-pdf-picker';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  editorRouteFor,
  getDocument,
  LARGE_PDF_BYTES,
  type PdfDocument,
  pickPdfs,
} from '@/lib/documents';
import { makeId } from '@/lib/editor/types';
import { parsePageRanges } from '@/lib/pdf/page-ranges';
import { mergeToLibrary, pageCountOf, type PdfSource, releaseSources } from '@/lib/pdf/pdf-tools';

/** One piece of the merged PDF: some pages of one source, in list order. */
type Part = { id: string; source: PdfSource; range: string };

/** Where picked PDFs go: appended to the list, or inserted into a part. */
type PickTarget = { mode: 'add' } | { mode: 'insert'; partId: string };

const fromDoc = (doc: PdfDocument): PdfSource => ({ uri: doc.uri, name: doc.name, size: doc.size });

export default function MergeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { ids } = useLocalSearchParams<{ ids?: string }>();

  const [parts, setParts] = useState<Part[]>(() =>
    (ids ?? '')
      .split(',')
      .map((id) => (id ? getDocument(decodeURIComponent(id)) : null))
      .filter((doc): doc is PdfDocument => doc !== null && doc.kind === 'pdf')
      .map((doc) => ({ id: makeId('m'), source: fromDoc(doc), range: '' })),
  );
  const [name, setName] = useState('');
  const [counts, setCounts] = useState<Record<string, number | 'error'>>({});
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<PickTarget | null>(null);
  const [inserting, setInserting] = useState<{ partId: string; source: PdfSource } | null>(null);
  const loading = useRef(new Set<string>());

  // Page counts for every source in the list (each PDF is parsed once).
  useEffect(() => {
    for (const { source } of parts) {
      if (loading.current.has(source.uri)) continue;
      loading.current.add(source.uri);
      pageCountOf(source.uri)
        .then((count) => setCounts((c) => ({ ...c, [source.uri]: count })))
        .catch((error) => {
          setCounts((c) => ({ ...c, [source.uri]: 'error' }));
          toast.error(`Could not read "${source.name}"`, errorText(error));
        });
    }
  }, [parts]);

  // Parsed PDFs can be large; free them when leaving the screen.
  useEffect(() => releaseSources, []);

  const checked = parts.map((part) => {
    const count = counts[part.source.uri];
    if (count === undefined) return { part, count, result: null };
    if (count === 'error')
      return { part, count, result: { ok: false as const, error: 'Could not read this PDF' } };
    return { part, count, result: parsePageRanges(part.range, count) };
  });
  const ready = parts.length > 0 && checked.every((c) => c.result?.ok);
  const totalPages = checked.reduce((n, c) => n + (c.result?.ok ? c.result.indices.length : 0), 0);
  const outputName = name.trim() || `${parts[0]?.source.name ?? 'Merged'} merged`;

  const update = (id: string, changes: Partial<Part>) =>
    setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const move = (index: number, delta: number) =>
    setParts((ps) => {
      const next = [...ps];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  /** Chosen PDFs: appended to the list, or (one) inserted into a part after a page. */
  const onPicked = (target: PickTarget, sources: PdfSource[]) => {
    if (sources.length === 0) return;
    if (target.mode === 'insert') {
      setInserting({ partId: target.partId, source: sources[0] });
      return;
    }
    setParts((ps) => [...ps, ...sources.map((source) => ({ id: makeId('m'), source, range: '' }))]);
  };

  const choose = (target: PickTarget) =>
    showActionSheet(target.mode === 'add' ? 'Add PDFs' : 'Insert a PDF', [
      { label: 'From my files', icon: 'folder-outline', onPress: () => setPicking(target) },
      {
        label: 'From device',
        icon: 'phone-portrait-outline',
        onPress: async () => {
          try {
            const picked = await pickPdfs({ multiple: target.mode === 'add' });
            onPicked(
              target,
              picked.map(({ uri, name: n }) => ({ uri, name: n.replace(/\.pdf$/i, '') })),
            );
          } catch (error) {
            toast.error('Could not open the file', errorText(error));
          }
        },
      },
    ]);

  /** Splits a part around `afterPage` and puts the chosen PDF in between. */
  const insertAfter = (value: string) => {
    const target = inserting!;
    setInserting(null);
    const part = parts.find((p) => p.id === target.partId);
    const count = part && counts[part.source.uri];
    if (!part || typeof count !== 'number') return;
    const parsed = parsePageRanges(part.range, count);
    if (!parsed.ok || parsed.ranges.length !== 1) {
      toast.error('Use a single range', 'Inserting works on a part with one range, like 1-516.');
      return;
    }
    const { from, to } = parsed.ranges[0];
    const page = Number(value.trim());
    if (!Number.isInteger(page) || page < from || page > to) {
      toast.error('Invalid page', `Enter a page from ${from} to ${to}.`);
      return;
    }
    const inserted: Part = { id: makeId('m'), source: target.source, range: '' };
    const before: Part = { ...part, range: `${from}-${page}` };
    const after: Part = { id: makeId('m'), source: part.source, range: `${page + 1}-${to}` };
    setParts((ps) =>
      ps.flatMap((p) =>
        p.id !== part.id ? [p] : page === to ? [before, inserted] : [before, inserted, after],
      ),
    );
    toast.success('Inserted', `"${target.source.name}" goes after page ${page}.`);
  };

  const merge = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const doc = await mergeToLibrary(
        checked.map(({ part, result }) => ({
          uri: part.source.uri,
          indices: result!.ok ? result!.indices : [],
        })),
        outputName,
      );
      toast.show({
        type: 'success',
        title: 'PDFs merged',
        message: `"${doc.name}" · ${totalPages} pages`,
        action:
          doc.size <= LARGE_PDF_BYTES
            ? { label: 'Open', onPress: () => router.push(editorRouteFor(doc)) }
            : undefined,
      });
      router.back();
    } catch (error) {
      toast.error('Could not merge', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: 'Merge PDFs' }} />
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Text style={[styles.help, { color: theme.textSecondary }]}>
          Pages are joined in this order. Leave a range empty for all pages, or type pages like
          1-170, 200-end. Use “Insert PDF after page” to place a file inside another.
        </Text>

        {checked.map(({ part, count, result }, index) => (
          <View key={part.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.number, { backgroundColor: theme.tint }]}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.fileName, { color: theme.text }]}>
                  {part.source.name}
                </Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  {count === undefined
                    ? 'Reading…'
                    : count === 'error'
                      ? 'Unreadable'
                      : `${count} pages`}
                </Text>
              </View>
              {count === undefined && <ActivityIndicator color={theme.textSecondary} />}
            </View>

            <TextInput
              value={part.range}
              onChangeText={(range) => update(part.id, { range })}
              placeholder="All pages (e.g. 1-170, 200-end)"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.rangeInput,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: result && !result.ok ? theme.danger : theme.border,
                },
              ]}
            />
            {result && (
              <Text
                style={[styles.meta, { color: result.ok ? theme.textSecondary : theme.danger }]}>
                {result.ok ? `→ ${result.indices.length} pages` : result.error}
              </Text>
            )}

            <View style={styles.actions}>
              <IconButton icon="arrow-up" disabled={index === 0} onPress={() => move(index, -1)} />
              <IconButton
                icon="arrow-down"
                disabled={index === parts.length - 1}
                onPress={() => move(index, 1)}
              />
              <Pressable
                onPress={() => choose({ mode: 'insert', partId: part.id })}
                disabled={typeof count !== 'number'}
                style={[styles.insertButton, { borderColor: theme.border }]}>
                <Ionicons name="return-down-forward" size={16} color={theme.tint} />
                <Text style={[styles.insertText, { color: theme.tint }]}>
                  Insert PDF after page…
                </Text>
              </Pressable>
              <IconButton
                icon="copy-outline"
                onPress={() =>
                  setParts((ps) => [
                    ...ps.slice(0, index + 1),
                    { ...part, id: makeId('m') },
                    ...ps.slice(index + 1),
                  ])
                }
              />
              <IconButton
                icon="trash-outline"
                danger
                onPress={() => setParts((ps) => ps.filter((p) => p.id !== part.id))}
              />
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => choose({ mode: 'add' })}
          style={[styles.addButton, { borderColor: theme.tint }]}>
          <Ionicons name="add" size={20} color={theme.tint} />
          <Text style={[styles.addText, { color: theme.tint }]}>Add PDF</Text>
        </Pressable>

        {parts.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>File name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={outputName}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.rangeInput,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            />
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
          onPress={merge}
          disabled={!ready || busy}
          style={[styles.primary, { backgroundColor: theme.tint, opacity: ready ? 1 : 0.4 }]}>
          <Ionicons name="git-merge-outline" size={20} color="#fff" />
          <Text style={styles.primaryText}>
            {parts.length === 0 ? 'Add PDFs to merge' : `Merge · ${totalPages} pages`}
          </Text>
        </Pressable>
      </View>

      <LibraryPdfPicker
        visible={picking !== null}
        multiple={picking?.mode === 'add'}
        onCancel={() => setPicking(null)}
        onDone={(docs) => {
          const target = picking!;
          setPicking(null);
          onPicked(target, docs.map(fromDoc));
        }}
      />
      <TextPromptModal
        visible={inserting !== null}
        title={inserting ? `Insert "${inserting.source.name}" after page…` : ''}
        placeholder="Page number, e.g. 170"
        confirmLabel="Insert"
        onCancel={() => setInserting(null)}
        onSubmit={insertAfter}
      />
      {busy && <BusyOverlay label="Merging…" />}
    </KeyboardAvoidingView>
  );
}

function IconButton({
  icon,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.iconButton, { borderColor: theme.border, opacity: disabled ? 0.3 : 1 }]}>
      <Ionicons name={icon} size={18} color={danger ? theme.danger : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  help: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: '#fff', fontWeight: '800' },
  fileName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
  rangeInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertButton: {
    flex: 1,
    minWidth: 150,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  insertText: { fontSize: 13, fontWeight: '700' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
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
