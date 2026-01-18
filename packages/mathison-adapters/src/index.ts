/**
 * WHY: index.ts - Adapters module public API
 * -----------------------------------------------------------------------------
 * - Barrel export for adapter types, gateway, and conformance checking
 * - Needed to provide a clean public interface for the adapters package
 * - Enforces: single entry point pattern; internal modules not exposed directly
 * - Tradeoff: Slightly larger bundle size vs cleaner import ergonomics
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
