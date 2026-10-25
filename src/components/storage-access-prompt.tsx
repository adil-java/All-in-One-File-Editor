import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestStorageAccess, runningInExpoGo, usesAllFilesAccess } from '@/lib/device-files';

const REASONS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  {
    icon: 'documents-outline',
    text: 'See all PDF, Word, Excel and PowerPoint files on your phone',
  },
  { icon: 'logo-whatsapp', text: 'Open files you got on WhatsApp or downloaded, in one tap' },
  { icon: 'lock-closed-outline', text: 'Everything stays on your phone. Nothing is uploaded' },
];

type Props = {
  /** Called with whether access was granted when the user comes back from Settings. */
  onResult: (granted: boolean) => void;
  /** Shows a "Not now" link (first-launch page). */
  onSkip?: () => void;
};

/** Explains why the app wants file access and opens the system permission. */
export function StorageAccessPrompt({ onResult, onSkip }: Props) {
  const theme = useTheme();
  const [asking, setAsking] = useState(false);

  const allow = async () => {
    setAsking(true);
    try {
      onResult(await requestStorageAccess());
    } finally {
      setAsking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="folder-open" size={56} color={theme.tint} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>Allow access to your files</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        To show the documents on your phone, PDF Editor needs permission to access files.
      </Text>

      <View style={[styles.reasons, { backgroundColor: theme.backgroundElement }]}>
        {REASONS.map((reason) => (
          <View key={reason.icon} style={styles.reason}>
            <Ionicons name={reason.icon} size={22} color={theme.tint} />
            <Text style={[styles.reasonText, { color: theme.text }]}>{reason.text}</Text>
          </View>
        ))}
      </View>

      {runningInExpoGo && (
        <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="information-circle" size={22} color={theme.tint} />
          <Text style={[styles.noticeText, { color: theme.text }]}>
            Expo Go can’t get file access, so Android greys out its switch. Install the app build
            (APK) to use this. In Expo Go, add files with Import instead.
          </Text>
        </View>
      )}
      <Pressable
        onPress={allow}
        disabled={asking || runningInExpoGo}
        style={[styles.allow, { backgroundColor: theme.tint, opacity: runningInExpoGo ? 0.4 : 1 }]}>
        {asking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.allowText}>Allow access</Text>
        )}
      </Pressable>
      {usesAllFilesAccess && !runningInExpoGo && (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          On the next screen, turn on “Allow access to manage all files”, then go back.
        </Text>
      )}
      {onSkip && (
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={[styles.skip, { color: theme.textSecondary }]}>Not now</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  reasons: {
    alignSelf: 'stretch',
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  reasonText: { flex: 1, fontSize: 15 },
  allow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    marginTop: Spacing.two,
  },
  allowText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  notice: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 13, textAlign: 'center' },
  skip: { fontSize: 16, fontWeight: '600', padding: Spacing.two },
});
