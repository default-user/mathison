import { Routes, Route, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './lib/api-client';
import ChatPage from './pages/ChatPage';
import BeamsPage from './pages/BeamsPage';
import IdentityPage from './pages/IdentityPage';
import ModelsPage from './pages/ModelsPage';
import CDIPage from './pages/CDIPage';
import './App.css';

function App() {
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => apiClient.getStatus(),
    refetchInterval: 5000,
  });

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Mathison OI</h1>
          <div className="status-indicator">
            <div className={`dot ${status?.llama_server.running ? 'active' : 'inactive'}`} />
            <span>{status?.llama_server.running ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="nav-links">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="icon">💬</span>
            Chat
          </NavLink>

          <NavLink to="/beams" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="icon">🔮</span>
            Beams
            {status && (
              <span className="badge">{status.beamstore.active}</span>
            )}
          </NavLink>

          <NavLink to="/identity" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="icon">🆔</span>
            Identity
          </NavLink>

          <NavLink to="/models" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="icon">🧠</span>
            Models
          </NavLink>

          <NavLink to="/cdi" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="icon">🛡️</span>
            CDI
            {status?.cdi.incident_status.mode === 'INCIDENT_LOCKED' && (
              <span className="badge danger">!</span>
            )}
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div className="stats-mini">
            <div className="stat">
              <span className="label">Active</span>
              <span className="value">{status?.beamstore.active ?? '—'}</span>
            </div>
            <div className="stat">
              <span className="label">Pinned</span>
              <span className="value">{status?.beamstore.pinned_active ?? '—'}</span>
            </div>
            <div className="stat">
              <span className="label">Hash</span>
              <span className="value hash">{status?.identity.selfFrame?.hash.slice(0, 8) ?? '—'}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/beams" element={<BeamsPage />} />
          <Route path="/identity" element={<IdentityPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/cdi" element={<CDIPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
