import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';

export default function AppShell() {
  const { pathname } = useLocation();
  const cameraMode = pathname === '/camera';

  return (
    <div className={`device-stage${cameraMode ? ' camera-stage' : ''}`}>
      <div className="phone-frame" aria-label="JOVI mobile preview">
        <span className="hardware-button hardware-silent" />
        <span className="hardware-button hardware-volume-up" />
        <span className="hardware-button hardware-volume-down" />
        <span className="hardware-button hardware-power" />
        <div className="phone-screen">
          <div className="dynamic-island" aria-hidden="true"><span /></div>
          <div className="app-viewport">
            <Outlet />
          </div>
          <BottomNav />
          <div className="home-indicator" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
