import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const ENV = {
  PORT: parseInt(process.env.PORT || '5005', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safevision?replicaSet=rs0',
  JWT_SECRET: process.env.JWT_SECRET || 'safevision-hackathon-jwt-secret-key-super-secure-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  DEMO_MODE: process.env.DEMO_MODE === 'true',
  UPLOAD_DIR: path.resolve(__dirname, '../../uploads'),
  CAM_01_RTSP_URL: process.env.CAM_01_RTSP_URL || process.env.CCTV_RTSP_URL || '',
  CCTV_RTSP_USER: process.env.CCTV_RTSP_USER || '',
  CCTV_RTSP_PASS: process.env.CCTV_RTSP_PASS || '',
  PPE_CONFIDENCE: parseFloat(process.env.PPE_CONFIDENCE || '0.35'),
  PPE_MODEL_PATH: process.env.PPE_MODEL_PATH || 'ai/models/ppe/best.pt',
};

export function getCam01EffectiveUrl(): string {
  const rawUrl = ENV.CAM_01_RTSP_URL;
  if (!rawUrl) return '';
  if (ENV.CCTV_RTSP_USER && !rawUrl.includes('@')) {
    const passPart = ENV.CCTV_RTSP_PASS ? `:${ENV.CCTV_RTSP_PASS}` : '';
    return rawUrl.replace('://', `://${ENV.CCTV_RTSP_USER}${passPart}@`);
  }
  return rawUrl;
}
