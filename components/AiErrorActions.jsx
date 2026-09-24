import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from './Icon.jsx';
import { isRetryableError } from '../services/apiErrors.js';
import { signIn } from '../services/googleAuth.js';

const KEY_CODES = new Set(['CREDITS_EXHAUSTED', 'BYOK_REJECTED', 'BYOK_INVALID_FORMAT']);

// The follow-up button shown under an AI error (prod-implementation-spec.md
// §6.7). `onNavigateAway` lets a screen shown inside a Modal close itself
// before navigating to the Copilot tab, which would otherwise open behind it.
export default function AiErrorActions({ error, onRetry, onNavigateAway }) {
  const router = useRouter();
  if (!error) return null;

  if (KEY_CODES.has(error.code)) {
    return (
      <ActionButton
        icon="lock"
        label="Adicionar minha chave"
        onPress={() => {
          onNavigateAway?.();
          router.push('/(tabs)/copilot');
        }}
      />
    );
  }

  if (error.code === 'SIGN_IN_REQUIRED') {
    return (
      <ActionButton
        icon="user"
        label="Entrar com Google"
        onPress={() => {
          signIn()
            .then((user) => { if (user) onRetry?.(); })
            .catch((signInError) => Alert.alert('Entrar com Google', signInError.message || 'Não foi possível entrar com o Google.'));
        }}
      />
    );
  }

  if (isRetryableError(error) && onRetry) return <ActionButton icon="rotate" label="Tentar novamente" onPress={onRetry} />;
  return null;
}

function ActionButton({ icon, label, onPress }) {
  return (
    <View className="mt-2 flex-row">
      <Pressable accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-1.5 rounded-lg bg-white px-3 py-2">
        <Icon name={icon} size={14} color="#4f46e5" />
        <Text className="text-[12px] font-semibold text-indigo-600">{label}</Text>
      </Pressable>
    </View>
  );
}
