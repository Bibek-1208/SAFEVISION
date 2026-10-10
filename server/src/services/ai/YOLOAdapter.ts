import fs from 'fs';
import path from 'path';
import { AIAdapter, InferenceInput, DetectionResult, FullInferenceResponse, TrackedWorker, IncidentCandidate } from './AIAdapter';
import { RiskEngine } from '../risk/RiskEngine';
import { ENV } from '../../config/env';

export class YOLOAdapter implements AIAdapter {
  public readonly name = 'SafeVision-AI-Engine';
  public readonly version = '1.0.0-industrial';
  private pythonAiUrl: string;

  constructor() {
    this.pythonAiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  }

  public async detectImage(input: InferenceInput): Promise<DetectionResult[]> {
    const full = await this.detectImageFull(input);
    return full.detections;
  }

  public async detectImageFull(input: InferenceInput): Promise<FullInferenceResponse & {
    personAssessments?: any[];
    expectedRegions?: any[];
    inspectionSummary?: any;
    overallStatus?: string;
    inspectionProfile?: string;
  }> {
    if (!input.cameraId) {
      throw new Error('cameraId is required for AI inference.');
    }
    const zone = input.zone || 'Unassigned Zone';
    const cameraId = input.cameraId;
    const profile = input.profile || 'Construction';

    if (input.imagePath) {
      const fullPath = path.isAbsolute(input.imagePath)
        ? input.imagePath
        : path.join(process.cwd(), input.imagePath.startsWith('/') ? input.imagePath.slice(1) : input.imagePath);

      if (fs.existsSync(fullPath)) {
        try {
          const fileBuffer = fs.readFileSync(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
          const blob = new Blob([fileBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append('file', blob, path.basename(fullPath));
          formData.append('camera_id', cameraId);
          formData.append('zone', zone);
          formData.append('conf_thresh', '0.45');
          if (input.requiredPpe && input.requiredPpe.length > 0) {
            formData.append('required_ppe', JSON.stringify(input.requiredPpe));
          }
          if (profile) {
            formData.append('profile', profile);
          }

          const response = await fetch(`${this.pythonAiUrl}/infer/image`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`AI service returned HTTP ${response.status}: ${response.statusText}`);
          }

          const data: any = await response.json();
          const isConfigured = data.model_status === 'configured';

          const results: DetectionResult[] = [];
          if (data.detections && Array.isArray(data.detections)) {
            for (const det of data.detections) {
              const risk = RiskEngine.evaluate({
                violationType: det.class_name,
                confidence: det.confidence,
                zone,
                durationSeconds: det.persisted_duration_sec || 0,
              });

              results.push({
                workerId: det.worker_tracking_id || 'UNIDENTIFIED',
                workerName: 'Unidentified Worker',
                class: det.class_name,
                confidence: det.confidence,
                boundingBox: {
                  ymin: det.bounding_box.ymin,
                  xmin: det.bounding_box.xmin,
                  ymax: det.bounding_box.ymax,
                  xmax: det.bounding_box.xmax,
                  label: det.bounding_box.label || `${det.class_name.toUpperCase()} [${(det.confidence * 100).toFixed(1)}%]`,
                  color: det.bounding_box.color || (det.violation ? '#EF4444' : '#34D399'),
                },
                zone,
                cameraId,
                timestamp: det.timestamp || new Date().toISOString(),
                severity: det.severity || risk.severity,
                riskScore: risk.riskScore,
                explainabilityFactors: risk.explainabilityFactors,
                recommendedAction: risk.recommendedAction,
                evidenceImage: `data:image/jpeg;base64,${fileBuffer.toString('base64')}`,
                isAuthoritative: isConfigured && det.is_authoritative !== false,
              });
            }
          }

          return {
            success: data.success,
            modelName: data.model_name,
            modelId: data.model_id,
            modelStatus: data.model_status,
            inferenceTimeMs: data.inference_time_ms,
            totalPersonsDetected: data.total_persons_detected,
            totalViolationsDetected: data.total_violations_detected,
            detections: results,
            trackedWorkers: data.tracked_workers || [],
            incidentCandidates: data.incident_candidates || [],
            warnings: data.warnings || [],
            personAssessments: data.person_assessments || [],
            expectedRegions: data.expected_regions || [],
            inspectionSummary: data.inspection_summary || null,
            overallStatus: data.overall_status || null,
            inspectionProfile: data.inspection_profile || profile,
          };
        } catch (err: any) {
          console.error('[YOLOAdapter] File upload or inference error:', err);
        }
      }
    }

    return {
      success: false,
      modelName: this.name,
      modelId: 'MODEL-PPE-NONE',
      modelStatus: 'error',
      inferenceTimeMs: 0,
      totalPersonsDetected: 0,
      totalViolationsDetected: 0,
      detections: [],
      trackedWorkers: [],
      incidentCandidates: [],
      warnings: ['Image processing failed.'],
      personAssessments: [],
      expectedRegions: [],
      inspectionSummary: null,
      overallStatus: 'ERROR',
      inspectionProfile: profile,
    };
  }

  public async detectFrameFull(input: InferenceInput): Promise<FullInferenceResponse> {
    if (!input.cameraId) {
      throw new Error('cameraId is required for AI inference.');
    }
    const zone = input.zone || 'Unassigned Zone';
    const cameraId = input.cameraId;
    const timestamp = new Date().toISOString();

    if (!input.frameBase64) {
      return {
        success: false,
        modelName: this.name,
        modelId: 'MODEL-PPE-NONE',
        modelStatus: 'error',
        inferenceTimeMs: 0,
        totalPersonsDetected: 0,
        totalViolationsDetected: 0,
        detections: [],
        trackedWorkers: [],
        incidentCandidates: [],
        warnings: ['Missing frame payload.'],
      };
    }

    try {
      const response = await fetch(`${this.pythonAiUrl}/infer/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame_base64: input.frameBase64,
          camera_id: cameraId,
          zone: zone,
          conf_thresh: input.confThresh || ENV.PPE_CONFIDENCE || 0.35,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      const isConfigured = data.model_status === 'configured';

      const results: DetectionResult[] = [];
      if (data.detections && Array.isArray(data.detections)) {
        for (const det of data.detections) {
          const risk = RiskEngine.evaluate({
            violationType: det.class_name,
            confidence: det.confidence,
            zone,
            durationSeconds: det.persisted_duration_sec || 0,
          });

          results.push({
            workerId: det.worker_tracking_id || 'UNIDENTIFIED',
            workerName: 'Unidentified Worker',
            class: det.class_name,
            confidence: det.confidence,
            boundingBox: {
              ymin: det.bounding_box.ymin,
              xmin: det.bounding_box.xmin,
              ymax: det.bounding_box.ymax,
              xmax: det.bounding_box.xmax,
              label: det.bounding_box.label || `${det.class_name.toUpperCase()} [${(det.confidence * 100).toFixed(1)}%]`,
              color: det.bounding_box.color || (det.violation ? '#EF4444' : '#34D399'),
            },
            zone,
            cameraId,
            timestamp: det.timestamp || timestamp,
            severity: det.severity || risk.severity,
            riskScore: risk.riskScore,
            explainabilityFactors: risk.explainabilityFactors,
            recommendedAction: risk.recommendedAction,
            evidenceImage: input.frameBase64,
            isAuthoritative: isConfigured && det.is_authoritative !== false,
          });
        }
      }

      const trackedWorkers: TrackedWorker[] = [];
      if (data.tracked_workers && Array.isArray(data.tracked_workers)) {
        for (const tw of data.tracked_workers) {
          const bb = tw.bounding_box;
          const bboxArr = bb ? [bb.ymin, bb.xmin, bb.ymax, bb.xmax] : (tw.bbox || [0, 0, 0, 0]);
          trackedWorkers.push({
            trackId: tw.track_id,
            employeeId: tw.employee_id || null,
            employeeName: tw.employee_name || null,
            identityStatus: tw.identity_status || 'UNCONFIRMED',
            personConfidence: tw.person_confidence,
            ppeState: {
              helmet: tw.helmet_status || tw.ppe_state?.helmet || 'UNKNOWN',
              vest: tw.vest_status || tw.ppe_state?.vest || 'UNKNOWN',
              gloves: tw.gloves_status || tw.ppe_state?.gloves || 'UNKNOWN',
              shoes: tw.shoes_status || tw.ppe_state?.shoes || 'UNKNOWN',
              glasses: tw.glasses_status || tw.ppe_state?.glasses || 'UNKNOWN',
              mask: tw.mask_status || tw.ppe_state?.mask || 'UNKNOWN',
            },
            ppeDetails: tw.ppe_details,
            overallCompliance: tw.overall_compliance,
            complianceDurationSec: tw.compliance_duration_sec,
            temporalState: tw.temporal_state || 'OBSERVING',
            bbox: bboxArr,
          });
        }
      }

      const incidentCandidates: IncidentCandidate[] = [];
      if (isConfigured && data.incident_candidates && Array.isArray(data.incident_candidates)) {
        for (const cand of data.incident_candidates) {
          incidentCandidates.push({
            trackId: cand.track_id,
            employeeId: cand.employee_id || null,
            employeeName: cand.employee_name || null,
            identityStatus: cand.identity_status || 'UNCONFIRMED',
            violationType: cand.violation_type,
            severity: cand.severity || 'high',
            confidence: cand.confidence,
            cameraId: cand.camera_id || cameraId,
            zone: cand.zone || zone,
            timestamp: cand.timestamp || timestamp,
            boundingBox: cand.bounding_box,
            ruleId: cand.rule_id,
            modelId: cand.model_id,
            whyFlagged: cand.why_flagged || [],
            temporalConfigUsed: cand.temporal_config_used || {},
          });
        }
      }

      return {
        success: data.success ?? true,
        modelName: data.model_name || this.name,
        modelId: data.model_id || 'MODEL-PPE-001',
        modelStatus: data.model_status || 'unconfigured',
        inferenceTimeMs: data.inference_time_ms || 0,
        totalPersonsDetected: data.total_persons_detected || 0,
        totalViolationsDetected: data.total_violations_detected || 0,
        detections: results,
        trackedWorkers,
        incidentCandidates,
        warnings: data.warnings || [],
      };
    } catch (error: any) {
      console.warn(`[YOLOAdapter] AI Service call to ${this.pythonAiUrl} failed:`, error.message);
      return {
        success: false,
        modelName: this.name,
        modelId: 'MODEL-OFFLINE',
        modelStatus: 'offline',
        inferenceTimeMs: 0,
        totalPersonsDetected: 0,
        totalViolationsDetected: 0,
        detections: [],
        trackedWorkers: [],
        incidentCandidates: [],
        warnings: [`AI Service unreachable: ${error.message}`],
      };
    }
  }

  public async detectFrame(input: InferenceInput): Promise<DetectionResult[]> {
    const full = await this.detectFrameFull(input);
    return full.detections;
  }

  public async detectVideo(input: InferenceInput): Promise<any> {
    if (!input.cameraId) {
      throw new Error('cameraId is required for AI video inference.');
    }
    const zone = input.zone || 'Unassigned Zone';
    const cameraId = input.cameraId;

    if (input.videoPath) {
      const fullPath = path.isAbsolute(input.videoPath)
        ? input.videoPath
        : path.join(process.cwd(), input.videoPath.startsWith('/') ? input.videoPath.slice(1) : input.videoPath);

      if (fs.existsSync(fullPath)) {
        try {
          const fileBuffer = fs.readFileSync(fullPath);
          const blob = new Blob([fileBuffer], { type: 'video/mp4' });
          const formData = new FormData();
          formData.append('file', blob, path.basename(fullPath));
          formData.append('camera_id', cameraId);
          formData.append('zone', zone);
          if (input.requiredPpe && input.requiredPpe.length > 0) {
            formData.append('required_ppe', JSON.stringify(input.requiredPpe));
          }
          if (input.profile) {
            formData.append('profile', input.profile);
          }

          const response = await fetch(`${this.pythonAiUrl}/infer/video`, {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data: any = await response.json();
            const results: DetectionResult[] = [];

            if (data.keyframes && Array.isArray(data.keyframes)) {
              for (const kf of data.keyframes) {
                if (kf.detections && Array.isArray(kf.detections)) {
                  for (const det of kf.detections) {
                    const risk = RiskEngine.evaluate({
                      violationType: det.class_name,
                      confidence: det.confidence,
                      zone,
                      durationSeconds: det.persisted_duration_sec || 0,
                    });

                    results.push({
                      workerId: det.worker_tracking_id || 'UNIDENTIFIED',
                      workerName: 'Unidentified Worker',
                      class: det.class_name,
                      confidence: det.confidence,
                      boundingBox: {
                        ymin: det.bounding_box.ymin,
                        xmin: det.bounding_box.xmin,
                        ymax: det.bounding_box.ymax,
                        xmax: det.bounding_box.xmax,
                        label: det.bounding_box.label || `${det.class_name.toUpperCase()} [${(det.confidence * 100).toFixed(1)}%]`,
                        color: det.bounding_box.color || (det.violation ? '#EF4444' : '#34D399'),
                      },
                      zone,
                      cameraId,
                      timestamp: det.timestamp || new Date().toISOString(),
                      severity: det.severity || risk.severity,
                      riskScore: risk.riskScore,
                      explainabilityFactors: risk.explainabilityFactors,
                      recommendedAction: risk.recommendedAction,
                      evidenceImage: kf.snapshot_base64 || '',
                      isAuthoritative: data.model_status === 'configured' && det.is_authoritative !== false,
                    });
                  }
                }
              }
            }

            return {
              videoMetrics: {
                videoDurationSec: data.video_duration_sec,
                totalFrames: data.total_frames,
                fps: data.fps,
                framesAnalyzed: data.frames_analyzed,
                processingTimeSec: data.processing_time_sec,
                effectiveFps: data.effective_fps || (data.processing_time_sec > 0 ? Math.round((data.frames_analyzed / data.processing_time_sec) * 10) / 10 : 0),
                totalPersons: data.total_persons_detected ?? (data.total_tracks ?? 0),
                totalTracks: data.total_tracks ?? (data.total_persons_detected ?? 0),
                totalViolations: data.total_violations_detected || 0,
                analysisStatus: data.analysis_status || (data.total_violations_detected > 0 ? 'CONFIRMED_VIOLATION' : (data.total_persons_detected > 0 ? 'NO_VIOLATION' : 'NO_DETECTION')),
                analysisSummary: data.analysis_summary || '',
                modelName: data.model_name,
              },
              detections: results,
              keyframes: data.keyframes,
              incidentCandidates: data.incident_candidates || [],
              personAssessments: data.person_assessments || [],
              expectedRegions: data.expected_regions || [],
              inspectionSummary: data.inspection_summary || null,
              overallStatus: data.overall_status || null,
              inspectionProfile: data.inspection_profile || input.profile || 'Construction',
            };
          }
        } catch (err: any) {
          console.error('[YOLOAdapter] Video inference error:', err.message);
        }
      }
    }

    return {
      detections: [],
      videoMetrics: null,
      keyframes: [],
      personAssessments: [],
      expectedRegions: [],
      inspectionSummary: null,
      overallStatus: 'NO_DETECTION',
      inspectionProfile: input.profile || 'Construction',
    };
  }
}
