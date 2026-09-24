import { useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { disableExamReminders, enableExamReminders, getExamRemindersEnabled } from '../services/notifications.js';

// Profile "Lembretes de prova" card: local notifications at 19:00, 3 days and
// 1 day before each exam in the study calendar.
export default function ExamRemindersCard() {
  const { studyCalendar } = useAppData();
  const [enabled, setEnabled] = useState(getExamRemindersEnabled);
  const [denied, setDenied] = useState(false);

  async function toggle(next) {
    setDenied(false);
    if (!next) {
      setEnabled(false);
      await disableExamReminders();
      return;
    }
    const result = await enableExamReminders(studyCalendar);
    setEnabled(result === 'enabled');
    setDenied(result === 'denied');
  }

  return (
    <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center gap-3">
        <Icon name="clock" size={18} color="#4f46e5" />
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-slate-900">Lembretes de prova</Text>
          <Text className="text-[12px] text-slate-500">Aviso às 19h, 3 dias e 1 dia antes de cada prova da sua agenda.</Text>
        </View>
        <Switch value={enabled} onValueChange={toggle} accessibilityLabel="Lembretes de prova" />
      </View>
      {denied ? (
        <View className="gap-2 rounded-xl bg-amber-50 px-3 py-2.5" accessibilityRole="alert">
          <Text className="text-[12px] text-amber-800">Permita notificações nas configurações do Android para receber lembretes.</Text>
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} className="self-start rounded-lg bg-white px-3 py-1.5">
            <Text className="text-[12px] font-semibold text-amber-800">Abrir configurações</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
