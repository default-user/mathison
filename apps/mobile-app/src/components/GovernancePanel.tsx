/**
 * Governance Panel Component - Displays treaty and genome info
 */

import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface GovernancePanelProps {
  treaty?: { version: string; authority: string };
  genome?: { name: string; version: string; genome_id: string; initialized: boolean };
  isLoading?: boolean;
}

export function GovernancePanel({ treaty, genome, isLoading }: GovernancePanelProps) {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Governance</Text>
        <ActivityIndicator color="#4a9eff" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Governance</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Treaty</Text>
        {treaty ? (
          <>
            <Text style={styles.label}>Version: <Text style={styles.value}>{treaty.version}</Text></Text>
            <Text style={styles.label}>Authority: <Text style={styles.value}>{treaty.authority}</Text></Text>
          </>
        ) : (
          <Text style={styles.missing}>No treaty loaded</Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Genome</Text>
        {genome ? (
          <>
            <Text style={styles.label}>Name: <Text style={styles.value}>{genome.name}</Text></Text>
            <Text style={styles.label}>Version: <Text style={styles.value}>{genome.version}</Text></Text>
            <Text style={styles.label}>ID: <Text style={styles.valueSmall}>{genome.genome_id}</Text></Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: genome.initialized ? '#00cc66' : '#ff4444' }]} />
              <Text style={[styles.statusText, { color: genome.initialized ? '#00cc66' : '#ff4444' }]}>
                {genome.initialized ? 'Initialized' : 'Not Initialized'}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.missing}>No genome loaded</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a9eff',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  value: {
    color: '#fff',
  },
  valueSmall: {
    color: '#aaa',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  missing: {
    fontSize: 13,
    color: '#ff6666',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
