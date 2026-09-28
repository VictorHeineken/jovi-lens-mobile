import { Alert, Platform } from 'react-native';

// Promise-based confirmation for destructive actions. react-native-web's
// Alert.alert is a no-op, so the browser preview falls back to window.confirm
// — otherwise every "Excluir" silently did nothing (or nothing asked) there.
export function confirmAction({ title, message, confirmLabel = 'Confirmar', destructive = false }) {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof globalThis.confirm === 'function' && globalThis.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
