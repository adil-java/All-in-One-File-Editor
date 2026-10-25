import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatSize, listDocuments, type PdfDocument } from '@/lib/documents';

type Props = {
  visible: boolean;
  multiple?: boolean;
  onCancel: () => void;
  onDone: (docs: PdfDocument[]) => void;
};

/** Lists the PDFs in the library to pick from. */
export function LibraryPdfPicker(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onCancel}>
      {/* Mounted only while visible, so the list and selection are fresh each time. */}
      {props.visible && <PickerContent {...props} />}
    </Modal>
  );
}

function PickerContent({ multiple, onCancel, onDone }: Omit<Props, 'visible'>) {
  const theme = useTheme();
  const [pdfs] = useState(() => listDocuments().filter((d) => d.kind === 'pdf'));
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (doc: PdfDocument) => {
    if (!multiple) return onDone([doc]);
    setSelected((s) => (s.includes(doc.id) ? s.filter((id) => id !== doc.id) : [...s, doc.id]));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={[styles.headerButton, { color: theme.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Choose PDF{multiple ? 's' : ''}</Text>
        {multiple ? (
          <Pressable
            onPress={() => onDone(selected.map((id) => pdfs.find((d) => d.id === id)!))}
            disabled={selected.length === 0}
            hitSlop={8}>
            <Text
              style={[
                styles.headerButton,
                { color: theme.tint, opacity: selected.length ? 1 : 0.4 },
              ]}>
              Add{selected.length ? ` (${selected.length})` : ''}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>
      <FlatList
        data={pdfs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            No PDFs in your files yet. Use “From device” instead.
          </Text>
        }
        renderItem={({ item }) => {
          // Selection order is the order the files are added in.
          const order = selected.indexOf(item.id);
          return (
            <Pressable
              onPress={() => toggle(item)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>PDF</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
                  {item.name}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {formatSize(item.size)}
                </Text>
              </View>
              {multiple &&
                (order >= 0 ? (
                  <View style={[styles.order, { backgroundColor: theme.tint }]}>
                    <Text style={styles.orderText}>{order + 1}</Text>
                  </View>
                ) : (
                  <Ionicons name="ellipse-outline" size={24} color={theme.textSecondary} />
                ))}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  title: { fontSize: 17, fontWeight: '700' },
  headerButton: { fontSize: 16, fontWeight: '600' },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five, fontSize: 15 },
  row: {
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
  name: { fontSize: 16, fontWeight: '600' },
  order: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
