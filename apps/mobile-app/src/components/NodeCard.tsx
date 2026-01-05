/**
 * Node Card Component - Displays a memory node
 */

import { View, Text, StyleSheet } from 'react-native';

interface NodeCardProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export function NodeCard({ id, type, data }: NodeCardProps) {
  const preview = getDataPreview(data);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.type}>{type}</Text>
        <Text style={styles.id} numberOfLines={1}>{id}</Text>
      </View>
      <Text style={styles.preview} numberOfLines={3}>{preview}</Text>
    </View>
  );
}

function getDataPreview(data: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return '(empty)';
  }

  // Try to find a good preview field
  const previewFields = ['content', 'text', 'title', 'name', 'description'];
  for (const field of previewFields) {
    if (data[field] && typeof data[field] === 'string') {
      return data[field] as string;
    }
  }

  // Fall back to JSON
  return JSON.stringify(data, null, 2).slice(0, 200);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4a9eff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  type: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a9eff',
    textTransform: 'uppercase',
  },
  id: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
    maxWidth: '60%',
  },
  preview: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
});
