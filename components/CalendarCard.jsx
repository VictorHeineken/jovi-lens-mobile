import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import {
  connectCalendar,
  disconnectCalendar,
  listAccountCalendars,
  openAndroidAccounts,
  readCalendarSettings,
  setEventOverride,
  setSelectedCalendars,
  subjectNamesFrom,
  syncCalendar,
} from '../services/calendarSync.js';
import { formatEventDate } from '../shared/studyCalendar.js';

function relativeTime(iso) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// Profile "Agenda Google" card: read-only sync of the signed-in account's
// calendars, detected exams, and per-event subject fixes.
export default function CalendarCard() {
  const { user, subjects, studyCalendar, setStudyCalendar } = useAppData();
  const [settings, setSettings] = useState(readCalendarSettings);
  const [calendars, setCalendars] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { text, action? }
  const [picking, setPicking] = useState(null); // { instanceId, title }
  const subjectNames = useMemo(() => subjectNamesFrom(subjects), [subjects]);
  const connected = settings.connected && studyCalendar.provider === 'google';

  useEffect(() => {
    if (!user || !settings.connected || !settings.account) return undefined;
    let active = true;
    listAccountCalendars(settings.account).then((list) => { if (active) setCalendars(list); }).catch(() => {});
    return () => { active = false; };
  }, [user, settings.connected, settings.account]);

  async function run(task) {
    setBusy(true);
    try {
      await task();
    } catch {
      setNotice({ text: 'Não foi possível ler a agenda agora. Tente novamente.' });
    } finally {
      setSettings(readCalendarSettings());
      setBusy(false);
    }
  }

  function resync() {
    return run(() => syncCalendar({ subjectNames, setStudyCalendar }));
  }

  function handleConnect() {
    setNotice(null);
    return run(async () => {
      const result = await connectCalendar(user.email, { subjectNames, setStudyCalendar });
      if (result.status === 'denied') setNotice({ text: result.message });
      if (result.status === 'no_calendars') setNotice({ text: result.message, action: { label: 'Abrir contas do Android', onPress: openAndroidAccounts } });
    });
  }

  async function handleDisconnect() {
    const text = await disconnectCalendar({ setStudyCalendar });
    setSettings(readCalendarSettings());
    setCalendars([]);
    setNotice({ text });
  }

  function toggleCalendar(id) {
    const selected = settings.selectedCalendarIds.includes(id)
      ? settings.selectedCalendarIds.filter((item) => item !== id)
      : [...settings.selectedCalendarIds, id];
    setSelectedCalendars(selected);
    resync();
  }

  function applyPick(patch) {
    if (!picking) return;
    setEventOverride(picking.instanceId, patch);
    setPicking(null);
    resync();
  }

  const now = new Date();
  const detected = studyCalendar.events.filter((event) => event.type === 'exam' && new Date(event.startsAt) >= now).slice(0, 5);

  return (
    <View className={`gap-3 rounded-2xl border p-4 ${connected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-slate-900">Agenda Google</Text>
          <Text className="text-[12px] text-slate-500">Leitura somente — o JOVI Lens nunca cria ou altera eventos.</Text>
        </View>
        <Icon name="calendar" size={18} color="#4f46e5" />
      </View>

      {!user ? (
        <Text className="text-[13px] text-slate-600">Entre com Google para sincronizar sua agenda.</Text>
      ) : !settings.connected ? (
        <Pressable accessibilityRole="button" onPress={handleConnect} disabled={busy} accessibilityState={{ busy }} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
          <Icon name="calendar" size={16} color="#ffffff" />
          <Text className="text-[14px] font-semibold text-white">{busy ? 'Conectando…' : 'Conectar agenda'}</Text>
        </Pressable>
      ) : (
        <>
          <View className="rounded-xl bg-white px-3 py-2">
            <Text className="text-[12px] font-semibold text-slate-700">{settings.account}</Text>
            {settings.lastSyncAt ? <Text className="text-[11px] text-slate-500">Sincronizado {relativeTime(settings.lastSyncAt)}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={resync} disabled={busy} accessibilityState={{ busy }} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5">
            <Icon name="rotate" size={14} color="#ffffff" />
            <Text className="text-[13px] font-semibold text-white">{busy ? 'Sincronizando…' : 'Sincronizar agora'}</Text>
          </Pressable>

          {calendars.length ? (
            <View className="gap-1.5">
              <Text className="text-[12px] font-semibold text-slate-600">Agendas</Text>
              {calendars.map((calendar) => {
                const checked = settings.selectedCalendarIds.includes(calendar.id);
                return (
                  <Pressable
                    key={calendar.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    onPress={() => toggleCalendar(calendar.id)}
                    className="flex-row items-center gap-2 rounded-xl bg-white px-3 py-2"
                  >
                    <View className={`h-5 w-5 items-center justify-center rounded border ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>
                      {checked ? <Icon name="check" size={13} color="#ffffff" /> : null}
                    </View>
                    <Text className="flex-1 text-[13px] text-slate-700">{calendar.name}{calendar.isPrimary ? ' · principal' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View className="gap-1.5">
            <Text className="text-[12px] font-semibold text-slate-600">Provas detectadas</Text>
            {detected.length ? detected.map((event) => (
              <EventRow key={event.id} title={event.title} date={formatEventDate(event)} chip={event.subject} onPick={() => setPicking({ instanceId: event.id, title: event.title })} />
            )) : <Text className="text-[12px] text-slate-500">Nenhuma prova nos próximos 60 dias.</Text>}
          </View>

          {settings.pending.length ? (
            <View className="gap-1.5">
              <Text className="text-[12px] font-semibold text-slate-600">Sem matéria</Text>
              {settings.pending.map((item) => (
                <EventRow key={item.instanceId} title={item.title} date={formatEventDate(item)} chip="Escolher matéria" onPick={() => setPicking({ instanceId: item.instanceId, title: item.title })} />
              ))}
            </View>
          ) : null}

          <Pressable accessibilityRole="button" onPress={handleDisconnect} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5">
            <Icon name="close" size={14} color="#475569" />
            <Text className="text-[12px] font-semibold text-slate-600">Desconectar</Text>
          </Pressable>
        </>
      )}

      {notice ? (
        <View className="gap-2 rounded-xl bg-white px-3 py-2.5" accessibilityRole="alert">
          <Text className="text-[12px] text-slate-600">{notice.text}</Text>
          {notice.action ? (
            <Pressable accessibilityRole="button" onPress={notice.action.onPress} className="self-start rounded-lg bg-indigo-50 px-3 py-1.5">
              <Text className="text-[12px] font-semibold text-indigo-600">{notice.action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SubjectPicker
        target={picking}
        subjectNames={subjectNames}
        onPick={(subject) => applyPick({ subject, ignored: false })}
        onIgnore={() => applyPick({ ignored: true })}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

function EventRow({ title, date, chip, onPick }) {
  return (
    <View className="gap-1 rounded-xl border border-indigo-100 bg-white px-3 py-2.5">
      <Text className="text-[13px] font-bold text-slate-900">{title}</Text>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[11px] text-slate-500">{date}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Matéria: ${chip}. Toque para trocar`} onPress={onPick} className="rounded-full bg-indigo-100 px-2.5 py-1">
          <Text className="text-[11px] font-semibold text-indigo-700">{chip}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SubjectPicker({ target, subjectNames, onPick, onIgnore, onClose }) {
  return (
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[70%] gap-2 rounded-t-3xl bg-white px-4 pb-8 pt-4">
          <Text className="text-[15px] font-bold text-slate-900" numberOfLines={2}>{target?.title}</Text>
          <ScrollView contentContainerClassName="gap-1.5">
            {subjectNames.map((name) => (
              <Pressable key={name} accessibilityRole="button" onPress={() => onPick(name)} className="rounded-xl border border-slate-200 px-3 py-2.5">
                <Text className="text-[14px] text-slate-700">{name}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={onIgnore} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
              <Text className="text-[14px] font-medium text-red-600">Não é prova</Text>
            </Pressable>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} className="items-center py-2">
            <Text className="text-[13px] font-medium text-slate-500">Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
