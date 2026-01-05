/**
 * Status Screen - Governance and Health Overview
 */

import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useMathison } from '../../src/hooks/useMathison';
import { StatusCard } from '../../src/components/StatusCard';
import { GovernancePanel } from '../../src/components/GovernancePanel';

export default function StatusScreen() {
  const { health, isLoading, error, refresh } = useMathison();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Mathison</Text>
        <Text style={styles.subtitle}>Governed AI System</Text>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!error && (
        <>
          <StatusCard
            title="System Status"
            status={health?.status || 'Unknown'}
            bootStatus={health?.bootStatus}
            isLoading={isLoading}
          />

          <GovernancePanel
            treaty={health?.governance?.treaty}
            genome={health?.governance?.genome}
            isLoading={isLoading}
          />

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Storage</Text>
            <Text style={styles.infoText}>
              Backend: {health?.storage?.backend || 'Unknown'}
            </Text>
            <Text style={styles.infoText}>
              Status: {health?.storage?.status || 'Unknown'}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Memory Graph</Text>
            <Text style={styles.infoText}>
              Nodes: {health?.memory?.nodeCount ?? 'N/A'}
            </Text>
            <Text style={styles.infoText}>
              Edges: {health?.memory?.edgeCount ?? 'N/A'}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  errorCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#2a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff6666',
    fontSize: 14,
  },
  retryButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#4a9eff',
    borderRadius: 8,
    alignItems: 'center',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  infoCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
});
