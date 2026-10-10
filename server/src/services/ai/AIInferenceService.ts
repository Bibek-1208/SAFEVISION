import { AIAdapter, DetectionResult, InferenceInput, FullInferenceResponse } from './AIAdapter';
import { YOLOAdapter } from './YOLOAdapter';
import { DemoAdapter } from './DemoAdapter';

export class AIInferenceService {
  private static instance: AIInferenceService;
  private adapters: Map<string, AIAdapter> = new Map();
  private activeAdapterName: string = 'yolo';

  private constructor() {
    // Register real YOLO industrial neural inference adapter
    this.registerAdapter('yolo', new YOLOAdapter());

    // Only register DemoAdapter in explicit non-production debug environments
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_DEMO_ADAPTER === 'true') {
      this.registerAdapter('demo', new DemoAdapter());
    }
  }

  public static getInstance(): AIInferenceService {
    if (!AIInferenceService.instance) {
      AIInferenceService.instance = new AIInferenceService();
    }
    return AIInferenceService.instance;
  }

  public registerAdapter(key: string, adapter: AIAdapter): void {
    this.adapters.set(key.toLowerCase(), adapter);
    console.log(`[AIInferenceService] Registered adapter: ${key} (${adapter.name} v${adapter.version})`);
  }

  public setAdapter(key: string): void {
    const lowerKey = key.toLowerCase();
    if (!this.adapters.has(lowerKey)) {
      throw new Error(`AI Adapter '${key}' not registered. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
    this.activeAdapterName = lowerKey;
    console.log(`[AIInferenceService] Active adapter switched to: ${this.activeAdapterName}`);
  }

  public getActiveAdapter(): AIAdapter {
    const adapter = this.adapters.get(this.activeAdapterName);
    if (!adapter) {
      return this.adapters.get('yolo') || new YOLOAdapter();
    }
    return adapter;
  }

  public getActiveAdapterInfo() {
    const adapter = this.getActiveAdapter();
    return {
      activeKey: this.activeAdapterName,
      name: adapter.name,
      version: adapter.version,
      availableAdapters: Array.from(this.adapters.keys()),
    };
  }

  public async detectImage(input: InferenceInput): Promise<DetectionResult[]> {
    return this.getActiveAdapter().detectImage(input);
  }

  public async detectImageFull(input: InferenceInput): Promise<any> {
    const adapter = this.getActiveAdapter();
    if (adapter.detectImageFull) {
      return adapter.detectImageFull(input);
    }
    const detections = await adapter.detectImage(input);
    return {
      success: true,
      modelName: adapter.name,
      modelId: 'LEGACY-ADAPTER',
      modelStatus: 'configured',
      inferenceTimeMs: 0,
      totalPersonsDetected: detections.length,
      totalViolationsDetected: 0,
      detections,
      trackedWorkers: [],
      incidentCandidates: [],
      personAssessments: [],
      expectedRegions: [],
      inspectionSummary: null,
      overallStatus: 'UNKNOWN',
      inspectionProfile: input.profile || 'Construction',
    };
  }

  public async detectVideo(input: InferenceInput): Promise<any> {
    return this.getActiveAdapter().detectVideo(input);
  }

  public async detectFrame(input: InferenceInput): Promise<DetectionResult[]> {
    return this.getActiveAdapter().detectFrame(input);
  }

  public async detectFrameFull(input: InferenceInput): Promise<FullInferenceResponse> {
    const adapter = this.getActiveAdapter();
    if (adapter.detectFrameFull) {
      return adapter.detectFrameFull(input);
    }
    const detections = await adapter.detectFrame(input);
    return {
      success: true,
      modelName: adapter.name,
      modelId: 'LEGACY-ADAPTER',
      modelStatus: 'configured',
      inferenceTimeMs: 0,
      totalPersonsDetected: detections.length,
      totalViolationsDetected: detections.filter((d) => d.severity === 'critical' || d.severity === 'high').length,
      detections,
      trackedWorkers: [],
      incidentCandidates: [],
    };
  }
}
