import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { BeamDTO, BeamKind, BeamStatus } from '../types/api';
import './BeamsPage.css';

const STATUS_COLORS: Record<BeamStatus, string> = {
  ACTIVE: 'var(--success)',
  RETIRED: 'var(--warning)',
  PENDING_TOMBSTONE: 'var(--danger)',
  TOMBSTONED: 'var(--text-muted)',
};

function BeamsPage() {
  const [selectedKind, setSelectedKind] = useState<BeamKind | 'ALL'>('ALL');
  const [includeDead, setIncludeDead] = useState(false);
  const [selectedBeam, setSelectedBeam] = useState<BeamDTO | null>(null);
  const queryClient = useQueryClient();

  const { data: beamsData, isLoading } = useQuery({
    queryKey: ['beams', selectedKind, includeDead],
    queryFn: () =>
      apiClient.queryBeams({
        kinds: selectedKind !== 'ALL' ? [selectedKind] : undefined,
        include_dead: includeDead,
        limit: 100,
      }),
  });

  const pinMutation = useMutation({
    mutationFn: (id: string) => apiClient.pinBeam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beams'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (id: string) => apiClient.unpinBeam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beams'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const retireMutation = useMutation({
    mutationFn: (id: string) => apiClient.retireBeam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beams'] });
      setSelectedBeam(null);
    },
  });

  const tombstoneMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.tombstoneBeam(id, { reason_code: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beams'] });
      setSelectedBeam(null);
    },
  });

  const handleTombstone = (beam: BeamDTO) => {
    const isProtected = ['SELF', 'POLICY', 'CARE'].includes(beam.kind);
    const reason = prompt(
      `Tombstone beam "${beam.title}"?\n\nReason (required):`
    );

    if (!reason) return;

    if (isProtected) {
      const confirm = prompt(
        `This is a protected ${beam.kind} beam.\n\nType "YES" to confirm:`
      );
      if (confirm !== 'YES') return;
    }

    tombstoneMutation.mutate({ id: beam.beam_id, reason });
  };

  return (
    <div className="beams-page">
      <div className="beams-header">
        <h2>Beams</h2>
        <div className="beams-filters">
          <select
            className="filter-select"
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value as BeamKind | 'ALL')}
          >
            <option value="ALL">All Kinds</option>
            <option value="SELF">SELF</option>
            <option value="POLICY">POLICY</option>
            <option value="CARE">CARE</option>
            <option value="RELATION">RELATION</option>
            <option value="PROJECT">PROJECT</option>
            <option value="SKILL">SKILL</option>
            <option value="FACT">FACT</option>
            <option value="NOTE">NOTE</option>
          </select>

          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={includeDead}
              onChange={(e) => setIncludeDead(e.target.checked)}
            />
            Include tombstoned
          </label>
        </div>
      </div>

      <div className="beams-content">
        <div className="beams-list">
          {isLoading && <div className="loading">Loading beams...</div>}

          {!isLoading && beamsData?.beams.length === 0 && (
            <div className="empty">No beams found</div>
          )}

          {beamsData?.beams.map((beam) => (
            <div
              key={beam.beam_id}
              className={`beam-item ${selectedBeam?.beam_id === beam.beam_id ? 'selected' : ''}`}
              onClick={() => setSelectedBeam(beam)}
            >
              <div className="beam-item-header">
                <div className="beam-title-row">
                  <span
                    className="beam-status-dot"
                    style={{ background: STATUS_COLORS[beam.status] }}
                  />
                  <span className="beam-kind">{beam.kind}</span>
                  {beam.pinned && <span className="pin-badge">📌</span>}
                </div>
                <div className="beam-status-label">{beam.status}</div>
              </div>
              <div className="beam-title">{beam.title}</div>
              <div className="beam-tags">
                {beam.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
                {beam.tags.length > 3 && (
                  <span className="tag more">+{beam.tags.length - 3}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="beam-detail">
          {!selectedBeam && (
            <div className="empty">Select a beam to view details</div>
          )}

          {selectedBeam && (
            <>
              <div className="detail-header">
                <div className="detail-title-row">
                  <h3>{selectedBeam.title}</h3>
                  <span
                    className="status-badge"
                    style={{ background: STATUS_COLORS[selectedBeam.status] }}
                  >
                    {selectedBeam.status}
                  </span>
                </div>
                <div className="detail-meta">
                  <span className="meta-item">
                    <strong>Kind:</strong> {selectedBeam.kind}
                  </span>
                  <span className="meta-item">
                    <strong>ID:</strong>{' '}
                    <code>{selectedBeam.beam_id}</code>
                  </span>
                  <span className="meta-item">
                    <strong>Updated:</strong>{' '}
                    {new Date(selectedBeam.updated_at_ms).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="detail-tags">
                {selectedBeam.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="detail-body">
                <pre>{selectedBeam.body}</pre>
              </div>

              <div className="detail-actions">
                {selectedBeam.status === 'ACTIVE' && (
                  <>
                    {!selectedBeam.pinned ? (
                      <button
                        className="action-button primary"
                        onClick={() => pinMutation.mutate(selectedBeam.beam_id)}
                        disabled={pinMutation.isPending}
                      >
                        📌 Pin
                      </button>
                    ) : (
                      <button
                        className="action-button"
                        onClick={() => unpinMutation.mutate(selectedBeam.beam_id)}
                        disabled={unpinMutation.isPending}
                      >
                        Unpin
                      </button>
                    )}

                    <button
                      className="action-button warning"
                      onClick={() => retireMutation.mutate(selectedBeam.beam_id)}
                      disabled={retireMutation.isPending}
                    >
                      Retire
                    </button>

                    <button
                      className="action-button danger"
                      onClick={() => handleTombstone(selectedBeam)}
                      disabled={tombstoneMutation.isPending}
                    >
                      Tombstone
                    </button>
                  </>
                )}

                {selectedBeam.status !== 'ACTIVE' && (
                  <div className="status-info">
                    This beam is {selectedBeam.status.toLowerCase()} and cannot be modified.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default BeamsPage;
