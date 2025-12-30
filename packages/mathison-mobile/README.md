# Mathison Mobile

Mobile components for Mathison Personal OI - React Native compatible.

## Overview

This package provides mobile-optimized components for running Mathison's distributed OI system on Android and iOS devices:

- **MobileModelBus**: On-device LLM inference (Gemini Nano, llama.cpp)
- **MobileGraphStore**: Mobile persistence (AsyncStorage, SQLite)
- **MobileMeshCoordinator**: Proximity-based mesh computing

## Installation

In your React Native project:

```bash
# Install Mathison mobile package
npm install mathison-mobile

# Install required React Native dependencies
npm install @react-native-async-storage/async-storage
npm install react-native-sqlite-storage
npm install react-native-nearby-connections  # For mesh features
```

### Native Module Requirements

This package requires native modules for:

1. **On-device ML inference**:
   - `MobileMLKit` (Gemini Nano via Android AICore)
   - `LlamaCppBridge` (llama.cpp integration)

2. **Storage**:
   - `AsyncStorage` (from @react-native-async-storage)
   - `SQLite` (from react-native-sqlite-storage)

3. **Mesh networking**:
   - `NearbyConnections` (from react-native-nearby-connections)

## Usage

### Basic Setup

```typescript
import { NativeModules } from 'react-native';
import {
  MobileModelBus,
  MobileGraphStore,
  MobileMeshCoordinator
} from 'mathison-mobile';
import { MemoryGraph } from 'mathison-memory';
import { OIEngine } from 'mathison-oi';

// Initialize on-device inference
const modelBus = new MobileModelBus(NativeModules);
await modelBus.initialize();

// Initialize mobile storage
const graphStore = new MobileGraphStore('sqlite', NativeModules);
await graphStore.initialize();

// Create memory graph with mobile persistence
const memoryGraph = new MemoryGraph(graphStore);
await memoryGraph.initialize();

// Create OI engine with memory integration
const oiEngine = new OIEngine({ memoryGraph });
await oiEngine.initialize();
```

### On-Device Inference

```typescript
import { MobileModelBus } from 'mathison-mobile';
import { NativeModules } from 'react-native';

const modelBus = new MobileModelBus(NativeModules);
await modelBus.initialize();

// Check capabilities
const capabilities = await modelBus.checkCapabilities();
console.log('Has Gemini Nano:', capabilities.hasGeminiNano);
console.log('Available memory:', capabilities.availableMemoryMB, 'MB');

// Run inference
const result = await modelBus.inference('Explain quantum computing', {
  maxTokens: 512,
  temperature: 0.7,
});

console.log('Response:', result.text);
console.log('Model used:', result.modelUsed); // 'gemini-nano' or 'llama-cpp'
console.log('Latency:', result.latencyMs, 'ms');
```

### Mobile Storage

```typescript
import { MobileGraphStore } from 'mathison-mobile';
import { NativeModules } from 'react-native';

// Use SQLite for structured queries
const graphStore = new MobileGraphStore('sqlite', NativeModules);
await graphStore.initialize();

// Use AsyncStorage for simpler key-value storage
// const graphStore = new MobileGraphStore('async-storage', NativeModules);

// Write nodes/edges (same interface as server GraphStore)
await graphStore.writeNode({
  id: 'node-1',
  type: 'concept',
  data: { name: 'AI' },
  metadata: { source: 'user' },
});

await graphStore.writeEdge({
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  type: 'related_to',
  metadata: {},
});

// Query edges by node
const edges = await graphStore.readEdgesByNode('node-1');
```

### Proximity Mesh

```typescript
import { MobileMeshCoordinator } from 'mathison-mobile';
import { NativeModules } from 'react-native';

const nodeInfo = {
  nodeId: 'my-phone-123',
  publicKey: '...',
  capabilities: {
    compute: 80,
    memory: 4096,
    battery: 75,
  },
};

const meshConfig = {
  serviceId: 'mathison-mesh-v1',
  strategyType: 'P2P_CLUSTER',
  requireEncryption: true,
  maxNodes: 5,
};

const meshCoordinator = new MobileMeshCoordinator(
  nodeInfo,
  meshConfig,
  NativeModules
);

await meshCoordinator.initialize();

// Discover nearby devices
const nearbyDevices = await meshCoordinator.discoverNearbyDevices(10000);
console.log('Found', nearbyDevices.length, 'nearby Mathison devices');

// Form mesh
const meshRequest = {
  meshId: 'mesh-123',
  initiatorId: nodeInfo.nodeId,
  purpose: 'Distributed inference',
  discoveryMode: 'proximity',
  privacy: {
    requireEncryption: true,
  },
};

await meshCoordinator.formMesh(meshRequest, nearbyDevices);

// Submit task to mesh
const task = {
  taskId: 'task-456',
  type: 'interpretation',
  payload: { text: 'Complex analysis task' },
  privacy: {
    allowDataSharing: false,
  },
};

const results = await meshCoordinator.submitTask(meshRequest.meshId, task);
console.log('Task executed on', results.length, 'nodes');

// Dissolve mesh when done
await meshCoordinator.dissolveMesh(meshRequest.meshId);
```

## Complete Example App

See `/docs/mobile-deployment.md` for a complete React Native app implementation guide.

## Architecture

```
┌─────────────────────────────────────┐
│     React Native App                │
│  ┌───────────────────────────────┐  │
│  │  UI Components                │  │
│  │  - Chat Interface             │  │
│  │  - Memory Timeline            │  │
│  │  - Mesh Controller            │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  mathison-mobile              │  │
│  │  - MobileModelBus             │  │
│  │  - MobileGraphStore           │  │
│  │  - MobileMeshCoordinator      │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Core Packages                │  │
│  │  - mathison-oi                │  │
│  │  - mathison-memory            │  │
│  │  - mathison-mesh              │  │
│  │  - mathison-governance        │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Native Modules               │  │
│  │  - MobileMLKit (Gemini Nano)  │  │
│  │  - SQLite                     │  │
│  │  - NearbyConnections          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Native Module Implementation

### MobileMLKit (Android)

```java
// android/app/src/main/java/com/mathison/MobileMLKitModule.java
package com.mathison;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class MobileMLKitModule extends ReactContextBaseJavaModule {
    public MobileMLKitModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "MobileMLKit";
    }

    @ReactMethod
    public void hasGeminiNano(Promise promise) {
        // Check if Gemini Nano is available (Android 14+)
        boolean available = checkGeminiNanoAvailability();
        promise.resolve(available);
    }

    @ReactMethod
    public void initGeminiNano(Promise promise) {
        // Initialize Gemini Nano via Android AICore
        try {
            // Implementation here
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e);
        }
    }

    @ReactMethod
    public void generateText(ReadableMap options, Promise promise) {
        String prompt = options.getString("prompt");
        int maxTokens = options.getInt("maxTokens");

        // Call Gemini Nano inference
        String result = runInference(prompt, maxTokens);

        WritableMap response = Arguments.createMap();
        response.putString("text", result);
        promise.resolve(response);
    }
}
```

## Testing

```bash
# Run tests (requires React Native environment)
npm test
```

## Performance

- **Gemini Nano**: ~3GB model, 10-20 tokens/sec on modern Android devices
- **llama.cpp**: ~4GB quantized model, 5-15 tokens/sec depending on device
- **Storage**: SQLite for complex queries, AsyncStorage for simple key-value
- **Mesh**: Nearby Connections supports up to 8 simultaneous connections

## Privacy

All computation happens on-device:
- No data sent to cloud unless explicitly configured
- Mesh connections are encrypted
- No raw memory shared between nodes
- Consent-based mesh participation

## License

See main Mathison repository LICENSE file.
