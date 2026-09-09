import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';

export default function AppShell() {
  const { pathname } = useLocation();
  const cameraMode = pathname === '/camera';
  const galleryMode = pathname === '/gallery';

  return (
    <div className={`device-stage${cameraMode ? ' camera-stage' : ''}${galleryMode ? ' gallery-stage' : ''}`}>
      <aside className="stage-intro" aria-hidden="true">
        <span className="stage-brand"><i /> JOVI Lens</span>
        <strong>A câmera que<br />ajuda a aprender.</strong>
        <span className="stage-detail">Proposta de produto · JOVI X300 Ultra · OriginOS 6</span>
      </aside>
      <div className="phone-frame" aria-label="JOVI mobile preview">
        <span className="hardware-button hardware-silent" />
        <span className="hardware-button hardware-volume-up" />
        <span className="hardware-button hardware-volume-down" />
        <span className="hardware-button hardware-power" />
        <div className="phone-screen">
          <div className="punch-hole" aria-hidden="true" />
          <div className="app-viewport">
            <Outlet />
          </div>
          {!cameraMode && !galleryMode && <BottomNav />}
          <div className="home-indicator" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
