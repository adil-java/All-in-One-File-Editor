import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnotationLayer } from '@/components/editor/annotation-layer';
import { PageView } from '@/components/editor/page-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { rotatedSize } from '@/lib/editor/geometry';
import type { EditorAction } from '@/lib/editor/history';
import type { EditorPage } from '@/lib/editor/types';
import { usePdfRendererContext } from '@/lib/pdf-renderer/use-pdf-renderer';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type Props = {
  visible: boolean;
  pages: EditorPage[];
  dispatch: (action: EditorAction) => void;
  onClose: () => void;
  /** Jump to a page in the editor. */
  onOpenPage: (index: number) => void;
  /** Insert a blank page after `index` (or at the end when null). */
  onAddBlankPage: (afterIndex: number | null) => void;
  /** Append the pages of another PDF after `index` (or at the end when null). */
  onMergePdf: (afterIndex: number | null) => void;
};

const COLUMNS = 3;
const THUMB_HEIGHT = 150;

export function PageManager({
  visible,
  pages,
  dispatch,
  onClose,
  onOpenPage,
  onAddBlankPage,
  onMergePdf,
}: Props) {
  const theme = useTheme();
  const renderer = usePdfRendererContext();
  const { width: windowWidth } = useWindowDimensions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedIndex = pages.findIndex((p) => p.key === selectedKey);
  const selected = selectedIndex >= 0 ? pages[selectedIndex] : null;
  const cellWidth = (windowWidth - Spacing.three * 2 - Spacing.three * (COLUMNS - 1)) / COLUMNS;

  const pageActions: { label: string; icon: IconName; onPress: () => void; disabled?: boolean }[] =
    selected
      ? [
          {
            label: 'Left',
            icon: 'rotate-left',
            onPress: () => dispatch({ type: 'rotate-page', pageKey: selected.key, delta: -90 }),
          },
          {
            label: 'Right',
            icon: 'rotate-right',
            onPress: () => dispatch({ type: 'rotate-page', pageKey: selected.key, delta: 90 }),
          },
          {
            label: 'Earlier',
            icon: 'arrow-left',
            disabled: selectedIndex === 0,
            onPress: () =>
              dispatch({ type: 'move-page', from: selectedIndex, to: selectedIndex - 1 }),
          },
          {
            label: 'Later',
            icon: 'arrow-right',
            disabled: selectedIndex === pages.length - 1,
            onPress: () =>
              dispatch({ type: 'move-page', from: selectedIndex, to: selectedIndex + 1 }),
          },
          {
            label: 'Duplicate',
            icon: 'content-copy',
            onPress: () => dispatch({ type: 'duplicate-page', pageKey: selected.key }),
          },
          {
            label: 'Delete',
            icon: 'trash-can-outline',
            disabled: pages.length === 1,
            onPress: () => {
              dispatch({ type: 'delete-page', pageKey: selected.key });
              setSelectedKey(null);
            },
          },
        ]
      : [
          {
            label: 'Blank page',
            icon: 'file-plus-outline',
            onPress: () => onAddBlankPage(null),
          },
          { label: 'Merge PDF', icon: 'file-import-outline', onPress: () => onMergePdf(null) },
        ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Pages <Text style={{ color: theme.textSecondary }}>({pages.length})</Text>
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.done, { color: theme.tint }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.grid}>
          {pages.map((page, index) => {
            const info = renderer.pages[page.sourceIndex];
            const isSelected = page.key === selectedKey;
            const size = info && rotatedSize(info.width, info.height, page.rotation);
            // Fit the thumbnail inside the cell, keeping the page's aspect ratio.
            const scale = size ? Math.min(cellWidth / size.width, THUMB_HEIGHT / size.height) : 0;
            return (
              <Pressable
                key={page.key}
                onPress={() => setSelectedKey(isSelected ? null : page.key)}
                onLongPress={() => onOpenPage(index)}
                style={[styles.cell, { width: cellWidth }]}>
                <View
                  style={[
                    styles.thumbFrame,
                    {
                      height: THUMB_HEIGHT + 8,
                      borderColor: isSelected ? theme.tint : 'transparent',
                    },
                  ]}>
                  {info && size ? (
                    <PageView
                      sourceIndex={page.sourceIndex}
                      rotation={page.rotation}
                      width={size.width * scale}
                      height={size.height * scale}>
                      <AnnotationLayer
                        annotations={page.annotations}
                        base={info}
                        rotation={page.rotation}
                        width={size.width * scale}
                        height={size.height * scale}
                      />
                    </PageView>
                  ) : (
                    <View
                      style={[styles.placeholder, { backgroundColor: theme.backgroundSelected }]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.pageNumber,
                    { color: isSelected ? theme.tint : theme.textSecondary },
                  ]}>
                  {index + 1}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          style={[
            styles.actions,
            { borderTopColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}>
          {!selected && (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Tap a page to edit it · long-press to open it
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionRow}>
            {pageActions.map((action) => (
              <Pressable
                key={action.label}
                disabled={action.disabled}
                onPress={action.onPress}
                style={[styles.action, { opacity: action.disabled ? 0.35 : 1 }]}>
                <MaterialCommunityIcons
                  name={action.icon}
                  size={22}
                  color={action.label === 'Delete' ? theme.danger : theme.text}
                />
                <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            {selected && (
              <>
                <Pressable onPress={() => onAddBlankPage(selectedIndex)} style={styles.action}>
                  <MaterialCommunityIcons name="file-plus-outline" size={22} color={theme.text} />
                  <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>
                    Insert after
                  </Text>
                </Pressable>
                <Pressable onPress={() => onOpenPage(selectedIndex)} style={styles.action}>
                  <MaterialCommunityIcons name="open-in-app" size={22} color={theme.text} />
                  <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>Open</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
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
  title: { fontSize: 20, fontWeight: '700' },
  done: { fontSize: 16, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  cell: { alignItems: 'center', gap: Spacing.one },
  thumbFrame: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: Radius.sm,
  },
  placeholder: { width: '80%', height: '90%', borderRadius: 4 },
  pageNumber: { fontSize: 13, fontWeight: '600' },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  hint: { fontSize: 12, textAlign: 'center' },
  actionRow: { paddingHorizontal: Spacing.two, gap: Spacing.one },
  action: {
    alignItems: 'center',
    gap: 2,
    minWidth: 68,
    paddingVertical: Spacing.two,
  },
  actionLabel: { fontSize: 11, fontWeight: '500' },
});
