import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.backgroundElement },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}>
          <Stack.Screen name="index" options={{ title: 'PDF Editor' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
