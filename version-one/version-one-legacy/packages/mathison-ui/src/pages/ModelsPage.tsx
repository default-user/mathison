import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import './ModelsPage.css';

function ModelsPage() {
  const queryClient = useQueryClient();

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.listModels(),
  });

  const installMutation = useMutation({
    mutationFn: () => apiClient.installModel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: (path: string) => apiClient.activateModel(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  return (
    <div className="models-page">
      <div className="models-header">
        <h2>Models</h2>
        <button
          className="install-button"
          onClick={() => installMutation.mutate()}
          disabled={installMutation.isPending}
        >
          {installMutation.isPending ? 'Installing...' : 'Install Default Model'}
        </button>
      </div>

      <div className="models-content">
        {!modelsData && <div className="loading">Loading models...</div>}

        {modelsData && modelsData.models.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🧠</div>
            <h3>No Models Installed</h3>
            <p>Install the default model (Qwen2.5-7B-Instruct Q4_K_M) to get started.</p>
            <button
              className="install-button-large"
              onClick={() => installMutation.mutate()}
              disabled={installMutation.isPending}
            >
              {installMutation.isPending ? 'Installing...' : 'Install Default Model (~4.5GB)'}
            </button>
          </div>
        )}

        {modelsData && modelsData.models.length > 0 && (
          <div className="models-grid">
            {modelsData.models.map((model) => (
              <div key={model.path} className={`model-card ${model.is_active ? 'active' : ''}`}>
                <div className="model-header">
                  <div className="model-name">{model.name}</div>
                  {model.is_active && <div className="active-badge">Active</div>}
                </div>

                <div className="model-info">
                  <div className="info-row">
                    <span className="label">Size:</span>
                    <span className="value">{(model.size / 1e9).toFixed(2)} GB</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Path:</span>
                    <code className="value path">{model.path}</code>
                  </div>
                </div>

                {!model.is_active && (
                  <button
                    className="activate-button"
                    onClick={() => activateMutation.mutate(model.path)}
                    disabled={activateMutation.isPending}
                  >
                    Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {installMutation.error && (
          <div className="error-message">
            Error: {installMutation.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelsPage;
