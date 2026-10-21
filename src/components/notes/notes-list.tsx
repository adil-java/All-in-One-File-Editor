import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirm } from '@/components/confirm-dialog';
import { errorText, toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showActionSheet } from '@/lib/action-sheet';
import {
  createNote,
  deleteNote,
  type Note,
  noteMatches,
  shareNote,
  updateNote,
  useNotes,
} from '@/lib/notes';

const INK = '#1F2328';
const INK_SECONDARY = '#59636E';

/** Quick notes and to-do lists, stored on the device. */
export function NotesList() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notes = useNotes();
  const [query, setQuery] = useState('');
  const visible = notes.filter((note) => noteMatches(note, query));

  const open = (note: Note) => router.push({ pathname: '/note/[id]', params: { id: note.id } });
  const create = (kind: Note['kind']) => open(createNote(kind));

  const share = async (note: Note) => {
    try {
      if (!(await shareNote(note)))
        toast.show({ title: 'Nothing to share yet', message: 'This note is empty.' });
    } catch (error) {
      toast.error('Could not share', errorText(error));
    }
  };

  /** Long-press menu on a note card. */
  const showActions = (note: Note) =>
    showActionSheet(note.title.trim() || 'Note', [
      { label: 'Share', icon: 'share-outline', onPress: () => share(note) },
      {
        label: note.pinned ? 'Unpin' : 'Pin to top',
        icon: note.pinned ? 'pin' : 'pin-outline',
        onPress: () => updateNote(note.id, { pinned: !note.pinned }),
      },
      {
        label: 'Delete',
        icon: 'trash-outline',
        destructive: true,
        onPress: () =>
          confirm({
            title: 'Delete note?',
            message: 'This note will be permanently removed.',
            tone: 'danger',
            buttons: [
              { label: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
              { label: 'Cancel', style: 'cancel' },
            ],
          }),
      },
    ]);

  return (
    <View style={styles.container}>
      <Text style={[styles.pageTitle, { color: theme.text, paddingTop: insets.top + Spacing.two }]}>
        Notes
      </Text>
      <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(note) => note.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.list,
          visible.length === 0 && styles.emptyList,
          { paddingBottom: insets.bottom + 96 },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="create-outline" size={56} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {query ? 'No matching notes' : 'No notes yet'}
            </Text>
            {!query && (
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                Jot down quick notes and to-do lists. They are saved on this device.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <NoteCard note={item} onPress={() => open(item)} onLongPress={() => showActions(item)} />
        )}
      />

      <View style={[styles.actions, { bottom: insets.bottom + Spacing.four }]}>
        <Pressable
          onPress={() => create('checklist')}
          style={[styles.fab, styles.fabSecondary, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="checkbox-outline" size={20} color={theme.text} />
          <Text style={[styles.fabText, { color: theme.text }]}>To-do</Text>
        </Pressable>
        <Pressable
          onPress={() => create('note')}
          style={[styles.fab, { backgroundColor: theme.tint }]}>
          <Ionicons name="add" size={22} color={theme.tintText} />
          <Text style={[styles.fabText, { color: theme.tintText }]}>Note</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NoteCard({
  note,
  onPress,
  onLongPress,
}: {
  note: Note;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const ink = note.color ? INK : theme.text;
  const inkSecondary = note.color ? INK_SECONDARY : theme.textSecondary;
  const done = note.items.filter((i) => i.done).length;
  const items = note.items.filter((i) => i.text.trim());

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: note.color ?? theme.backgroundElement,
          borderColor: note.color ? 'transparent' : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.cardHeader}>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: ink }]}>
          {note.title || (note.kind === 'checklist' ? 'To-do list' : 'Untitled')}
        </Text>
        {note.pinned && <Ionicons name="pin" size={14} color={inkSecondary} />}
      </View>
      {note.kind === 'note' ? (
        <Text numberOfLines={6} style={[styles.cardBody, { color: inkSecondary }]}>
          {note.body}
        </Text>
      ) : (
        <View style={styles.cardItems}>
          {items.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.cardItem}>
              <Ionicons
                name={item.done ? 'checkbox' : 'square-outline'}
                size={14}
                color={item.done ? theme.tint : inkSecondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.cardItemText,
                  { color: item.done ? inkSecondary : ink },
                  item.done && styles.done,
                ]}>
                {item.text}
              </Text>
            </View>
          ))}
          {items.length > 0 && (
            <Text style={[styles.progress, { color: inkSecondary }]}>
              {done}/{note.items.length} done
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 30, fontWeight: '800', paddingHorizontal: Spacing.three },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.three,
    marginBottom: 0,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.two + 2 },
  list: { padding: Spacing.three, gap: Spacing.three },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: Spacing.three },
  empty: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.five },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: Spacing.two },
  emptyBody: { fontSize: 15, textAlign: 'center' },
  card: {
    flex: 1,
    minHeight: 110,
    maxWidth: '50%',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: { flexDirection: 'row', gap: Spacing.one, alignItems: 'flex-start' },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 19 },
  cardItems: { gap: 4 },
  cardItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardItemText: { flex: 1, fontSize: 14 },
  done: { textDecorationLine: 'line-through' },
  progress: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  actions: {
    position: 'absolute',
    right: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  fab: {
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
  fabSecondary: { paddingHorizontal: Spacing.three },
  fabText: { fontSize: 16, fontWeight: '600' },
});
