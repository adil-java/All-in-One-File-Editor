import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirm } from '@/components/confirm-dialog';
import { SelectionAction } from '@/components/selection-action';
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
  shareNotes,
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
  // Ids of selected notes while in selection mode; null when not selecting.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selecting = selected !== null;
  // Ignore ids of notes that were deleted meanwhile.
  const selectedNotes = selected ? notes.filter((n) => selected.has(n.id)) : [];
  const count = selectedNotes.length;
  const allSelected = selecting && visible.length > 0 && visible.every((n) => selected.has(n.id));
  const allPinned = count > 0 && selectedNotes.every((n) => n.pinned);

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

  const toggleSelected = (note: Note) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      return next;
    });

  const shareSelected = async () => {
    try {
      if (!(await shareNotes(selectedNotes)))
        toast.show({ title: 'Nothing to share yet', message: 'The selected notes are empty.' });
    } catch (error) {
      toast.error('Could not share', errorText(error));
    }
  };

  const togglePinSelected = () => {
    selectedNotes.forEach((n) => updateNote(n.id, { pinned: !allPinned }));
    setSelected(null);
  };

  const deleteSelected = () => {
    const ids = selectedNotes.map((n) => n.id);
    const noun = ids.length === 1 ? 'note' : 'notes';
    confirm({
      title: `Delete ${ids.length} ${noun}?`,
      message: `The selected ${noun} will be permanently removed.`,
      tone: 'danger',
      buttons: [
        {
          label: `Delete ${ids.length}`,
          style: 'destructive',
          onPress: () => {
            ids.forEach(deleteNote);
            setSelected(null);
            toast.success(`Deleted ${ids.length} ${noun}`);
          },
        },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
  };

  /** Long-press menu on a note card. */
  const showActions = (note: Note) =>
    showActionSheet(note.title.trim() || 'Note', [
      {
        label: 'Select',
        icon: 'checkmark-circle-outline',
        onPress: () => setSelected(new Set([note.id])),
      },
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
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        {selecting ? (
          <>
            <Pressable hitSlop={8} onPress={() => setSelected(null)}>
              <Text style={[styles.headerButton, { color: theme.tint }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.selectionTitle, { color: theme.text }]}>{count} selected</Text>
            <Pressable
              hitSlop={8}
              onPress={() =>
                setSelected(allSelected ? new Set() : new Set(visible.map((n) => n.id)))
              }>
              <Text style={[styles.headerButton, { color: theme.tint }]}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Notes</Text>
            {notes.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setSelected(new Set())}>
                <Text style={[styles.headerButton, { color: theme.tint }]}>Select</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
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
        extraData={selected}
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            checked={selecting ? selected.has(item.id) : undefined}
            onPress={() => (selecting ? toggleSelected(item) : open(item))}
            onLongPress={() => (selecting ? toggleSelected(item) : showActions(item))}
          />
        )}
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
          <SelectionAction
            icon="share-outline"
            label="Share"
            disabled={count === 0}
            onPress={shareSelected}
          />
          <SelectionAction
            icon={allPinned ? 'pin' : 'pin-outline'}
            label={allPinned ? 'Unpin' : 'Pin'}
            disabled={count === 0}
            onPress={togglePinSelected}
          />
          <SelectionAction
            icon="trash-outline"
            label={count > 0 ? `Delete (${count})` : 'Delete'}
            destructive
            disabled={count === 0}
            onPress={deleteSelected}
          />
        </View>
      ) : (
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
      )}
    </View>
  );
}

function NoteCard({
  note,
  checked,
  onPress,
  onLongPress,
}: {
  note: Note;
  /** Selection state while selecting; undefined when not selecting. */
  checked?: boolean;
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
          borderColor: checked ? theme.tint : note.color ? 'transparent' : theme.border,
          borderWidth: checked ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.cardHeader}>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: ink }]}>
          {note.title || (note.kind === 'checklist' ? 'To-do list' : 'Untitled')}
        </Text>
        {note.pinned && <Ionicons name="pin" size={14} color={inkSecondary} />}
        {/* In the title row, after the pin, so the two never overlap. */}
        {checked !== undefined && (
          <Ionicons
            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={checked ? theme.tint : inkSecondary}
          />
        )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
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
  pageTitle: { fontSize: 30, fontWeight: '800' },
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
