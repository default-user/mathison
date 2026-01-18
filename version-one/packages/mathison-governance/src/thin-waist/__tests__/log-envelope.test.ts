/**
 * Unit tests for LogEnvelope and LogSink
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { LogSink, LogSeverity, RetentionPolicy } from '../log-envelope';

describe('LogSink', () => {
  test('appends log envelopes', () => {
    const sink = new LogSink('test-node');

    const result = sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test-actor',
      event_type: 'test_event',
      severity: LogSeverity.INFO,
      summary: 'Test log message'
    });

    expect(result.accepted).toBe(true);
    expect(result.envelope_id).toBeDefined();

    const envelopes = sink.getEnvelopes();
    expect(envelopes.length).toBe(1);
    expect(envelopes[0].summary).toBe('Test log message');
  });

  test('enforces max envelopes cap by dropping low-severity', () => {
    const policy: RetentionPolicy = {
      max_envelopes: 5,
      max_pending_bytes: 1024 * 1024,
      drop_on_overflow: [LogSeverity.DEBUG, LogSeverity.INFO],
      block_on_overflow: [LogSeverity.ERROR, LogSeverity.CRITICAL]
    };

    const sink = new LogSink('test-node', policy);

    // Add 3 INFO logs
    for (let i = 0; i < 3; i++) {
      sink.append({
        timestamp: new Date().toISOString(),
        subject_id: 'test',
        event_type: 'test',
        severity: LogSeverity.INFO,
        summary: `Info log ${i}`
      });
    }

    // Add 3 ERROR logs (should trigger dropping of INFO logs)
    for (let i = 0; i < 3; i++) {
      const result = sink.append({
        timestamp: new Date().toISOString(),
        subject_id: 'test',
        event_type: 'test',
        severity: LogSeverity.ERROR,
        summary: `Error log ${i}`
      });

      if (i >= 2) {
        // After 5th envelope, should start dropping
        expect(result.dropped_count).toBeGreaterThan(0);
      }
    }

    const envelopes = sink.getEnvelopes();
    expect(envelopes.length).toBeLessThanOrEqual(5);

    // Should prioritize ERROR over INFO
    const errorCount = envelopes.filter(e => e.severity === LogSeverity.ERROR).length;
    expect(errorCount).toBe(3);
  });

  test('blocks high-severity logs when caps exceeded and no droppable logs', () => {
    const policy: RetentionPolicy = {
      max_envelopes: 3,
      max_pending_bytes: 1024 * 1024,
      drop_on_overflow: [LogSeverity.DEBUG],
      block_on_overflow: [LogSeverity.CRITICAL]
    };

    const sink = new LogSink('test-node', policy);

    // Fill with ERROR logs (not droppable)
    for (let i = 0; i < 3; i++) {
      sink.append({
        timestamp: new Date().toISOString(),
        subject_id: 'test',
        event_type: 'test',
        severity: LogSeverity.ERROR,
        summary: `Error ${i}`
      });
    }

    // Try to add CRITICAL log when buffer is full
    const result = sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test',
      event_type: 'test',
      severity: LogSeverity.CRITICAL,
      summary: 'Critical log'
    });

    expect(result.accepted).toBe(false);
    expect(result.denied_reason).toContain('DURABLE_LOGGING_REQUIRED');
  });

  test('flush removes envelopes', () => {
    const sink = new LogSink('test-node');

    // Add 5 envelopes
    for (let i = 0; i < 5; i++) {
      sink.append({
        timestamp: new Date().toISOString(),
        subject_id: 'test',
        event_type: 'test',
        severity: LogSeverity.INFO,
        summary: `Log ${i}`
      });
    }

    expect(sink.getEnvelopes().length).toBe(5);

    // Flush 3
    const flushed = sink.flush(3);
    expect(flushed.length).toBe(3);
    expect(sink.getEnvelopes().length).toBe(2);
  });

  test('getStats returns accurate statistics', () => {
    const sink = new LogSink('test-node');

    sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test',
      event_type: 'test',
      severity: LogSeverity.INFO,
      summary: 'Info'
    });

    sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test',
      event_type: 'test',
      severity: LogSeverity.ERROR,
      summary: 'Error'
    });

    const stats = sink.getStats();
    expect(stats.total_envelopes).toBe(2);
    expect(stats.severity_distribution[LogSeverity.INFO]).toBe(1);
    expect(stats.severity_distribution[LogSeverity.ERROR]).toBe(1);
  });

  test('chain integrity: each envelope references previous hash', () => {
    const sink = new LogSink('test-node');

    const result1 = sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test',
      event_type: 'test',
      severity: LogSeverity.INFO,
      summary: 'First'
    });

    const result2 = sink.append({
      timestamp: new Date().toISOString(),
      subject_id: 'test',
      event_type: 'test',
      severity: LogSeverity.INFO,
      summary: 'Second'
    });

    const envelopes = sink.getEnvelopes();
    expect(envelopes[0].chain_prev_hash).toBe(envelopes[1].hash);
  });
});
