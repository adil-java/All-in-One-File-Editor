import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

/** Native action sheet on iOS, alert-style menu elsewhere. */
export function showActionSheet(title: string, actions: SheetAction[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.label), 'Cancel'],
        destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.onPress(),
    );
  } else {
    Alert.alert(title, undefined, [
      ...actions.map((a) => ({
        text: a.label,
        style: a.destructive ? ('destructive' as const) : ('default' as const),
        onPress: a.onPress,
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}
