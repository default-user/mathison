/**
 * Mobile Model Bus - On-device LLM inference for React Native
 * Supports Gemini Nano (Android AICore) and llama.cpp fallback
 */

export type MobileModelType = 'gemini-nano' | 'llama-cpp' | null;

export interface MobileInferenceOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
}

export interface MobileInferenceResult {
  text: string;
  tokensGenerated: number;
  latencyMs: number;
  modelUsed: MobileModelType;
}

export interface MobileModelCapabilities {
  hasGeminiNano: boolean;
  hasLlamaCpp: boolean;
  availableMemoryMB: number;
  batteryLevel?: number;
}

/**
 * Mobile Model Bus - On-device inference routing for mobile devices
 *
 * This is designed to work with React Native native modules:
 * - MobileMLKit (for Gemini Nano via Android AICore)
 * - LlamaCppBridge (for local llama.cpp inference)
 *
 * In a real React Native app, you would:
 * ```typescript
 * import { NativeModules } from 'react-native';
 * const { MobileMLKit, LlamaCppBridge } = NativeModules;
 * ```
 */
export class MobileModelBus {
  private currentModel: MobileModelType = null;
  private initialized = false;

  // These would be React Native native modules in production
  // For now, we define the interface
  private nativeModules: {
    MobileMLKit?: any;
    LlamaCppBridge?: any;
  } = {};

  constructor(nativeModules?: any) {
    // In React Native: this.nativeModules = NativeModules
    // For testing/server: pass mock or leave undefined
    this.nativeModules = nativeModules || {};
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Mobile Model Bus...');

    // Check capabilities
    const capabilities = await this.checkCapabilities();

    // Try Gemini Nano first (if available on Android 14+)
    if (capabilities.hasGeminiNano) {
      try {
        await this.initGeminiNano();
        this.currentModel = 'gemini-nano';
        console.log('✓ Using Gemini Nano (Android AICore)');
        this.initialized = true;
        return;
      } catch (error) {
        console.warn('Failed to init Gemini Nano, falling back:', error);
      }
    }

    // Fallback to llama.cpp
    if (capabilities.hasLlamaCpp) {
      try {
        await this.initLlamaCpp();
        this.currentModel = 'llama-cpp';
        console.log('✓ Using llama.cpp for local inference');
        this.initialized = true;
        return;
      } catch (error) {
        console.error('Failed to init llama.cpp:', error);
      }
    }

    throw new Error('No on-device inference available');
  }

  async shutdown(): Promise<void> {
    console.log('🧠 Shutting down Mobile Model Bus...');

    if (this.currentModel === 'gemini-nano' && this.nativeModules.MobileMLKit) {
      await this.nativeModules.MobileMLKit.shutdown?.();
    } else if (this.currentModel === 'llama-cpp' && this.nativeModules.LlamaCppBridge) {
      await this.nativeModules.LlamaCppBridge.unloadModel?.();
    }

    this.currentModel = null;
    this.initialized = false;
  }

  async inference(
    prompt: string,
    options: MobileInferenceOptions = {}
  ): Promise<MobileInferenceResult> {
    if (!this.initialized || !this.currentModel) {
      throw new Error('Model Bus not initialized');
    }

    const startTime = Date.now();
    let text = '';

    try {
      if (this.currentModel === 'gemini-nano') {
        text = await this.inferenceGeminiNano(prompt, options);
      } else if (this.currentModel === 'llama-cpp') {
        text = await this.inferenceLlamaCpp(prompt, options);
      }
    } catch (error) {
      throw new Error(`Inference failed: ${error}`);
    }

    return {
      text,
      tokensGenerated: this.estimateTokens(text),
      latencyMs: Date.now() - startTime,
      modelUsed: this.currentModel,
    };
  }

  async checkCapabilities(): Promise<MobileModelCapabilities> {
    const capabilities: MobileModelCapabilities = {
      hasGeminiNano: false,
      hasLlamaCpp: false,
      availableMemoryMB: 0,
    };

    // Check Gemini Nano availability
    if (this.nativeModules.MobileMLKit) {
      try {
        capabilities.hasGeminiNano = await this.nativeModules.MobileMLKit.hasGeminiNano?.() || false;
      } catch {
        capabilities.hasGeminiNano = false;
      }
    }

    // Check llama.cpp availability
    if (this.nativeModules.LlamaCppBridge) {
      try {
        capabilities.hasLlamaCpp = await this.nativeModules.LlamaCppBridge.isAvailable?.() || false;
      } catch {
        capabilities.hasLlamaCpp = false;
      }
    }

    // Get memory info
    if (this.nativeModules.MobileMLKit) {
      try {
        const memInfo = await this.nativeModules.MobileMLKit.getMemoryInfo?.();
        capabilities.availableMemoryMB = memInfo?.availableMB || 0;
        capabilities.batteryLevel = memInfo?.batteryLevel;
      } catch {
        // Ignore
      }
    }

    return capabilities;
  }

  getCurrentModel(): MobileModelType {
    return this.currentModel;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Private methods

  private async initGeminiNano(): Promise<void> {
    if (!this.nativeModules.MobileMLKit) {
      throw new Error('MobileMLKit native module not available');
    }

    await this.nativeModules.MobileMLKit.initGeminiNano();
  }

  private async initLlamaCpp(): Promise<void> {
    if (!this.nativeModules.LlamaCppBridge) {
      throw new Error('LlamaCppBridge native module not available');
    }

    // Load default quantized model (e.g., llama-2-7b-q4)
    await this.nativeModules.LlamaCppBridge.loadModel({
      modelPath: 'models/llama-2-7b-q4.gguf',
      contextSize: 2048,
    });
  }

  private async inferenceGeminiNano(
    prompt: string,
    options: MobileInferenceOptions
  ): Promise<string> {
    if (!this.nativeModules.MobileMLKit) {
      throw new Error('MobileMLKit not available');
    }

    const result = await this.nativeModules.MobileMLKit.generateText({
      prompt,
      maxTokens: options.maxTokens || 512,
      temperature: options.temperature || 0.7,
      topP: options.topP || 0.9,
    });

    return result.text || '';
  }

  private async inferenceLlamaCpp(
    prompt: string,
    options: MobileInferenceOptions
  ): Promise<string> {
    if (!this.nativeModules.LlamaCppBridge) {
      throw new Error('LlamaCppBridge not available');
    }

    const result = await this.nativeModules.LlamaCppBridge.complete({
      prompt,
      maxTokens: options.maxTokens || 512,
      temperature: options.temperature || 0.7,
      topP: options.topP || 0.9,
    });

    return result.text || '';
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

export default MobileModelBus;
