import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMediaRecord,
  clearMediaRecords,
  getAllMediaRecords,
  getDismissedSeedNotes,
  getHistory,
  getLearningPreferences,
  getNotes,
  getPlan,
  getStudyCalendar,
  getSubjectArtifacts,
  getUser,
  saveMediaRecord,
  setDismissedSeedNotes,
  setHistory as persistHistory,
  setLearningPreferences as persistLearningPreferences,
  setNotes as persistNotes,
  setPlan as persistPlan,
  setStudyCalendar as persistStudyCalendar,
  setSubjectArtifacts as persistSubjectArtifacts,
  setUser as persistUser,
  DEFAULT_LEARNING_PREFERENCES,
} from '../services/storage.js';
import { aggregateSubjects } from '../../shared/subjects.js';
import { mergeDemoSubjectArtifacts } from '../../shared/demoSubjectArtifacts.js';
import { EMPTY_STUDY_CALENDAR, normalizeStudyCalendar } from '../../shared/studyCalendar.js';
import { mergeSeedNotes, sampleMedia as samples, sampleNotes } from '../../shared/seedLibrary.js';

const AppDataContext = createContext(null);

function getInitialNotes() {
  const stored = getNotes();
  const { notes, changed } = mergeSeedNotes(stored, getDismissedSeedNotes());
  if (changed) persistNotes(notes);
  return notes;
}

function getInitialSubjectArtifacts() {
  const { artifacts, changed } = mergeDemoSubjectArtifacts(getSubjectArtifacts());
  if (changed) persistSubjectArtifacts(artifacts);
  return artifacts;
}

export function AppDataProvider({ children }) {
  const [records, setRecords] = useState(samples);
  const recordsRef = useRef(samples);
  const recordsLoadVersionRef = useRef(0);
  const [notes, setNotesState] = useState(getInitialNotes);
  const [aiHistory, setAiHistory] = useState(() => {
    const stored = getHistory();
    // Older entries embedded the full captured photo (a data: URL) per event —
    // enough of those exhausts localStorage's whole per-origin quota, which
    // then silently breaks every OTHER write (notes included, via writeJson's
    // catch). Strip any leftover image field once and re-persist the cleaned
    // history so quota is freed up even for data saved before this fix.
    if (!stored.some((entry) => entry.image)) return stored;
    const cleaned = stored.map(({ image, ...rest }) => rest);
    persistHistory(cleaned);
    return cleaned;
  });
  const [plan, setPlanState] = useState(() => getPlan());
  const [user, setUserState] = useState(() => getUser());
  const [subjectArtifacts, setSubjectArtifactsState] = useState(getInitialSubjectArtifacts);
  const [learningPreferences, setLearningPreferencesState] = useState(() => getLearningPreferences());
  const [studyCalendar, setStudyCalendarState] = useState(() => normalizeStudyCalendar(getStudyCalendar() || EMPTY_STUDY_CALENDAR));

  useEffect(() => {
    const loadVersion = recordsLoadVersionRef.current;
    let active = true;
    getAllMediaRecords().then((stored) => {
      if (!active || recordsLoadVersionRef.current !== loadVersion) return;
      const storedIds = new Set(stored.map((record) => record.id));
      const recordsAddedWhileLoading = recordsRef.current.filter((record) => record.source !== 'sample' && !storedIds.has(record.id));
      const next = [...stored, ...recordsAddedWhileLoading, ...samples];
      recordsRef.current = next;
      setRecords(next);
    });
    return () => { active = false; };
  }, []);

  const addRecord = useCallback(async ({ src, source = 'upload', label = 'Nova imagem', aiAvailable = true, mediaType = 'image', collectionId = null, pageNumber = null }) => {
    const record = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      src,
      source,
      label,
      aiAvailable,
      mediaType,
      collectionId,
      pageNumber,
      createdAt: new Date().toISOString(),
      analysis: null,
    };
    recordsRef.current = [record, ...recordsRef.current];
    setRecords(recordsRef.current);
    await saveMediaRecord(record);
    return record;
  }, []);

  const updateRecord = useCallback(async (id, patch) => {
    const current = recordsRef.current.find((item) => item.id === id);
    if (!current) return null;
    const updated = { ...current, ...patch };
    recordsRef.current = recordsRef.current.map((item) => item.id === id ? updated : item);
    setRecords(recordsRef.current);
    if (updated.source !== 'sample') await saveMediaRecord(updated);
    return updated;
  }, []);

  const removeRecord = useCallback(async (record) => {
    if (!record || record.source === 'sample') return;
    recordsRef.current = recordsRef.current.filter((item) => item.id !== record.id);
    setRecords(recordsRef.current);
    await deleteMediaRecord(record.id);
  }, []);

  const saveNote = useCallback((record) => {
    if (!record?.analysis) return null;
    const existing = notes.find((item) => item.recordId === record.id && !item.seed);
    if (existing) return existing;
    const subcategory = record.analysis.subcategory || record.analysis.subject || record.analysis.contentType || 'Revisão';
    const note = {
      id: `note-${Date.now()}`,
      recordId: record.id,
      image: record.src,
      images: Array.isArray(record.images) && record.images.length ? record.images : [record.src].filter(Boolean),
      title: record.analysis.title || 'Nota JOVI',
      summary: record.analysis.summary || '',
      keyPoints: record.analysis.keyPoints || [],
      text: record.analysis.text || '',
      category: record.analysis.category || 'Estudos',
      subcategory,
      topicPath: Array.isArray(record.analysis.topicPath) && record.analysis.topicPath.length ? record.analysis.topicPath : [subcategory],
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    const next = [note, ...notes];
    // Only commit the optimistic state update if the write actually landed —
    // otherwise a quota-exceeded failure leaves the note visible for this
    // session but silently gone on reload, with the UI still claiming success.
    if (!persistNotes(next)) return null;
    setNotesState(next);
    return note;
  }, [notes]);

  const removeNote = useCallback((id) => {
    if (notes.find((item) => item.id === id)?.seed) setDismissedSeedNotes([...new Set([...getDismissedSeedNotes(), id])]);
    const next = notes.filter((item) => item.id !== id);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const updateNote = useCallback((id, patch) => {
    const next = notes.map((note) => note.id === id ? { ...note, ...patch } : note);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const toggleNoteFavorite = useCallback((id) => {
    const next = notes.map((note) => note.id === id ? { ...note, favorite: !note.favorite } : note);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const addHistoryEntry = useCallback((entry) => {
    // recordId is enough to resolve the source photo later (NotesTimeline
    // already falls back to it via `records`) — embedding the full image
    // here is what exhausts localStorage's quota after enough entries.
    const { image, ...rest } = entry;
    const historyEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...rest,
    };
    setAiHistory((current) => {
      const next = [historyEntry, ...current].slice(0, 60);
      persistHistory(next);
      return next;
    });
    return historyEntry;
  }, []);

  const setPlan = useCallback((next) => {
    setPlanState(next);
    persistPlan(next);
  }, []);

  const setUser = useCallback((next) => {
    setUserState(next);
    persistUser(next);
  }, []);

  const setLearningPreferences = useCallback((next) => {
    const preferences = { ...DEFAULT_LEARNING_PREFERENCES, ...(next || {}) };
    setLearningPreferencesState(preferences);
    persistLearningPreferences(preferences);
  }, []);

  const setStudyCalendar = useCallback((next) => {
    const calendar = normalizeStudyCalendar(next || EMPTY_STUDY_CALENDAR);
    setStudyCalendarState(calendar);
    persistStudyCalendar(calendar);
  }, []);

  const restoreLocalData = useCallback(async (backup) => {
    recordsLoadVersionRef.current += 1;
    const incomingRecords = Array.isArray(backup.records) ? backup.records : [];
    await Promise.all(incomingRecords.map((record) => saveMediaRecord(record)));
    const storedRecords = await getAllMediaRecords();
    const nextRecords = [...storedRecords, ...samples];
    recordsRef.current = nextRecords;
    setRecords(nextRecords);
    setDismissedSeedNotes(Array.isArray(backup.dismissedSeedNotes) ? backup.dismissedSeedNotes : []);
    setNotesState(backup.notes || []);
    persistNotes(backup.notes || []);
    setAiHistory(backup.aiHistory || []);
    persistHistory(backup.aiHistory || []);
    setPlanState(backup.plan || { type: 'free' });
    persistPlan(backup.plan || { type: 'free' });
    setUserState(backup.user || null);
    persistUser(backup.user || null);
    setSubjectArtifactsState(backup.subjectArtifacts || {});
    persistSubjectArtifacts(backup.subjectArtifacts || {});
    setLearningPreferences(backup.learningPreferences || DEFAULT_LEARNING_PREFERENCES);
    setStudyCalendar(backup.studyCalendar || EMPTY_STUDY_CALENDAR);
    return { records: incomingRecords.length, notes: (backup.notes || []).length };
  }, [setLearningPreferences, setStudyCalendar]);

  const clearLocalData = useCallback(async () => {
    recordsLoadVersionRef.current += 1;
    await clearMediaRecords();
    recordsRef.current = samples;
    setRecords(samples);
    setDismissedSeedNotes([]);
    setNotesState(sampleNotes);
    persistNotes(sampleNotes);
    setAiHistory([]);
    persistHistory([]);
    setPlanState({ type: 'free' });
    persistPlan({ type: 'free' });
    setUserState(null);
    persistUser(null);
    const { artifacts } = mergeDemoSubjectArtifacts({});
    setSubjectArtifactsState(artifacts);
    persistSubjectArtifacts(artifacts);
    setLearningPreferencesState(DEFAULT_LEARNING_PREFERENCES);
    persistLearningPreferences(DEFAULT_LEARNING_PREFERENCES);
    setStudyCalendarState(EMPTY_STUDY_CALENDAR);
    persistStudyCalendar(EMPTY_STUDY_CALENDAR);
  }, []);

  // Matérias derived from saved notes (category → subthemes + note bodies).
  // Uncategorized notes fall under "Outros", matching how SubjectNotes groups them.
  const subjects = useMemo(() => aggregateSubjects(notes), [notes]);

  // Persists one generated artifact (plan/exam/script/examResult) for a matéria.
  const saveSubjectArtifact = useCallback((subjectName, key, data) => {
    setSubjectArtifactsState((current) => {
      const next = { ...current, [subjectName]: { ...(current[subjectName] || {}), [key]: { data, savedAt: new Date().toISOString() } } };
      persistSubjectArtifacts(next);
      return next;
    });
  }, []);

  const getSubjectArtifact = useCallback((subjectName, key) => subjectArtifacts[subjectName]?.[key] || null, [subjectArtifacts]);

  const value = useMemo(() => ({
    records, notes, aiHistory, plan, user, subjects, subjectArtifacts, learningPreferences, studyCalendar,
    addRecord, updateRecord, removeRecord, saveNote, removeNote, updateNote, toggleNoteFavorite, addHistoryEntry, setPlan, setUser, setLearningPreferences, setStudyCalendar, restoreLocalData, clearLocalData, saveSubjectArtifact, getSubjectArtifact,
  }), [records, notes, aiHistory, plan, user, subjects, subjectArtifacts, learningPreferences, studyCalendar, addRecord, updateRecord, removeRecord, saveNote, removeNote, updateNote, toggleNoteFavorite, addHistoryEntry, setPlan, setUser, setLearningPreferences, setStudyCalendar, restoreLocalData, clearLocalData, saveSubjectArtifact, getSubjectArtifact]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
