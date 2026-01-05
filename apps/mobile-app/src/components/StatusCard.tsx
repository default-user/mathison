/**
 * Status Card Component - Displays system status
 */

import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface StatusCardProps {
  title: string;
  status: string;
  bootStatus?: string;
  isLoading?: boolean;
}

export function StatusCard({ title, status, bootStatus, isLoading }: StatusCardProps) {
  const statusColor = getStatusColor(status);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator color="#4a9eff" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {status.toUpperCase()}
        </Text>
      </View>
      {bootStatus && (
        <Text style={styles.bootStatus}>Boot: {bootStatus}</Text>
      )}
    </View>
  );
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'ready':
    case 'ok':
      return '#00cc66';
    case 'booting':
    case 'loading':
      return '#ffaa00';
    case 'unhealthy':
    case 'failed':
    case 'error':
      return '#ff4444';
    default:
      return '#888';
  }
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  bootStatus: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
});
