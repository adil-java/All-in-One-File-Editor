import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text style={{ color: theme.textSecondary }}>No documents yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
