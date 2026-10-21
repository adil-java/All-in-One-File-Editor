import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActionSheetHost } from '@/components/action-sheet';
import { ConfirmHost } from '@/components/confirm-dialog';
import { ToastHost } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();

  // PDF rendering (WebView) and file storage need a native device.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.unsupported, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          PDF Editor runs on iOS and Android
        </Text>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          Open it in Expo Go on your phone, or in an iOS simulator or Android emulator.
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.backgroundElement },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
        <ToastHost />
        <ConfirmHost />
        <ActionSheetHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  unsupported: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
});
