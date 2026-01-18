/**
 * Mathison Mobile - React Native components for Personal OI
 *
 * Provides:
 * - MobileModelBus: On-device LLM inference (Gemini Nano, llama.cpp)
 * - MobileGraphStore: Mobile-optimized graph persistence (AsyncStorage, SQLite)
 * - MobileMeshCoordinator: Proximity-based mesh formation (Android Nearby Connections)
 *
 * Usage in React Native app:
 * ```typescript
 * import { NativeModules } from 'react-native';
 * import { MobileModelBus, MobileGraphStore, MobileMeshCoordinator } from 'mathison-mobile';
 *
 * // Initialize on-device inference
 * const modelBus = new MobileModelBus(NativeModules);
 * await modelBus.initialize();
 *
 * // Initialize mobile storage
 * const graphStore = new MobileGraphStore('sqlite', NativeModules);
 * await graphStore.initialize();
 *
 * // Initialize mesh coordinator
 * const meshCoordinator = new MobileMeshCoordinator(
 *   nodeInfo,
 *   { serviceId: 'mathison-mesh-v1', strategyType: 'P2P_CLUSTER', requireEncryption: true },
 *   NativeModules
 * );
 * await meshCoordinator.initialize();
 * ```
 */

// On-device inference
export {
  MobileModelBus,
  type MobileModelType,
  type MobileInferenceOptions,
  type MobileInferenceResult,
  type MobileModelCapabilities,
} from './inference/mobile-model-bus';

// Mobile storage
export {
  MobileGraphStore,
  type MobileStorageBackend,
} from './storage/mobile-graph-store';

// Mobile mesh
export {
  MobileMeshCoordinator,
  type NearbyDevice,
  type MobileMeshConfig,
} from './mesh/mobile-mesh-coordinator';

// Re-export core types from base packages
export type {
  MeshNodeInfo,
  MeshFormationRequest,
  MeshTask,
  MeshTaskResult,
} from 'mathison-mesh';

export type {
  GraphNode,
  GraphEdge,
  GraphHyperedge,
} from 'mathison-storage/src/graph_store';
