import { AIAdapter, InferenceInput, DetectionResult } from './AIAdapter';
import { RiskEngine } from '../risk/RiskEngine';

/**
 * Diagnostic test adapter ONLY.
 * Never used in production. All generated detections are explicitly marked `isAuthoritative: false`
 * and will never create authoritative incident records in MongoDB.
 */
export class DemoAdapter implements AIAdapter {
  public readonly name = 'SafeVision-Diagnostic-TestEngine';
  public readonly version = '1.0.0-test';

  private demoScenarios: Array<{
    workerId: string;
    workerName: string;
    class:
      | 'missing_vest'
      | 'missing_helmet'
      | 'no_gloves'
      | 'no_safety_footwear'
      | 'restricted_zone'
      | 'smoke'
      | 'fire'
      | 'worker_fall'
      | 'unsafe_crowding';
    confidence: number;
    box: { ymin: number; xmin: number; ymax: number; xmax: number };
    zone: string;
    cameraId: string;
    image: string;
  }> = [
    {
      workerId: 'TEST-001',
      workerName: 'Diagnostic Subject 1',
      class: 'missing_vest',
      confidence: 0.95,
      box: { ymin: 24, xmin: 44, ymax: 72, xmax: 56 },
      zone: 'Furnace Bay',
      cameraId: 'CAM-04',
      image: '',
    },
    {
      workerId: 'TEST-002',
      workerName: 'Diagnostic Subject 2',
      class: 'missing_helmet',
      confidence: 0.92,
      box: { ymin: 15, xmin: 25, ymax: 60, xmax: 45 },
      zone: 'Furnace Bay',
      cameraId: 'CAM-04',
      image: '',
    }
  ];

  public async detectImage(input: InferenceInput): Promise<DetectionResult[]> {
    return this.demoScenarios.map((scenario) => {
      const risk = RiskEngine.evaluate({
        violationType: scenario.class,
        confidence: scenario.confidence,
        zone: scenario.zone,
      });

      return {
        workerId: scenario.workerId,
        workerName: scenario.workerName,
        class: scenario.class,
        confidence: scenario.confidence,
        boundingBox: {
          ...scenario.box,
          label: `DIAGNOSTIC: ${scenario.class.toUpperCase().replace('_', ' ')}`,
          color: risk.severity === 'critical' ? '#EF4444' : '#FBBF24',
        },
        zone: scenario.zone,
        cameraId: scenario.cameraId,
        timestamp: new Date().toISOString(),
        severity: risk.severity,
        riskScore: risk.riskScore,
        explainabilityFactors: ['Diagnostic test feed only - non-authoritative'],
        recommendedAction: 'Diagnostic observation only.',
        evidenceImage: scenario.image,
        isAuthoritative: false,
      };
    });
  }

  public async detectFrame(input: InferenceInput): Promise<DetectionResult[]> {
    return this.detectImage(input);
  }

  public async detectVideo(input: InferenceInput): Promise<DetectionResult[]> {
    return this.detectImage(input);
  }
}
