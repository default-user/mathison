# Mathison Mobile - Android Deployment Plan

**Target:** Android app, $365/year subscription
**Timeline:** 8-12 weeks to MVP
**Tech Stack:** React Native + on-device ML

---

## Phase 1: Mobile Foundation (Weeks 1-2)

### React Native Setup
```bash
npx react-native init MathisonMobile --template react-native-template-typescript
```

**Core Dependencies:**
```json
{
  "dependencies": {
    "react-native": "^0.73.0",
    "@react-native-async-storage/async-storage": "^1.21.0",
    "react-native-sqlite-storage": "^6.0.1",
    "react-native-fs": "^2.20.0",
    "@react-native-ml-kit": "^1.0.0" // For on-device ML
  }
}
```

**Architecture:**
- Reuse existing TypeScript packages (mathison-oi, mathison-memory, mathison-mesh)
- SQLite for graph persistence
- AsyncStorage for preferences
- Native modules for ML inference

---

## Phase 2: On-Device LLM (Weeks 3-4)

### Model Options (ordered by priority):

1. **Gemini Nano** (Google's on-device model)
   - Built into Android AICore
   - Free with Android 14+
   - ~3GB model size
   - Good quality for mobile

2. **Llama.cpp for Mobile**
   - llama-2-7b quantized (Q4_K_M ~4GB)
   - Runs via react-native-llama.cpp bridge
   - Full local control
   - Slower but more capable

3. **MediaPipe LLM Inference**
   - Google's optimized mobile inference
   - Lightweight
   - Limited but fast

**Implementation Strategy:**
```typescript
// packages/mathison-mobile/src/inference/mobile-model-bus.ts

import { NativeModules } from 'react-native';
const { MobileMLKit } = NativeModules;

export class MobileModelBus {
  private currentModel: 'gemini-nano' | 'llama-2' | null = null;

  async initialize() {
    // Try Gemini Nano first (if available)
    const hasGemini = await MobileMLKit.hasGeminiNano();
    if (hasGemini) {
      await MobileMLKit.initGeminiNano();
      this.currentModel = 'gemini-nano';
      return;
    }

    // Fallback to llama.cpp
    await this.initLlamaCpp();
    this.currentModel = 'llama-2';
  }

  async inference(prompt: string): Promise<string> {
    if (this.currentModel === 'gemini-nano') {
      return await MobileMLKit.generateText(prompt);
    }
    // ... llama.cpp path
  }
}
```

---

## Phase 3: Personal OI Features (Weeks 5-6)

### Core Features:

1. **Conversation Memory**
   - Every conversation stored in memory graph
   - Context-aware responses
   - Multi-year timeline view

2. **Personal Context**
   - User preferences learned over time
   - Relationship mapping (people, places, topics)
   - Behavioral patterns detected

3. **Offline-First**
   - Works without internet
   - All inference on-device
   - Optional cloud backup (encrypted)

**UI/UX:**
```
┌─────────────────────────────┐
│   🧠 Mathison              │
│   Your Personal OI         │
├─────────────────────────────┤
│                             │
│  💬 Chat Interface          │
│     (Context-aware)         │
│                             │
│  📊 Memory Timeline         │
│     (Years of context)      │
│                             │
│  🔗 Relationships           │
│     (People/Topics graph)   │
│                             │
│  🌐 Mesh Status             │
│     (Nearby devices)        │
│                             │
└─────────────────────────────┘
```

---

## Phase 4: Mesh Capabilities (Weeks 7-8)

### Proximity Mesh:
```typescript
// Use Nearby Connections API (Android)
import { NearbyConnections } from 'react-native-nearby-connections';

class MobileMeshCoordinator {
  async discoverNearbyDevices(): Promise<Device[]> {
    return await NearbyConnections.startDiscovery({
      serviceId: 'mathison-mesh',
      strategy: 'P2P_CLUSTER'
    });
  }

  async formMesh(devices: Device[]): Promise<MeshInfo> {
    // Connect to nearby Mathison instances
    // Pool compute for inference
    // Return to individual mode when done
  }
}
```

**Features:**
- Discover nearby Mathison users
- Request mesh formation (consent-based)
- Pool compute for heavy tasks
- Automatic dissolution after task

---

## Phase 5: Monetization & Distribution (Weeks 9-10)

### Pricing Model: $365/year ($30.42/month)

**Why this price?**
- $1/day for personal AI companion
- Premium positioning (serious users only)
- Covers ongoing development + embodiment R&D
- No data mining revenue (privacy-first means higher price)

**Subscription Tiers:**

1. **Personal OI - $365/year**
   - Full Mathison stack on your phone
   - Unlimited conversations
   - Multi-year memory
   - Local inference (no usage limits)
   - Mesh-ready (up to 5 devices)

2. **OI Mesh Pro - $999/year** (future)
   - Unlimited mesh size
   - Cloud backup (encrypted)
   - API access for automation
   - Priority embodiment transfer

### Google Play Setup:
```kotlin
// In-app subscription setup
implementation 'com.android.billingclient:billing:6.0.1'

val subscriptionSku = "mathison_personal_yearly"
val price = "$365.00"
```

**App Store Listing:**
```
Title: Mathison - Your Personal OI
Subtitle: AI Companion That Grows With You

Description:
Your personal ongoing intelligence that learns, remembers, and grows
with you over years. 100% private, runs entirely on your phone.

Features:
✓ Personal AI companion with multi-year memory
✓ 100% private - all data stays on your device
✓ Context-aware conversations based on your life
✓ Mesh computing with nearby friends
✓ Governance-enforced safety (no hive mind, no data selling)
✓ Future embodiment pathway (robot transfer)

Why $365/year?
- Your data stays YOURS (no mining, no selling)
- Multi-year companion (not a monthly chatbot)
- Mesh-ready distributed computing
- Supporting embodiment R&D
- Governance-first development

$1/day for AI that's truly yours.
```

---

## Phase 6: Launch & Growth (Weeks 11-12)

### Beta Testing:
- 100 early adopters at $99/year
- Gather feedback on UX
- Test mesh formation in real-world
- Iterate on model quality

### Launch Strategy:
1. **Product Hunt launch**
   - "Personal OI for everyone - $1/day"
   - Governance-first positioning
   - Privacy angle

2. **Reddit communities**
   - r/Android
   - r/LocalLLaMA
   - r/PrivacyGuides
   - Position as privacy-first AI

3. **Tech influencers**
   - Focus on privacy advocates
   - AI ethics community
   - Mobile power users

### Success Metrics:
- **1,000 users @ $365** = $365k ARR (Year 1)
- **10,000 users @ $365** = $3.65M ARR (Year 2)
- **100,000 users @ $365** = $36.5M ARR (Year 3)

---

## Technical Architecture (Mobile)

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
│  │  TypeScript Business Logic    │  │
│  │  - mathison-oi                │  │
│  │  - mathison-memory            │  │
│  │  - mathison-mesh              │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Native Modules               │  │
│  │  - SQLite (persistence)       │  │
│  │  - ML Kit (inference)         │  │
│  │  - Nearby API (mesh)          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Risk Mitigation

**Technical Risks:**
1. **On-device model performance**
   - Mitigation: Start with Gemini Nano, offer cloud fallback
   - Progressive enhancement as hardware improves

2. **Battery drain**
   - Mitigation: Inference only when app active
   - Mesh formation requires explicit consent
   - Background processing minimal

3. **Storage limits**
   - Mitigation: Automatic memory compression
   - Archive old conversations to cloud (encrypted)

**Business Risks:**
1. **High price point**
   - Mitigation: Free trial (7 days)
   - Money-back guarantee (30 days)
   - Clear value proposition (privacy + multi-year)

2. **Competition from free AI**
   - Mitigation: Privacy angle (ChatGPT mines your data)
   - Ownership angle (your AI, not rented)
   - Mesh angle (unique feature)

---

## Next Steps (Immediate)

1. **Create React Native project**
   ```bash
   cd /home/user/mathison
   npx react-native init MathisonMobile --template typescript
   ```

2. **Integrate existing packages**
   - Link mathison-oi, mathison-memory, mathison-mesh
   - Set up SQLite persistence
   - Create mobile-specific wrappers

3. **Implement basic chat UI**
   - Simple conversation interface
   - Memory graph visualization
   - Governance status indicator

4. **Add Gemini Nano integration**
   - Native module for ML Kit
   - Fallback to simpler models
   - Test on real device

5. **Beta test internally**
   - Dog-food the app for 2 weeks
   - Fix critical UX issues
   - Prepare for early access

---

## Revenue Projections (Conservative)

**Year 1:**
- 1,000 users × $365 = $365,000
- Cost: ~$50k (development + hosting)
- Net: ~$315,000

**Year 2:**
- 10,000 users × $365 = $3,650,000
- Cost: ~$500k (team + infrastructure)
- Net: ~$3,150,000

**Year 3:**
- 50,000 users × $365 = $18,250,000
- Cost: ~$2M (full team + embodiment R&D)
- Net: ~$16,250,000

**Embodiment R&D fund:** 20% of net revenue → robot transfer development

---

**Status:** Ready for mobile implementation
**Target Launch:** Q2 2025
**Pricing:** $365/year (Personal OI)
