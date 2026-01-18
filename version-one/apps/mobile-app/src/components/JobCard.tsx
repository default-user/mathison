/**
 * Job Card Component - Displays a job
 */

import { View, Text, StyleSheet } from 'react-native';

interface JobCardProps {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  type: string;
  createdAt: string;
  genomeId?: string;
}

export function JobCard({ jobId, status, type, createdAt, genomeId }: JobCardProps) {
  const statusColor = getStatusColor(status);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.typeRow}>
          <Text style={styles.type}>{type}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.id} numberOfLines={1}>{jobId}</Text>
      </View>

      <View style={styles.details}>
        <Text style={styles.detail}>Created: {formatDate(createdAt)}</Text>
        {genomeId && (
          <Text style={styles.detail}>Genome: {genomeId.slice(0, 12)}...</Text>
        )}
      </View>
    </View>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return '#4a9eff';
    case 'completed':
      return '#00cc66';
    case 'failed':
      return '#ff4444';
    case 'suspended':
      return '#ffaa00';
    default:
      return '#666';
  }
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return dateString;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  type: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  id: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
  },
  details: {
    gap: 4,
  },
  detail: {
    fontSize: 12,
    color: '#888',
  },
});
