import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FormField, FormValue } from '@/lib/pdf/forms';

type Props = {
  visible: boolean;
  fields: FormField[];
  onCancel: () => void;
  /** Called with only the fields whose values changed. */
  onApply: (values: Record<string, FormValue>, flatten: boolean) => void;
};

/** Lists the PDF's fillable form fields and edits their values. */
export function FormPanel(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onCancel}>
      {/* Mounted only while visible so edits reset each time it opens. */}
      {props.visible && <FormPanelContent {...props} />}
    </Modal>
  );
}

function FormPanelContent({ fields, onCancel, onApply }: Props) {
  const theme = useTheme();
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );
  const [flatten, setFlatten] = useState(false);

  const changed = Object.fromEntries(
    fields.filter((f) => values[f.name] !== f.value).map((f) => [f.name, values[f.name]]),
  );
  const canApply = Object.keys(changed).length > 0 || flatten;
  const setValue = (name: string, value: FormValue) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={[styles.headerButton, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Form fields</Text>
          <Pressable onPress={() => onApply(changed, flatten)} hitSlop={8} disabled={!canApply}>
            <Text style={[styles.headerButton, { color: theme.tint, opacity: canApply ? 1 : 0.4 }]}>
              Apply
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {fields.map((field) => (
            <View
              key={field.name}
              style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
                  {field.name}
                </Text>
                {field.readOnly && (
                  <Text style={[styles.badge, { color: theme.textSecondary }]}>Read-only</Text>
                )}
                {field.type === 'checkbox' && (
                  <Switch
                    value={values[field.name] === true}
                    disabled={field.readOnly}
                    onValueChange={(v) => setValue(field.name, v)}
                    trackColor={{ true: theme.tint }}
                  />
                )}
              </View>

              {field.type === 'text' && (
                <TextInput
                  value={(values[field.name] as string) ?? ''}
                  onChangeText={(v) => setValue(field.name, v)}
                  editable={!field.readOnly}
                  multiline={field.multiline}
                  placeholder="Empty"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    field.multiline && styles.multiline,
                    {
                      color: theme.text,
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                      opacity: field.readOnly ? 0.6 : 1,
                    },
                  ]}
                />
              )}

              {field.type === 'choice' && (
                <View style={styles.options}>
                  {field.options.map((option) => {
                    const selected = values[field.name] === option;
                    return (
                      <Pressable
                        key={option}
                        disabled={field.readOnly}
                        // Tapping the selected option again clears it.
                        onPress={() => setValue(field.name, selected ? null : option)}
                        style={[
                          styles.option,
                          {
                            borderColor: selected ? theme.tint : theme.border,
                            backgroundColor: selected ? theme.tint : theme.background,
                          },
                        ]}>
                        <Text style={{ color: selected ? theme.tintText : theme.text }}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ))}

          <View
            style={[styles.field, styles.labelRow, { backgroundColor: theme.backgroundElement }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.label, { color: theme.text }]}>Lock fields</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Merge the values into the page so the form can no longer be changed.
              </Text>
            </View>
            <Switch value={flatten} onValueChange={setFlatten} trackColor={{ true: theme.tint }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  title: { fontSize: 17, fontWeight: '600' },
  headerButton: { fontSize: 16, fontWeight: '600' },
  list: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  field: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
