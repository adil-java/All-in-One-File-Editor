import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StorageAccessPrompt } from '@/components/storage-access-prompt';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';

/** First-launch page asking for file access (Android). */
export default function StorageAccessScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <StorageAccessPrompt
          onResult={(granted) => {
            if (granted) {
              toast.success('Access allowed', 'Your documents are in the Phone tab.');
              router.replace('/device');
            } else {
              toast.error('Access not allowed', 'You can allow it later from the Phone tab.');
            }
          }}
          onSkip={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
