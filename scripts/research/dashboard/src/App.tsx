import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/research', label: 'Research', icon: '🧠' },
  { to: '/oracles', label: 'Oracle Audit', icon: '👁' },
  { to: '/metrics', label: 'Metrics', icon: '📈' },
  { to: '/history', label: 'History', icon: '📋' },
];

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>DeepBook Research</h1>
          <span>Predict Analytics Platform</span>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
