import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

/** Cross-platform replacement for iOS-only `Alert.prompt`. */
export function TextPromptModal(props: Props) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      {/* Mounted only while visible so the input state resets each time it opens. */}
      {props.visible && <PromptBody {...props} />}
    </Modal>
  );
}

function PromptBody({
  title,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  multiline,
  onCancel,
  onSubmit,
}: Props) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    if (value.trim()) onSubmit(value);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
          onSubmitEditing={multiline ? undefined : submit}
          style={[
            styles.input,
            multiline && styles.multiline,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          ]}
        />
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.button}>
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            style={[
              styles.button,
              { backgroundColor: theme.tint, opacity: value.trim() ? 1 : 0.5 },
            ]}>
            <Text style={{ color: theme.tintText, fontWeight: '600' }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.three },
  title: { fontSize: 17, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.sm,
  },
});
