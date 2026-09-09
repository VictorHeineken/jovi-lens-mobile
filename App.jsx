import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { AppDataProvider } from './context/AppDataContext.jsx';

const Camera = lazy(() => import('./pages/Camera.jsx'));
const Copilot = lazy(() => import('./pages/Copilot.jsx'));
const Gallery = lazy(() => import('./pages/Gallery.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Notes = lazy(() => import('./pages/Notes.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

export default function App() {
  return (
    <AppDataProvider>
      <Suspense fallback={<div className="route-loading"><span className="loading-orbit" /> Abrindo JOVI Lens...</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/camera" replace />} />
            <Route path="/camera" element={<Camera />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<History />} />
            <Route path="/login" element={<Navigate to="/profile" replace />} />
            <Route path="*" element={<Navigate to="/camera" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AppDataProvider>
  );
}
