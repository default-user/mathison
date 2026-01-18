/**
 * Memory Screen - View and Search Memory Nodes
 */

import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useMathison } from '../../src/hooks/useMathison';
import { NodeCard } from '../../src/components/NodeCard';

interface MemoryNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export default function MemoryScreen() {
  const { searchNodes, isLoading } = useMathison();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemoryNode[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setHasSearched(true);
    const searchResults = await searchNodes(query, 20);
    setResults(searchResults);
  }, [query, searchNodes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (query.trim()) {
      await handleSearch();
    }
    setRefreshing(false);
  }, [query, handleSearch]);

  const renderNode = ({ item }: { item: MemoryNode }) => (
    <NodeCard
      id={item.id}
      type={item.type}
      data={item.data}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search memory..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={isLoading}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {!hasSearched && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Search Memory</Text>
          <Text style={styles.emptyText}>
            Enter a query to search the memory graph for relevant nodes.
          </Text>
        </View>
      )}

      {hasSearched && results.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Results</Text>
          <Text style={styles.emptyText}>
            No nodes found matching "{query}".
          </Text>
        </View>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          renderItem={renderNode}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
  },
  searchButton: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: '#4a9eff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
