/**
 * Genome capability ceiling conformance tests
 * Proves: CDI denies actions not in genome capabilities
 */

import { CDI, ActionVerdict } from 'mathison-governance';

describe('Genome Capability Ceiling Tests', () => {
  let cdi: CDI;

  beforeEach(async () => {
    cdi = new CDI({ strictMode: true });
    await cdi.initialize();
  });

  test('allows actions in genome allow list', async () => {
    cdi.setGenomeCapabilities([
      {
        cap_id: 'CAP-TEST',
        risk_class: 'A',
        allow_actions: ['test_action', 'another_action'],
        deny_actions: []
      }
    ]);

    const result = await cdi.checkAction({
      actor: 'test-actor',
      action: 'test_action'
    });

    expect(result.verdict).toBe(ActionVerdict.ALLOW);
  });

  test('denies actions not in genome allow list', async () => {
    cdi.setGenomeCapabilities([
      {
        cap_id: 'CAP-TEST',
        risk_class: 'A',
        allow_actions: ['test_action'],
        deny_actions: []
      }
    ]);

    const result = await cdi.checkAction({
      actor: 'test-actor',
      action: 'forbidden_action'
    });

    expect(result.verdict).toBe(ActionVerdict.DENY);
    expect(result.reason).toContain('not found in genome capability allow lists');
  });

  test('denies actions in genome deny list even if in allow list', async () => {
    cdi.setGenomeCapabilities([
      {
        cap_id: 'CAP-ALLOW',
        risk_class: 'A',
        allow_actions: ['risky_action'],
        deny_actions: []
      },
      {
        cap_id: 'CAP-DENY',
        risk_class: 'A',
        allow_actions: [],
        deny_actions: ['risky_action']
      }
    ]);

    const result = await cdi.checkAction({
      actor: 'test-actor',
      action: 'risky_action'
    });

    expect(result.verdict).toBe(ActionVerdict.DENY);
    expect(result.reason).toContain('explicitly denied by genome capability');
  });

  test('allows hive-forbidden actions to remain forbidden (genome does not override treaty)', async () => {
    cdi.setGenomeCapabilities([
      {
        cap_id: 'CAP-DANGEROUS',
        risk_class: 'D',
        allow_actions: ['merge_agent_state'], // Attempt to allow hive action
        deny_actions: []
      }
    ]);

    const result = await cdi.checkAction({
      actor: 'test-actor',
      action: 'merge_agent_state'
    });

    // Hive actions should be denied by treaty rules even if genome allows them
    expect(result.verdict).toBe(ActionVerdict.DENY);
    expect(result.reason).toContain('Hive mind actions forbidden');
  });

  test('multiple capabilities can allow same action', async () => {
    cdi.setGenomeCapabilities([
      {
        cap_id: 'CAP-READ',
        risk_class: 'B',
        allow_actions: ['memory_read_node', 'memory_search'],
        deny_actions: []
      },
      {
        cap_id: 'CAP-SEARCH',
        risk_class: 'B',
        allow_actions: ['memory_search'],
        deny_actions: []
      }
    ]);

    const result = await cdi.checkAction({
      actor: 'test-actor',
      action: 'memory_search'
    });

    expect(result.verdict).toBe(ActionVerdict.ALLOW);
  });
});
