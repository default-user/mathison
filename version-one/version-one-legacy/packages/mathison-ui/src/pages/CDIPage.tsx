import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import './CDIPage.css';

function CDIPage() {
  const { data: cdiStats } = useQuery({
    queryKey: ['cdi-stats'],
    queryFn: () => apiClient.getCDIStats(),
    refetchInterval: 5000,
  });

  const { data: approvals } = useQuery({
    queryKey: ['cdi-approvals'],
    queryFn: () => apiClient.getPendingApprovals(),
    refetchInterval: 2000,
  });

  const incidentMode = cdiStats?.incident_status.mode === 'INCIDENT_LOCKED';

  return (
    <div className="cdi-page">
      <div className="cdi-header">
        <h2>CDI Governance</h2>
        <div className={`mode-indicator ${incidentMode ? 'incident' : 'normal'}`}>
          {incidentMode ? '⚠️ INCIDENT MODE' : '✓ NORMAL'}
        </div>
      </div>

      <div className="cdi-content">
        {incidentMode && cdiStats?.incident_status.event && (
          <div className="incident-alert">
            <div className="alert-header">
              <span className="alert-icon">⚠️</span>
              <span className="alert-title">Incident Mode Active</span>
            </div>
            <div className="alert-body">
              <p><strong>Reason:</strong> {cdiStats.incident_status.event.reason}</p>
              <p>
                <strong>Triggered:</strong>{' '}
                {new Date(cdiStats.incident_status.event.triggered_at_ms).toLocaleString()}
              </p>
              <p>
                <strong>Count:</strong> {cdiStats.incident_status.event.tombstone_count} /{' '}
                {cdiStats.incident_status.event.threshold}
              </p>
            </div>
            <div className="alert-footer">
              All tombstone operations require human approval until incident is cleared.
            </div>
          </div>
        )}

        <div className="cdi-section">
          <h3>Rate Limits</h3>
          <div className="limits-grid">
            <div className="limit-card">
              <div className="limit-label">Tombstones (24h)</div>
              <div className="limit-value">
                {cdiStats?.tombstones_24h ?? 0}
              </div>
            </div>
            <div className="limit-card">
              <div className="limit-label">Soft Limit</div>
              <div className="limit-value soft">
                {cdiStats?.soft_limit ?? 0}
              </div>
            </div>
            <div className="limit-card">
              <div className="limit-label">Hard Limit</div>
              <div className="limit-value hard">
                {cdiStats?.hard_limit ?? 0}
              </div>
            </div>
          </div>

          <div className="limit-bar">
            <div
              className="limit-bar-fill"
              style={{
                width: `${Math.min(100, ((cdiStats?.tombstones_24h ?? 0) / (cdiStats?.hard_limit ?? 100)) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="cdi-section">
          <h3>Pending Approvals</h3>
          {!approvals || approvals.approvals.length === 0 ? (
            <div className="empty">No pending approval requests</div>
          ) : (
            <div className="approvals-list">
              {approvals.approvals.map((approval) => (
                <div key={approval.request_id} className="approval-card">
                  <div className="approval-header">
                    <span className="approval-op">{approval.op}</span>
                    <span className="approval-kind">{approval.kind}</span>
                  </div>
                  <div className="approval-title">{approval.title}</div>
                  <div className="approval-meta">
                    <span>ID: {approval.beam_id}</span>
                    <span>Reason: {approval.reason_code}</span>
                  </div>
                  <div className="approval-actions">
                    <button className="approve-button">Approve</button>
                    <button className="deny-button">Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cdi-section">
          <h3>Protected Beams</h3>
          <div className="protected-info">
            <p>
              Beams with kinds <code>SELF</code>, <code>POLICY</code>, or <code>CARE</code>{' '}
              require explicit human approval for tombstone and purge operations.
            </p>
            <p>
              The <code>SELF_ROOT</code> beam cannot be tombstoned without explicit confirmation.
            </p>
          </div>
        </div>

        <div className="cdi-section">
          <h3>Spike Detection</h3>
          <div className="spike-info">
            <p>
              Incident mode is triggered when more than <strong>50 tombstones</strong> occur{' '}
              within <strong>10 minutes</strong>.
            </p>
            <p>
              When incident mode is active, all tombstone operations require human approval{' '}
              regardless of beam kind.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CDIPage;
