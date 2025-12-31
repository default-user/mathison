import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import './IdentityPage.css';

function IdentityPage() {
  const { data: identity } = useQuery({
    queryKey: ['identity'],
    queryFn: () => apiClient.getIdentity(),
    refetchInterval: 5000,
  });

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => apiClient.getStatus(),
  });

  if (!identity) {
    return <div className="loading">Loading identity...</div>;
  }

  return (
    <div className="identity-page">
      <div className="identity-header">
        <h2>Identity</h2>
        <div className={`mode-badge ${identity.mode === 'NORMAL' ? 'normal' : 'amnesic'}`}>
          {identity.mode}
        </div>
      </div>

      <div className="identity-content">
        <div className="identity-section">
          <h3>Device Binding</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Device ID:</span>
              <code>{identity.device_id.slice(0, 16)}...</code>
            </div>
            <div className="info-item">
              <span className="label">Verified:</span>
              <span className={identity.device_verified ? 'success' : 'danger'}>
                {identity.device_verified ? '✓ Yes' : '✗ No'}
              </span>
            </div>
          </div>
        </div>

        {identity.selfFrame && (
          <>
            <div className="identity-section">
              <h3>SelfFrame</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Hash:</span>
                  <code className="hash">{identity.selfFrame.hash}</code>
                </div>
                <div className="info-item">
                  <span className="label">Pinned Beams:</span>
                  <span>{identity.selfFrame.pinned_count}</span>
                </div>
                <div className="info-item">
                  <span className="label">Last Updated:</span>
                  <span>{new Date(identity.selfFrame.last_updated_ms).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="identity-section">
              <h3>SelfFrame Content</h3>
              <div className="selfframe-viewer">
                <pre>{identity.selfFrame.selfFrame}</pre>
              </div>
            </div>
          </>
        )}

        {status && (
          <div className="identity-section">
            <h3>BeamStore Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{status.beamstore.active}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{status.beamstore.pinned_active}</div>
                <div className="stat-label">Pinned</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{status.beamstore.retired}</div>
                <div className="stat-label">Retired</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{status.beamstore.tombstoned}</div>
                <div className="stat-label">Tombstoned</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IdentityPage;
