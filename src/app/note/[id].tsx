import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { makeId } from '@/lib/editor/types';
import {
  type ChecklistItem,
  deleteIfEmpty,
  deleteNote,
  NOTE_COLORS,
  updateNote,
  useNote,
} from '@/lib/notes';

/** Text on colored note backgrounds, which are always light. */
const INK = '#1F2328';
const INK_SECONDARY = '#59636E';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const note = useNote(id);
  // Item to focus after it's added (Return on the previous item, or "Add item").
  const [focusId, setFocusId] = useState<string | null>(null);

  // A note that was opened and left empty isn't worth keeping.
  useEffect(() => () => deleteIfEmpty(id), [id]);

  if (!note) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Note' }} />
        <Text style={{ color: theme.textSecondary }}>This note was deleted.</Text>
      </View>
    );
  }

  const background = note.color ?? theme.background;
  const ink = note.color ? INK : theme.text;
  const inkSecondary = note.color ? INK_SECONDARY : theme.textSecondary;

  const setItems = (items: ChecklistItem[]) => updateNote(note.id, { items });
  const addItemAfter = (index: number) => {
    const item = { id: makeId('i'), text: '', done: false };
    setItems([...note.items.slice(0, index + 1), item, ...note.items.slice(index + 1)]);
    setFocusId(item.id);
  };

  /** Switches between a text note and a checklist, keeping the content. */
  const convert = () => {
    if (note.kind === 'note') {
      const lines = note.body.split('\n').filter((line) => line.trim());
      updateNote(note.id, {
        kind: 'checklist',
        body: '',
        items: (lines.length ? lines : ['']).map((text) => ({
          id: makeId('i'),
          text,
          done: false,
        })),
      });
    } else {
      updateNote(note.id, {
        kind: 'note',
        body: note.items
          .map((item) => item.text)
          .filter(Boolean)
          .join('\n'),
        items: [],
      });
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteNote(note.id);
          router.back();
        },
      },
    ]);

  const done = note.items.filter((item) => item.done).length;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: background },
          headerTintColor: ink,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable onPress={() => updateNote(note.id, { pinned: !note.pinned })} hitSlop={8}>
                <Ionicons name={note.pinned ? 'pin' : 'pin-outline'} size={22} color={ink} />
              </Pressable>
              <Pressable onPress={convert} hitSlop={8}>
                <Ionicons
                  name={note.kind === 'note' ? 'checkbox-outline' : 'document-text-outline'}
                  size={22}
                  color={ink}
                />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={note.title}
          onChangeText={(title) => updateNote(note.id, { title })}
          placeholder="Title"
          placeholderTextColor={inkSecondary}
          style={[styles.title, { color: ink }]}
          autoFocus={!note.title && note.kind === 'note' && !note.body}
        />

        {note.kind === 'note' ? (
          <TextInput
            value={note.body}
            onChangeText={(body) => updateNote(note.id, { body })}
            placeholder="Start typing…"
            placeholderTextColor={inkSecondary}
            multiline
            scrollEnabled={false}
            style={[styles.body, { color: ink }]}
          />
        ) : (
          <View style={styles.checklist}>
            {note.items.length > 0 && (
              <Text style={[styles.progress, { color: inkSecondary }]}>
                {done}/{note.items.length} done
              </Text>
            )}
            {note.items.map((item, index) => (
              <View key={item.id} style={styles.item}>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    setItems(
                      note.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                    )
                  }>
                  <Ionicons
                    name={item.done ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={item.done ? theme.tint : inkSecondary}
                  />
                </Pressable>
                <TextInput
                  value={item.text}
                  onChangeText={(text) =>
                    setItems(note.items.map((i) => (i.id === item.id ? { ...i, text } : i)))
                  }
                  placeholder="To-do"
                  placeholderTextColor={inkSecondary}
                  autoFocus={item.id === focusId}
                  onSubmitEditing={() => addItemAfter(index)}
                  submitBehavior="submit"
                  returnKeyType="next"
                  style={[
                    styles.itemText,
                    { color: item.done ? inkSecondary : ink },
                    item.done && styles.itemDone,
                  ]}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => setItems(note.items.filter((i) => i.id !== item.id))}>
                  <Ionicons name="close" size={20} color={inkSecondary} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addItem} onPress={() => addItemAfter(note.items.length - 1)}>
              <Ionicons name="add" size={22} color={inkSecondary} />
              <Text style={{ color: inkSecondary, fontSize: 16 }}>Add item</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={styles.colors}>
        <Pressable
          onPress={() => updateNote(note.id, { color: null })}
          style={[
            styles.swatch,
            {
              backgroundColor: theme.background,
              borderColor: note.color ? theme.border : theme.tint,
            },
          ]}
        />
        {NOTE_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => updateNote(note.id, { color })}
            style={[
              styles.swatch,
              { backgroundColor: color, borderColor: note.color === color ? theme.tint : '#0001' },
            ]}
          />
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: Spacing.three },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  title: { fontSize: 24, fontWeight: '700', paddingVertical: Spacing.one },
  body: { fontSize: 17, lineHeight: 24, minHeight: 200, textAlignVertical: 'top' },
  checklist: { gap: Spacing.one },
  progress: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.one },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  itemText: { flex: 1, fontSize: 17, paddingVertical: Spacing.two },
  itemDone: { textDecorationLine: 'line-through' },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  colors: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    paddingBottom: Spacing.four,
    justifyContent: 'center',
  },
  swatch: { width: 30, height: 30, borderRadius: Radius.lg, borderWidth: 2 },
});
