import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import {
  hasStorageAccess,
  markStorageAccessAsked,
  runningInExpoGo,
  storageAccessAsked,
  storageAccessSupported,
} from '@/lib/device-files';

export default function TabsLayout() {
  const theme = useTheme();

  // On first launch, ask for file access the way file manager apps do.
  useEffect(() => {
    if (!storageAccessSupported || runningInExpoGo || storageAccessAsked()) return;
    markStorageAccessAsked();
    hasStorageAccess().then((granted) => {
      if (!granted) router.push('/storage-access');
    });
  }, []);

  return (
    <Tabs
      screenOptions={{
        // No header bar: each tab shows its own title in the page.
        headerShown: false,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Files',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="device"
        options={{
          title: 'Phone',
          // iOS apps can't browse the phone's storage; files come in through the picker.
          href: storageAccessSupported ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="phone-portrait-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
