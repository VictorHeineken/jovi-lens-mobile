import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import Camera from './pages/Camera.jsx';
import Copilot from './pages/Copilot.jsx';
import Gallery from './pages/Gallery.jsx';
import History from './pages/History.jsx';
import Notes from './pages/Notes.jsx';
import Profile from './pages/Profile.jsx';
import { AppDataProvider } from './context/AppDataContext.jsx';

export default function App() {
  return (
    <AppDataProvider>
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
    </AppDataProvider>
  );
}
