import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StorageAccessPrompt } from '@/components/storage-access-prompt';
import { errorText, toast } from '@/components/toast';
import { BusyOverlay } from '@/components/tools/busy-overlay';
import { FILE_BADGES } from '@/constants/file-badges';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  type DeviceFile,
  hasStorageAccess,
  scanDeviceFiles,
  shortFolder,
} from '@/lib/device-files';
import {
  type DocumentKind,
  editorRouteFor,
  formatDate,
  formatSize,
  importDocument,
  listDocuments,
} from '@/lib/documents';

const FILTERS: { kind: DocumentKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'pdf', label: 'PDF' },
  { kind: 'docx', label: 'Word' },
  { kind: 'xlsx', label: 'Excel' },
  { kind: 'pptx', label: 'PowerPoint' },
];

/** Opens a phone file, reusing the library copy if it was opened before. */
async function openDeviceFile(file: DeviceFile) {
  const name = file.name.replace(/\.(pdf|docx|xlsx|pptx)$/i, '');
  const existing = listDocuments().find(
    (d) => d.kind === file.kind && d.size === file.size && d.name.startsWith(name),
  );
  const doc = existing ?? (await importDocument(file.uri, name, file.kind));
  router.push(editorRouteFor(doc));
}

export default function DeviceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // null while checking.
  const [access, setAccess] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DeviceFile[] | null>(null);
  const [found, setFound] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<DocumentKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setFound(0);
    try {
      setFiles(await scanDeviceFiles(setFound));
    } catch (error) {
      toast.error('Could not read your files', errorText(error));
    } finally {
      setScanning(false);
    }
  }, []);

  const checkAccess = useCallback(async () => {
    const granted = await hasStorageAccess();
    setAccess(granted);
    return granted;
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasStorageAccess().then((granted) => {
      if (cancelled) return;
      setAccess(granted);
      if (granted) scan();
    });
    return () => {
      cancelled = true;
    };
  }, [scan]);

  // Access can be turned on or off in Settings while the app is in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const granted = await checkAccess();
      if (granted && !files && !scanning) scan();
    });
    return () => subscription.remove();
  }, [checkAccess, scan, files, scanning]);

  const open = async (file: DeviceFile) => {
    setOpening(true);
    try {
      await openDeviceFile(file);
    } catch (error) {
      toast.error('Could not open the file', errorText(error));
    } finally {
      setOpening(false);
    }
  };

  const search = query.trim().toLowerCase();
  const visible = (files ?? []).filter(
    (f) =>
      (filter === 'all' || f.kind === filter) && (!search || f.name.toLowerCase().includes(search)),
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <Text style={[styles.pageTitle, { color: theme.text }]}>On this phone</Text>
    </View>
  );

  if (access === null) {
    return (
      <View style={styles.container}>
        {header}
        <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} />
      </View>
    );
  }

  if (!access) {
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <StorageAccessPrompt
            onResult={(granted) => {
              setAccess(granted);
              if (granted) scan();
              else toast.error('Access not allowed', 'Turn it on to see the files on your phone.');
            }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <View style={styles.controls}>
        <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search files on your phone"
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {!!query && (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => {
            const active = filter === f.kind;
            return (
              <Pressable
                key={f.kind}
                onPress={() => setFilter(f.kind)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? theme.tint : theme.backgroundElement },
                ]}>
                <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.uri}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}
        refreshControl={
          <RefreshControl refreshing={scanning && !!files} onRefresh={scan} colors={[theme.tint]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {scanning ? (
              <>
                <ActivityIndicator color={theme.tint} />
                <Text style={{ color: theme.textSecondary }}>
                  Looking for documents… {found > 0 ? `${found} found` : ''}
                </Text>
              </>
            ) : (
              <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
                {files?.length ? 'No files match.' : 'No documents found on this phone.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
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
              <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.textSecondary }]}>
                {formatSize(item.size)} · {formatDate(item.modified)} · {shortFolder(item.folder)}
              </Text>
            </View>
          </Pressable>
        )}
      />
      {opening && <BusyOverlay label="Opening…" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three },
  pageTitle: { fontSize: 30, fontWeight: '800' },
  controls: { gap: Spacing.two, paddingTop: Spacing.two },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.two + 2 },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.three },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  chipText: { fontSize: 14, fontWeight: '600' },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.five },
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
