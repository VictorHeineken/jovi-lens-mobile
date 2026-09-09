import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

const items = [
  { to: '/camera', label: 'Câmera', icon: 'camera' },
  { to: '/gallery', label: 'Galeria', icon: 'gallery' },
  { to: '/notes', label: 'Notas', icon: 'note' },
  { to: '/copilot', label: 'Copilot', icon: 'sparkle' },
  { to: '/profile', label: 'Perfil', icon: 'user' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
