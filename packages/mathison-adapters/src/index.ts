/**
 * Mathison v2.1 Adapters
 *
 * Adapter conformance contract, gateway, and enforcement.
 */

// Types
export * from './types';

// Gateway
export { AdapterGateway, createGateway } from './gateway';

// Conformance checking
export {
  checkModelAdapterConformance,
  checkToolAdapterConformance,
  testCapabilityEnforcement,
  runConformanceSuite,
} from './conformance';
