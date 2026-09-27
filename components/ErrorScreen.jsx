import { Pressable, Text, View } from 'react-native';
import Icon from './Icon.jsx';

// Route-level error boundary (expo-router renders this instead of a crashed
// screen). Tells the student what happened in plain terms and offers the one
// action that usually works; the error itself goes to the log for debugging.
export default function ErrorScreen({ error, retry }) {
  if (error) console.error('[JOVI] tela falhou ao renderizar:', error?.message ?? String(error));
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-100">
        <Icon name="info" size={26} color="#b45309" />
      </View>
      <Text className="text-center text-[19px] font-bold text-slate-900">Esta tela não abriu</Text>
      <Text className="text-center text-[13px] leading-5 text-slate-600">Suas fotos e notas continuam salvas. Tente abrir de novo; se repetir, feche e reabra o app.</Text>
      <Pressable accessibilityRole="button" onPress={retry} className="mt-2 flex-row items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3">
        <Icon name="rotate" size={16} color="#ffffff" />
        <Text className="text-[14px] font-semibold text-white">Tentar de novo</Text>
      </Pressable>
    </View>
  );
}
