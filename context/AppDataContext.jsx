import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  deleteMediaRecord,
  getAllMediaRecords,
  getNotes,
  getPlan,
  getUser,
  saveMediaRecord,
  setNotes as persistNotes,
  setPlan as persistPlan,
  setUser as persistUser,
} from '../services/storage.js';

const AppDataContext = createContext(null);

const ASSET_BASE = 'https://raw.githubusercontent.com/VAFLO-Challenge-Jovi/sprint-3-webdev/main/src/assets/imgs';

const samples = [
  { id: 'sample-1', src: `${ASSET_BASE}/default-photo.jpg`, createdAt: '2026-08-25T20:00:00.000Z', source: 'sample', label: 'Livro' },
  { id: 'sample-2', src: `${ASSET_BASE}/default-photo-text-found.jpg`, createdAt: '2026-08-24T18:30:00.000Z', source: 'sample', label: 'Texto detectado' },
  { id: 'sample-3', src: `${ASSET_BASE}/resultado-encontrado.jpg`, createdAt: '2026-08-23T15:10:00.000Z', source: 'sample', label: 'Resultado' },
  { id: 'sample-4', src: `${ASSET_BASE}/buscando-texto.jpg`, createdAt: '2026-08-22T11:45:00.000Z', source: 'sample', label: 'Pesquisa' },
];

export function AppDataProvider({ children }) {
  const [records, setRecords] = useState(samples);
  const [notes, setNotesState] = useState(() => getNotes());
  const [plan, setPlanState] = useState(() => getPlan());
  const [user, setUserState] = useState(() => getUser());

  useEffect(() => {
    getAllMediaRecords().then((stored) => setRecords([...stored, ...samples]));
  }, []);

  const addRecord = useCallback(async ({ src, source = 'upload', label = 'Nova imagem' }) => {
    const record = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      src,
      source,
      label,
      createdAt: new Date().toISOString(),
      analysis: null,
    };
    setRecords((current) => [record, ...current]);
    await saveMediaRecord(record);
    return record;
  }, []);

  const updateRecord = useCallback(async (id, patch) => {
    const current = records.find((item) => item.id === id);
    if (!current) return null;
    const updated = { ...current, ...patch };
    setRecords((items) => items.map((item) => item.id === id ? updated : item));
    if (updated.source !== 'sample') await saveMediaRecord(updated);
    return updated;
  }, [records]);

  const removeRecord = useCallback(async (record) => {
    if (!record || record.source === 'sample') return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    await deleteMediaRecord(record.id);
  }, []);

  const saveNote = useCallback((record) => {
    if (!record?.analysis) return null;
    const existing = notes.find((item) => item.recordId === record.id);
    if (existing) return existing;
    const note = {
      id: `note-${Date.now()}`,
      recordId: record.id,
      image: record.src,
      title: record.analysis.title || 'Nota JOVI',
      summary: record.analysis.summary || '',
      keyPoints: record.analysis.keyPoints || [],
      text: record.analysis.text || '',
      category: record.analysis.category || 'Estudos',
      createdAt: new Date().toISOString(),
    };
    const next = [note, ...notes];
    setNotesState(next);
    persistNotes(next);
    return note;
  }, [notes]);

  const removeNote = useCallback((id) => {
    const next = notes.filter((item) => item.id !== id);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const setPlan = useCallback((next) => {
    setPlanState(next);
    persistPlan(next);
  }, []);

  const setUser = useCallback((next) => {
    setUserState(next);
    persistUser(next);
  }, []);

  const value = useMemo(() => ({
    records, notes, plan, user, addRecord, updateRecord, removeRecord, saveNote, removeNote, setPlan, setUser,
  }), [records, notes, plan, user, addRecord, updateRecord, removeRecord, saveNote, removeNote, setPlan, setUser]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
