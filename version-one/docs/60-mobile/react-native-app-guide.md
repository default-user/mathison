# React Native App Guide - Mathison Personal OI

## Who This Is For

- React Native developers building the Mathison mobile app
- Mobile engineers implementing on-device ML inference
- Developers integrating Mathison TypeScript packages into React Native
- Contributors working on Android app features

## Why This Exists

Provides step-by-step implementation guide for building the Mathison Android app with React Native. Covers project setup, core service architecture, native module integration for on-device ML, and production deployment. This guide translates Mathison's Node.js-based architecture to mobile constraints while preserving the governance framework and memory graph capabilities.

## Guarantees / Invariants

- **Mathison packages reused**: mathison-oi, mathison-memory, mathison-mesh, mathison-governance work without modification
- **SQLite for persistence**: Same graph schema as Node.js version
- **Native module contract**: `MobileMLKit` provides `hasGeminiNano()`, `initGeminiNano()`, `generateText()` methods
- **Service lifecycle**: `MathisonService.initialize()` before use, `shutdown()` on app close
- **Message flow**: User message → stored in graph → OI interpretation → LLM inference → response stored in graph

## Non-Goals

- iOS support (Android-first)
- Hybrid app frameworks (Ionic, Cordova)
- Server-side rendering
- Web view wrappers
- Cloud-based inference (defeats privacy model)

## How to Verify

```bash
# 1. Verify project builds
cd MathisonApp
npx react-native run-android
# Expected: App launches on emulator/device

# 2. Verify Mathison packages linked
npm ls | grep mathison
# Expected: All five packages listed

# 3. Verify SQLite database created
adb shell
cd /data/data/com.mathisonapp/databases
ls
# Expected: mathison-graph.db

# 4. Verify native module registered
adb logcat | grep "MobileMLKit"
# Expected: "Native module MobileMLKit registered"

# 5. Test chat functionality
# Send message in app
adb logcat | grep "Mathison"
# Expected: Log flow: initialize → chat → inference → response

# 6. Verify memory persistence
# Send message, kill app, relaunch
# Check if previous message visible
# Expected: Message history retained

# 7. Build release APK
cd android && ./gradlew assembleRelease
# Expected: APK at app/build/outputs/apk/release/app-release.apk
```

## Implementation Pointers

- **Service pattern**: Use singleton `MathisonService` to manage lifecycle
- **React hooks**: Wrap service in `useMathison()` hook for component integration
- **Native modules**: Implement `MobileMLKitModule.java` for Gemini Nano bridge
- **Storage location**: Use `react-native-sqlite-storage` with path `databases/mathison-graph.db`
- **Message bubbles**: User messages (blue, right-aligned), AI responses (gray, left-aligned)
- **Loading states**: Show `ActivityIndicator` during initialization and inference
- **Error handling**: Display errors in UI, log to console for debugging
- **Build optimization**: Enable ProGuard for release builds to reduce APK size

---

Complete guide to building the Mathison Android app using React Native.

## Prerequisites

```bash
# Install React Native CLI
npm install -g react-native-cli

# Install Java Development Kit (JDK 17)
# Install Android Studio with Android SDK
# Set ANDROID_HOME environment variable
```

## Project Creation

```bash
cd /path/to/mathison
npx react-native init MathisonApp --template react-native-template-typescript

cd MathisonApp
```

## Install Dependencies

```bash
# Mathison packages (from local monorepo)
npm install ../packages/mathison-mobile
npm install ../packages/mathison-oi
npm install ../packages/mathison-memory
npm install ../packages/mathison-mesh
npm install ../packages/mathison-governance

# React Native dependencies
npm install @react-native-async-storage/async-storage
npm install react-native-sqlite-storage
npm install react-native-nearby-connections  # For mesh features

# UI libraries
npm install @react-navigation/native
npm install @react-navigation/stack
npm install react-native-gesture-handler
npm install react-native-safe-area-context
npm install react-native-screens
```

## App Structure

```
MathisonApp/
├── android/                    # Android native code
│   ├── app/src/main/java/com/mathisonapp/
│   │   ├── MobileMLKitModule.java       # Gemini Nano integration
│   │   ├── LlamaCppBridgeModule.java    # llama.cpp integration
│   │   └── MobileMLKitPackage.java      # Register native modules
│   └── app/build.gradle        # Android dependencies
├── ios/                        # iOS native code (future)
├── src/
│   ├── screens/
│   │   ├── ChatScreen.tsx      # Main chat interface
│   │   ├── MemoryScreen.tsx    # Memory graph viewer
│   │   ├── MeshScreen.tsx      # Mesh controller
│   │   └── SettingsScreen.tsx  # Settings and account
│   ├── components/
│   │   ├── ChatMessage.tsx     # Chat bubble component
│   │   ├── MemoryGraph.tsx     # Graph visualization
│   │   └── MeshIndicator.tsx   # Mesh status indicator
│   ├── services/
│   │   ├── MathisonService.ts  # Core Mathison integration
│   │   ├── StorageService.ts   # Persistence management
│   │   └── MeshService.ts      # Mesh coordination
│   ├── hooks/
│   │   ├── useMathison.ts      # React hook for Mathison
│   │   └── useMesh.ts          # React hook for mesh
│   ├── navigation/
│   │   └── AppNavigator.tsx    # Navigation setup
│   └── App.tsx                 # Main app component
├── package.json
└── tsconfig.json
```

## Core Service Implementation

### src/services/MathisonService.ts

```typescript
import { NativeModules } from 'react-native';
import { MobileModelBus, MobileGraphStore } from 'mathison-mobile';
import { MemoryGraph } from 'mathison-memory';
import { OIEngine } from 'mathison-oi';

class MathisonService {
  private modelBus!: MobileModelBus;
  private graphStore!: MobileGraphStore;
  private memoryGraph!: MemoryGraph;
  private oiEngine!: OIEngine;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🧠 Initializing Mathison...');

    // Initialize on-device inference
    this.modelBus = new MobileModelBus(NativeModules);
    await this.modelBus.initialize();

    // Initialize mobile storage
    this.graphStore = new MobileGraphStore('sqlite', NativeModules);
    await this.graphStore.initialize();

    // Initialize memory graph
    this.memoryGraph = new MemoryGraph(this.graphStore);
    await this.memoryGraph.initialize();

    // Initialize OI engine
    this.oiEngine = new OIEngine({ memoryGraph: this.memoryGraph });
    await this.oiEngine.initialize();

    this.initialized = true;
    console.log('✓ Mathison ready');
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.oiEngine.shutdown();
    await this.memoryGraph.shutdown();
    await this.graphStore.shutdown();
    await this.modelBus.shutdown();

    this.initialized = false;
  }

  async chat(message: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Mathison not initialized');
    }

    // Store message in memory
    const messageNode = {
      id: `msg-${Date.now()}`,
      type: 'user_message',
      data: { text: message, timestamp: new Date().toISOString() },
    };

    this.memoryGraph.addNode(messageNode);

    // Get OI interpretation
    const interpretation = await this.oiEngine.interpret(message);

    // Generate response using on-device model
    const prompt = this.buildPrompt(message, interpretation);
    const result = await this.modelBus.inference(prompt, {
      maxTokens: 512,
      temperature: 0.7,
    });

    // Store response in memory
    const responseNode = {
      id: `resp-${Date.now()}`,
      type: 'ai_response',
      data: { text: result.text, timestamp: new Date().toISOString() },
    };

    this.memoryGraph.addNode(responseNode);
    this.memoryGraph.addEdge({
      id: `edge-${Date.now()}`,
      source: messageNode.id,
      target: responseNode.id,
      type: 'response_to',
    });

    return result.text;
  }

  private buildPrompt(message: string, interpretation: any): string {
    // Build context-aware prompt using interpretation and memory
    const context = interpretation.contextUsed
      .map((id: string) => {
        const node = this.memoryGraph.getNode(id);
        return node ? JSON.stringify(node.data) : '';
      })
      .join('\n');

    return `Context:\n${context}\n\nUser: ${message}\n\nAssistant:`;
  }

  getMemoryGraph(): MemoryGraph {
    return this.memoryGraph;
  }

  getModelBus(): MobileModelBus {
    return this.modelBus;
  }
}

export default new MathisonService();
```

### src/hooks/useMathison.ts

```typescript
import { useState, useEffect } from 'react';
import MathisonService from '../services/MathisonService';

export function useMathison() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    MathisonService.initialize()
      .then(() => setInitialized(true))
      .catch((err) => setError(err.message));

    return () => {
      MathisonService.shutdown();
    };
  }, []);

  const chat = async (message: string): Promise<string> => {
    try {
      return await MathisonService.chat(message);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return {
    initialized,
    error,
    chat,
    memoryGraph: MathisonService.getMemoryGraph(),
    modelBus: MathisonService.getModelBus(),
  };
}
```

## Chat Screen Implementation

### src/screens/ChatScreen.tsx

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useMathison } from '../hooks/useMathison';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export function ChatScreen() {
  const { initialized, error, chat } = useMathison();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const response = await chat(inputText);

      const aiMessage: Message = {
        id: `resp-${Date.now()}`,
        text: response,
        sender: 'ai',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Initializing Mathison...</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧠 Mathison</Text>
        <Text style={styles.headerSubtitle}>Your Personal OI</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.sender === 'user' ? styles.userBubble : styles.aiBubble,
            ]}
          >
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={styles.timestamp}>
              {item.timestamp.toLocaleTimeString()}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.messageList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message Mathison..."
          placeholderTextColor="#888"
          multiline
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={loading}
        >
          <Text style={styles.sendButtonText}>
            {loading ? '...' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#f00',
    textAlign: 'center',
  },
  messageList: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#333',
  },
  messageText: {
    fontSize: 16,
    color: '#fff',
  },
  timestamp: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#555',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
```

## Native Module Setup (Android)

### android/app/src/main/java/com/mathisonapp/MobileMLKitModule.java

```java
package com.mathisonapp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class MobileMLKitModule extends ReactContextBaseJavaModule {
    private ReactApplicationContext reactContext;

    public MobileMLKitModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return "MobileMLKit";
    }

    @ReactMethod
    public void hasGeminiNano(Promise promise) {
        // Check if device supports Gemini Nano
        // Requires Android 14+ with AICore
        try {
            boolean available = checkGeminiNanoAvailability();
            promise.resolve(available);
        } catch (Exception e) {
            promise.reject("CHECK_ERROR", e);
        }
    }

    @ReactMethod
    public void initGeminiNano(Promise promise) {
        try {
            // Initialize Gemini Nano via Android AICore API
            // See: https://developer.android.com/guide/aicore
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e);
        }
    }

    @ReactMethod
    public void generateText(ReadableMap options, Promise promise) {
        String prompt = options.getString("prompt");
        int maxTokens = options.getInt("maxTokens");
        double temperature = options.getDouble("temperature");

        try {
            // Call Gemini Nano inference
            String result = runGeminiNanoInference(prompt, maxTokens, temperature);

            WritableMap response = Arguments.createMap();
            response.putString("text", result);
            promise.resolve(response);
        } catch (Exception e) {
            promise.reject("INFERENCE_ERROR", e);
        }
    }

    private boolean checkGeminiNanoAvailability() {
        // Implementation: Check Android version and AICore availability
        return android.os.Build.VERSION.SDK_INT >= 34; // Android 14
    }

    private String runGeminiNanoInference(String prompt, int maxTokens, double temperature) {
        // Implementation: Call Android AICore Gemini Nano API
        // For now, return placeholder
        return "Response from Gemini Nano (placeholder)";
    }
}
```

## Build and Run

```bash
# Development build
npx react-native run-android

# Release build
cd android
./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release.apk
```

## Google Play Store Deployment

### 1. Generate Signing Key

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore mathison-release.keystore \
  -alias mathison-key -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Configure android/gradle.properties

```properties
MATHISON_RELEASE_STORE_FILE=mathison-release.keystore
MATHISON_RELEASE_KEY_ALIAS=mathison-key
MATHISON_RELEASE_STORE_PASSWORD=****
MATHISON_RELEASE_KEY_PASSWORD=****
```

### 3. Update android/app/build.gradle

```gradle
android {
    signingConfigs {
        release {
            if (project.hasProperty('MATHISON_RELEASE_STORE_FILE')) {
                storeFile file(MATHISON_RELEASE_STORE_FILE)
                storePassword MATHISON_RELEASE_STORE_PASSWORD
                keyAlias MATHISON_RELEASE_KEY_ALIAS
                keyPassword MATHISON_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 4. Build Release APK

```bash
cd android
./gradlew bundleRelease  # For AAB (Google Play)
# Output: app/build/outputs/bundle/release/app-release.aab

# Or for APK:
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

### 5. Upload to Google Play Console

1. Go to https://play.google.com/console
2. Create app "Mathison - Your Personal OI"
3. Upload AAB file
4. Configure store listing (use content from mobile-deployment.md)
5. Set pricing: $365/year subscription
6. Submit for review

## Next Steps

1. Implement native Gemini Nano integration
2. Add llama.cpp fallback support
3. Implement mesh networking with Nearby Connections
4. Add subscription management (Google Play Billing)
5. Implement encrypted cloud backup (optional)
6. Add memory graph visualization
7. Create onboarding flow

## Resources

- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Android AICore (Gemini Nano)](https://developer.android.com/guide/aicore)
- [Nearby Connections API](https://developers.google.com/nearby/connections/overview)
- [Google Play Billing](https://developer.android.com/google/play/billing)
