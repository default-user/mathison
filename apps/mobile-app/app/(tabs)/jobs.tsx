/**
 * Jobs Screen - View and Monitor Running Jobs
 */

import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { useMathison } from '../../src/hooks/useMathison';
import { JobCard } from '../../src/components/JobCard';

interface Job {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  type: string;
  created_at: string;
  genome_id?: string;
}

export default function JobsScreen() {
  const { getJobs, isLoading } = useMathison();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobs = useCallback(async () => {
    const jobList = await getJobs();
    setJobs(jobList);
  }, [getJobs]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }, [loadJobs]);

  const renderJob = ({ item }: { item: Job }) => (
    <JobCard
      jobId={item.job_id}
      status={item.status}
      type={item.type}
      createdAt={item.created_at}
      genomeId={item.genome_id}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Jobs</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {isLoading && jobs.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading jobs...</Text>
        </View>
      )}

      {!isLoading && jobs.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Jobs</Text>
          <Text style={styles.emptyText}>
            No active jobs found. Jobs will appear here when running.
          </Text>
        </View>
      )}

      {jobs.length > 0 && (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={(item) => item.job_id}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  refreshButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  refreshText: {
    color: '#4a9eff',
    fontWeight: '600',
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
