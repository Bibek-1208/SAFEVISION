import {
  Incident,
  Camera,
  Zone,
  AuditReport,
  SystemHealth,
  User,
  SafetySummary,
  ZoneHeatmapData,
  NearMiss,
  ObservedPatternsReport,
  ZoneSafetyPolicy,
  IncidentTimelineEvent,
  RestrictedZone,
  EmergencyZone,
  EmergencyZoneState,
  LoneWorkerState,
  SafetyTrendsResponse,
  ZoneComparisonResponse,
  ShiftAnalysisResponse,
  SafetyHeatmapResponse,
  HeatmapFilterParams,
  NearMissAnalyticsReport,
  IncidentResponseBundle,
  IncidentResponseSummary,
  RoutingDecision,
  FirstResponderResolution,
  ReplayDetails,
  IncidentQueueResponse,
  IncidentEvidenceTimelineReport,
  IncidentEvidenceTimelineEntry,
} from '../types';

const BASE_URL = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('safevision_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Login failed');
    return res.json();
  },

  async loginWithFirebase(idToken: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${BASE_URL}/auth/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      let errMsg = 'Firebase login failed';
      try {
        const err = await res.json();
        errMsg = err.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    return res.json();
  },

  async demoLogin(role: 'safety_officer' | 'plant_manager' | 'admin'): Promise<{ token: string; user: User }> {
    const res = await fetch(`${BASE_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Demo login failed');
    return res.json();
  },

  async getProfile(): Promise<{ user: User }> {
    const res = await fetch(`${BASE_URL}/auth/me`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Profile retrieval failed');
    return res.json();
  },

  // Health
  async getHealth(): Promise<SystemHealth> {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error('System health check failed');
    const data = await res.json();
    return {
      ...data,
      degradedReasons: Array.isArray(data.degradedReasons) ? data.degradedReasons : [],
    };
  },

  // Incidents
  async getIncidents(params?: {
    zone?: string;
    severity?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; incidents: Incident[] }> {
    const query = new URLSearchParams();
    if (params?.zone) query.append('zone', params.zone);
    if (params?.severity) query.append('severity', params.severity);
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const res = await fetch(`${BASE_URL}/incidents?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incidents');
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.incidents) ? data.incidents.length : 0),
      incidents: Array.isArray(data.incidents) ? data.incidents : [],
    };
  },

  async getIncidentById(id: string): Promise<{ incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Incident not found');
    return res.json();
  },

  async getIncidentEvidenceBlob(id: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/evidence`, { headers: getHeaders() });
    if (!res.ok) {
      let errReason = 'Visual evidence unavailable';
      try {
        const errJson = await res.json();
        errReason = errJson.reason || errJson.error || errReason;
      } catch {}
      throw new Error(errReason);
    }
    return res.blob();
  },

  async createIncident(incidentData: Partial<Incident>): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(incidentData),
    });
    if (!res.ok) throw new Error('Failed to create incident');
    return res.json();
  },

  async updateIncident(id: string, updates: Partial<Incident>): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update incident');
    return res.json();
  },

  // Cameras
  async getCameras(): Promise<{ cameras: Camera[] }> {
    const res = await fetch(`${BASE_URL}/cameras`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch cameras');
    const data = await res.json();
    return {
      cameras: Array.isArray(data.cameras) ? data.cameras : [],
    };
  },

  async updateCameraStatus(id: string, status: Camera['status']): Promise<{ success: boolean; camera: Camera }> {
    const res = await fetch(`${BASE_URL}/cameras/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update camera status');
    return res.json();
  },

  async updateCamera(id: string, updates: Partial<Camera>): Promise<{ success: boolean; camera: Camera }> {
    const res = await fetch(`${BASE_URL}/cameras/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update camera');
    }
    return res.json();
  },

  async deleteCamera(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/cameras/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete camera');
    }
    return res.json();
  },

  async probeCamera(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/cameras/${encodeURIComponent(id)}/probe`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Probe failed');
    }
    return res.json();
  },

  async connectCamera(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/cameras/${encodeURIComponent(id)}/connect`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Connect failed');
    }
    return res.json();
  },

  async disconnectCamera(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/cameras/${encodeURIComponent(id)}/disconnect`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Disconnect failed');
    }
    return res.json();
  },

  // Zones
  async getZones(): Promise<{ zones: Zone[] }> {
    const res = await fetch(`${BASE_URL}/zones`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch zones');
    const data = await res.json();
    return {
      zones: Array.isArray(data.zones)
        ? data.zones.map((z: any) => ({
            ...z,
            requiredPPE: Array.isArray(z.requiredPPE) ? z.requiredPPE : [],
          }))
        : [],
    };
  },

  // Restricted Zones / Geofences (Phase 9.1)
  async getRestrictedZones(params?: {
    cameraId?: string;
    siteId?: string;
    enabled?: boolean;
  }): Promise<{ zones: RestrictedZone[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.cameraId) query.append('cameraId', params.cameraId);
    if (params?.siteId) query.append('siteId', params.siteId);
    if (params?.enabled !== undefined) query.append('enabled', String(params.enabled));

    const res = await fetch(`${BASE_URL}/restricted-zones?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch restricted zones');
    const data = await res.json();
    return {
      zones: Array.isArray(data.zones) ? data.zones : [],
      total: data.total ?? (Array.isArray(data.zones) ? data.zones.length : 0),
    };
  },

  async getCameraRestrictedZones(cameraId: string): Promise<{ zones: RestrictedZone[]; total: number }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/camera/${encodeURIComponent(cameraId)}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch camera restricted zones');
    const data = await res.json();
    return {
      zones: Array.isArray(data.zones) ? data.zones : [],
      total: data.total ?? (Array.isArray(data.zones) ? data.zones.length : 0),
    };
  },

  async getRestrictedZoneById(id: string): Promise<{ zone: RestrictedZone }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Restricted zone not found');
    return res.json();
  },

  async createRestrictedZone(zoneData: Partial<RestrictedZone>): Promise<{ success: boolean; zone: RestrictedZone }> {
    const res = await fetch(`${BASE_URL}/restricted-zones`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(zoneData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create restricted zone');
    }
    return res.json();
  },

  async updateRestrictedZone(
    id: string,
    updates: Partial<RestrictedZone>
  ): Promise<{ success: boolean; zone: RestrictedZone }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update restricted zone');
    }
    return res.json();
  },

  async toggleRestrictedZone(id: string): Promise<{ success: boolean; zone: RestrictedZone }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/${id}/toggle`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to toggle restricted zone status');
    return res.json();
  },

  async deleteRestrictedZone(id: string): Promise<{ success: boolean; message: string; zoneId: string }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete restricted zone');
    return res.json();
  },

  // Lone Worker / Isolation Safety Monitoring (Phase 9.3)
  async getLoneWorkerStates(cameraId?: string): Promise<{
    success: boolean;
    count: number;
    summary: {
      totalConfigured: number;
      activeIsolatedCount: number;
      warningCount: number;
      checkInRequiredCount: number;
      openIncidentsCount: number;
      safeCount: number;
      offlineCount: number;
    };
    states: LoneWorkerState[];
  }> {
    const query = new URLSearchParams();
    if (cameraId) query.set('cameraId', cameraId);
    const res = await fetch(`${BASE_URL}/restricted-zones/lone-worker/states?${query.toString()}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch lone worker states');
    return res.json();
  },

  async submitLoneWorkerCheckIn(
    zoneId: string,
    trackId?: number | string,
    notes?: string
  ): Promise<{ success: boolean; message: string; zoneId: string; state?: LoneWorkerState }> {
    const res = await fetch(`${BASE_URL}/restricted-zones/lone-worker/check-in`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ zoneId, trackId, notes }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit lone worker check-in');
    }
    return res.json();
  },

  // Emergency Zones (Phase 9.2: Emergency Exit & Escape Route Safety Monitoring)
  async getEmergencyZones(params?: { siteId?: string; cameraId?: string; enabled?: boolean }): Promise<{ zones: EmergencyZone[]; count: number }> {
    const query = new URLSearchParams();
    if (params?.siteId) query.append('siteId', params.siteId);
    if (params?.cameraId) query.append('cameraId', params.cameraId);
    if (params?.enabled !== undefined) query.append('enabled', String(params.enabled));

    const res = await fetch(`${BASE_URL}/emergency-zones?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch emergency zones');
    const data = await res.json();
    return {
      zones: Array.isArray(data.zones) ? data.zones : [],
      count: data.count ?? (Array.isArray(data.zones) ? data.zones.length : 0),
    };
  },

  async getEmergencyZoneStates(siteId?: string): Promise<{
    summary: {
      totalConfigured: number;
      clearCount: number;
      candidateCount: number;
      blockedCount: number;
      offlineCount: number;
    };
    states: EmergencyZoneState[];
  }> {
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const res = await fetch(`${BASE_URL}/emergency-zones/states${query}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch emergency zone states');
    return res.json();
  },

  async getCameraEmergencyZones(cameraId: string): Promise<{ zones: EmergencyZone[]; count: number }> {
    const res = await fetch(`${BASE_URL}/emergency-zones?cameraId=${encodeURIComponent(cameraId)}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch camera emergency zones');
    const data = await res.json();
    return {
      zones: Array.isArray(data.zones) ? data.zones : [],
      count: data.count ?? (Array.isArray(data.zones) ? data.zones.length : 0),
    };
  },

  async getEmergencyZoneById(id: string): Promise<{ zone: EmergencyZone }> {
    const res = await fetch(`${BASE_URL}/emergency-zones/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Emergency zone not found');
    return res.json();
  },

  async createEmergencyZone(zoneData: Partial<EmergencyZone>): Promise<{ success: boolean; zone: EmergencyZone; notice?: string }> {
    const res = await fetch(`${BASE_URL}/emergency-zones`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(zoneData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create emergency zone');
    }
    return res.json();
  },

  async updateEmergencyZone(id: string, updates: Partial<EmergencyZone>): Promise<{ success: boolean; zone: EmergencyZone }> {
    const res = await fetch(`${BASE_URL}/emergency-zones/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update emergency zone');
    }
    return res.json();
  },

  async toggleEmergencyZone(id: string): Promise<{ success: boolean; zoneId: string; enabled: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/emergency-zones/${id}/toggle`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to toggle emergency zone status');
    return res.json();
  },

  async deleteEmergencyZone(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/emergency-zones/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete emergency zone');
    return res.json();
  },

  async getEmergencyModelTaxonomy(): Promise<{ modelId: string; modelName: string; allModelClasses: string[]; supportedObstructionClasses: string[] }> {
    const res = await fetch(`${BASE_URL}/emergency-zones/model/taxonomy`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch model taxonomy');
    return res.json();
  },

  // Analytics
  async getAnalytics(params?: { timeframe?: string; cameraId?: string; zoneId?: string }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  async getHeatmap(params?: { timeframe?: string; cameraId?: string; zoneId?: string; limit?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    if (params?.limit) sp.append('limit', String(params.limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics/heatmap${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch heatmap data');
    return res.json();
  },

  async getTrends(params?: {
    timeframe?: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  }): Promise<SafetyTrendsResponse> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    if (params?.violationType) sp.append('violationType', params.violationType);
    if (params?.severity) sp.append('severity', params.severity);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics/trends${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch safety trends');
    return res.json();
  },

  async getZoneComparison(params?: {
    timeframe?: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  }): Promise<ZoneComparisonResponse> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    if (params?.violationType) sp.append('violationType', params.violationType);
    if (params?.severity) sp.append('severity', params.severity);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics/zone-comparison${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch zone comparison analytics');
    return res.json();
  },

  async getShiftAnalysis(params?: {
    timeframe?: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  }): Promise<ShiftAnalysisResponse> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    if (params?.violationType) sp.append('violationType', params.violationType);
    if (params?.severity) sp.append('severity', params.severity);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics/shift-analysis${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch shift safety analysis');
    return res.json();
  },

  async getSafetyHeatmap(params?: HeatmapFilterParams): Promise<SafetyHeatmapResponse> {
    const sp = new URLSearchParams();
    if (params?.timeframe) sp.append('timeframe', params.timeframe);
    if (params?.cameraId) sp.append('cameraId', params.cameraId);
    if (params?.zoneId) sp.append('zoneId', params.zoneId);
    if (params?.violationType) sp.append('violationType', params.violationType);
    if (params?.severity) sp.append('severity', params.severity);
    if (params?.shift) sp.append('shift', params.shift);
    if (params?.limit) sp.append('limit', String(params.limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`${BASE_URL}/analytics/heatmap${qs}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch safety heatmap');
    return res.json();
  },

  // Reports
  async getReports(): Promise<{ reports: AuditReport[] }> {
    const res = await fetch(`${BASE_URL}/reports`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit reports');
    const data = await res.json();
    return {
      reports: Array.isArray(data.reports) ? data.reports : [],
    };
  },

  async generateReport(options: {
    standard: 'DGFASLI' | 'OSHA' | 'INTERNAL';
    siteId?: string;
    siteName: string;
    siteCode?: string;
    dateRange: { from: string; to: string };
    sections: string[];
    generatedBy: string;
  }): Promise<{ success: boolean; report: AuditReport; downloadUrl: string; fileName?: string }> {
    const res = await fetch(`${BASE_URL}/reports`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      let errMsg = 'Failed to generate audit report PDF';
      try {
        const errJson = await res.json();
        errMsg = errJson.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    return res.json();
  },

  async downloadReportPdf(reportId: string, filename?: string): Promise<void> {
    const token = localStorage.getItem('safevision_token');
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const res = await fetch(`${BASE_URL}/reports/${encodeURIComponent(reportId)}/download${query}`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      let errMsg = 'Failed to download report PDF';
      try {
        const errJson = await res.json();
        errMsg = errJson.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${reportId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Detection API
  async getInspectionConfig(): Promise<{
    success: boolean;
    classes: any[];
    profiles: any[];
    activeModel: any;
  }> {
    const res = await fetch(`${BASE_URL}/detection/inspection-config`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch inspection configuration');
    return res.json();
  },

  async detectImage(formData: FormData): Promise<any> {
    const token = localStorage.getItem('safevision_token');
    const res = await fetch(`${BASE_URL}/detection/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error('Image inference failed');
    return res.json();
  },

  async detectVideo(formData: FormData): Promise<any> {
    const token = localStorage.getItem('safevision_token');
    const res = await fetch(`${BASE_URL}/detection/video`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error('Video inference failed');
    return res.json();
  },

  async detectFrame(frameBase64: string, zone?: string, cameraId?: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/detection/frame`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ frameBase64, zone, cameraId }),
    });
    if (!res.ok) throw new Error('Frame inference failed');
    return res.json();
  },

  // False Positive
  async submitFalsePositive(data: {
    incidentId: string;
    reason: 'Lighting' | 'Occlusion' | 'Incorrect detection' | 'Worker outside zone' | 'Other';
    notes?: string;
    submittedBy?: string;
  }): Promise<any> {
    const res = await fetch(`${BASE_URL}/feedback/false-positive`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to record false positive feedback');
    return res.json();
  },

  // Admin APIs
  async getUsers(): Promise<{ users: User[]; total: number }> {
    const res = await fetch(`${BASE_URL}/admin/users`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  async createUser(userData: {
    name: string;
    email: string;
    password?: string;
    role: string;
    siteIds?: string[];
    zoneIds?: string[];
    department?: string;
    shift?: string;
  }): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${BASE_URL}/admin/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userData),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create user');
    return res.json();
  },

  async updateUserRole(id: string, role: string, siteIds?: string[], zoneIds?: string[]): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${BASE_URL}/admin/users/${id}/role`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ role, siteIds, zoneIds }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update user role');
    return res.json();
  },

  async toggleUserStatus(id: string, status: 'ACTIVE' | 'DISABLED'): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${BASE_URL}/admin/users/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update user status');
    return res.json();
  },

  async getAuditLogs(params?: { action?: string; resourceType?: string; limit?: number }): Promise<{ auditLogs: any[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.action) query.append('action', params.action);
    if (params?.resourceType) query.append('resourceType', params.resourceType);
    if (params?.limit) query.append('limit', params.limit.toString());

    const res = await fetch(`${BASE_URL}/admin/audit-logs?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.auditLogs) ? data.auditLogs.length : 0),
      auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
    };
  },

  async getAdminSystemHealth(): Promise<any> {
    const res = await fetch(`${BASE_URL}/admin/system-health`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin system health');
    return res.json();
  },

  // Incident Workflow APIs
  async dispatchIncident(id: string, stewardName?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/dispatch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ stewardName }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Dispatch failed');
    return res.json();
  },

  async updateIncidentStatus(id: string, status: string, notes?: string, resolutionNotes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status, notes, resolutionNotes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update incident status');
    return res.json();
  },

  // Hazard APIs
  async reportHazard(hazardData: {
    zoneId?: string;
    zoneName: string;
    hazardType: string;
    description: string;
    severity?: string;
  }): Promise<{ success: boolean; hazard: any }> {
    const res = await fetch(`${BASE_URL}/hazards`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(hazardData),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit hazard report');
    return res.json();
  },

  async getHazards(): Promise<{ hazards: any[]; total: number }> {
    const res = await fetch(`${BASE_URL}/hazards`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch hazards');
    return res.json();
  },

  // Site & Company Management
  async getSites(): Promise<{ sites: any[]; total: number }> {
    const res = await fetch(`${BASE_URL}/sites`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch sites list');
    return res.json();
  },

  async getCurrentSite(siteId?: string): Promise<{ site: any; zoneCount?: number; cameraCount?: number }> {
    const url = siteId ? `${BASE_URL}/sites/current?siteId=${encodeURIComponent(siteId)}` : `${BASE_URL}/sites/current`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch active site');
    return res.json();
  },

  async getSite(id: string): Promise<{ site: any }> {
    const res = await fetch(`${BASE_URL}/sites/${encodeURIComponent(id)}`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch site details for '${id}'`);
    return res.json();
  },

  async createSite(data: {
    companyName?: string;
    name: string;
    code: string;
    location: string;
    industry?: string;
    timezone?: string;
    status?: string;
  }): Promise<{ success: boolean; site: any; message?: string }> {
    const res = await fetch(`${BASE_URL}/sites`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create company site');
    }
    return res.json();
  },

  async updateSite(id: string, data: Partial<{
    companyName: string;
    name: string;
    code: string;
    location: string;
    industry: string;
    timezone: string;
    status: string;
  }>): Promise<{ success: boolean; site: any; message?: string }> {
    const res = await fetch(`${BASE_URL}/sites/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update company site');
    }
    return res.json();
  },

  async deleteSite(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${BASE_URL}/sites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete company site');
    }
    return res.json();
  },

  async submitOnboarding(data: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/sites/onboarding`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Onboarding failed');
    return res.json();
  },

  // Cryptographic Audit Verification
  async verifyAuditLogs(): Promise<{ verified: boolean; totalLogs: number; tamperedAt?: string; reason?: string; verifiedAt: string }> {
    const res = await fetch(`${BASE_URL}/admin/audit-logs/verify`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to verify audit log integrity');
    return res.json();
  },

  // Explicit Incident Actions
  async acknowledgeIncident(id: string, notes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/acknowledge`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to acknowledge incident');
    return res.json();
  },

  async resolveIncident(id: string, resolutionNotes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/resolve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ resolutionNotes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to resolve incident');
    return res.json();
  },

  async markFalsePositive(id: string, reason: string, notes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/false-positive`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason, notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to mark as false positive');
    return res.json();
  },

  // Camera Management
  async refreshCameras(): Promise<{ success: boolean; cameras: Camera[] }> {
    const res = await fetch(`${BASE_URL}/cameras/refresh`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to refresh cameras');
    return res.json();
  },

  // Shifts
  async getShifts(siteId?: string): Promise<{
    shifts: any[];
    total: number;
    activeShift?: any;
    hasActiveShift?: boolean;
    serverTime?: string;
    timezone?: string;
  }> {
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const res = await fetch(`${BASE_URL}/shifts${query}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch shifts');
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.shifts) ? data.shifts.length : 0),
      activeShift: data.activeShift || null,
      hasActiveShift: Boolean(data.hasActiveShift),
      serverTime: data.serverTime || new Date().toISOString(),
      timezone: data.timezone || 'Asia/Kolkata',
      shifts: Array.isArray(data.shifts)
        ? data.shifts.map((s: any) => ({
            ...s,
            days: Array.isArray(s.days) ? s.days : [],
          }))
        : [],
    };
  },

  async getCurrentShift(): Promise<{
    activeShift: any;
    hasActiveShift: boolean;
    serverTime: string;
    timezone: string;
  }> {
    const res = await fetch(`${BASE_URL}/shifts/current`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch current shift');
    return res.json();
  },

  // Real Global Search
  async globalSearch(query: string, limit: number = 8): Promise<{
    query: string;
    totalResults: number;
    categories: {
      incidents: any[];
      cameras: any[];
      workers: any[];
      rules: any[];
      zones: any[];
      shifts: any[];
      sites: any[];
    };
  }> {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Global search request failed');
    return res.json();
  },

  async createShift(data: any): Promise<{ success: boolean; shift: any }> {
    const res = await fetch(`${BASE_URL}/shifts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create shift');
    return res.json();
  },

  async updateShift(id: string, data: any): Promise<{ success: boolean; shift: any }> {
    const res = await fetch(`${BASE_URL}/shifts/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update shift');
    return res.json();
  },

  async toggleShift(id: string): Promise<{ success: boolean; shift: any }> {
    const res = await fetch(`${BASE_URL}/shifts/${id}/toggle`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to toggle shift');
    return res.json();
  },

  // Employees
  async getEmployees(params?: { search?: string; zoneId?: string; status?: string; shift?: string }): Promise<{ employees: any[]; total: number; userRole: string }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.zoneId) query.append('zoneId', params.zoneId);
    if (params?.status) query.append('status', params.status);
    if (params?.shift) query.append('shift', params.shift);

    const res = await fetch(`${BASE_URL}/employees?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch employees');
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.employees) ? data.employees.length : 0),
      userRole: data.userRole || '',
      employees: Array.isArray(data.employees)
        ? data.employees.map((e: any) => ({
            ...e,
            requiredPPE: Array.isArray(e.requiredPPE) ? e.requiredPPE : [],
          }))
        : [],
    };
  },

  async createEmployee(data: any): Promise<{ success: boolean; employee: any }> {
    const res = await fetch(`${BASE_URL}/employees`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create employee');
    return res.json();
  },

  async updateEmployee(id: string, data: any): Promise<{ success: boolean; employee: any }> {
    const res = await fetch(`${BASE_URL}/employees/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update employee');
    return res.json();
  },

  async deactivateEmployee(id: string): Promise<{ success: boolean; employee: any }> {
    const res = await fetch(`${BASE_URL}/employees/${id}/deactivate`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to toggle employee status');
    return res.json();
  },

  // User Profile
  async updateMyProfile(data: { name?: string; department?: string; shift?: string }): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${BASE_URL}/auth/me/profile`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update profile');
    return res.json();
  },

  async uploadAvatar(formData: FormData): Promise<{ success: boolean; photoURL: string; user: User }> {
    const token = localStorage.getItem('safevision_token');
    const res = await fetch(`${BASE_URL}/auth/me/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload profile photo');
    }
    return res.json();
  },

  // Safety Rules
  async getSafetyRules(params?: { severity?: string; enabled?: boolean }): Promise<{ rules: any[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.severity) query.append('severity', params.severity);
    if (params?.enabled !== undefined) query.append('enabled', String(params.enabled));

    const res = await fetch(`${BASE_URL}/safety-rules?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch safety rules');
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.rules) ? data.rules.length : 0),
      rules: Array.isArray(data.rules)
        ? data.rules.map((r: any) => ({
            ...r,
            zones: Array.isArray(r.zones) ? r.zones : ['*'],
            notificationChannels: Array.isArray(r.notificationChannels) ? r.notificationChannels : ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
          }))
        : [],
    };
  },

  async createSafetyRule(data: any): Promise<{ success: boolean; rule: any }> {
    const res = await fetch(`${BASE_URL}/safety-rules`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create rule');
    return res.json();
  },

  async updateSafetyRule(id: string, data: any): Promise<{ success: boolean; rule: any }> {
    const res = await fetch(`${BASE_URL}/safety-rules/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update rule');
    return res.json();
  },

  // Detailed Health
  async getDatabaseHealth(): Promise<any> {
    const res = await fetch(`${BASE_URL}/health/database`);
    if (!res.ok) throw new Error('Failed to fetch database health');
    return res.json();
  },

  async getAiHealth(): Promise<any> {
    const res = await fetch(`${BASE_URL}/health/ai`);
    if (!res.ok) throw new Error('Failed to fetch AI health');
    return res.json();
  },

  // Phase 7: Safety Intelligence & Analytics
  async getSafetySummary(): Promise<SafetySummary> {
    const res = await fetch(`${BASE_URL}/analytics/safety-summary`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch safety summary');
    return res.json();
  },

  async getZoneHeatmap(timeRange: string = '24h'): Promise<{ timeRange: string; zones: ZoneHeatmapData[] }> {
    const res = await fetch(`${BASE_URL}/analytics/zones?timeRange=${timeRange}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch zone safety heatmap');
    return res.json();
  },

  async getNearMisses(zoneId?: string): Promise<{ total: number; nearMisses: NearMiss[] }> {
    const query = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
    const res = await fetch(`${BASE_URL}/analytics/near-misses${query}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch near-misses');
    return res.json();
  },

  async getNearMissAnalytics(params: {
    timeframe?: string;
    cameraId?: string;
    zoneId?: string;
    severity?: string;
    nearMissType?: string;
    shift?: string;
    status?: string;
  } = {}): Promise<NearMissAnalyticsReport> {
    const searchParams = new URLSearchParams();
    if (params.timeframe) searchParams.set('timeframe', params.timeframe);
    if (params.cameraId) searchParams.set('cameraId', params.cameraId);
    if (params.zoneId) searchParams.set('zoneId', params.zoneId);
    if (params.severity) searchParams.set('severity', params.severity);
    if (params.nearMissType) searchParams.set('nearMissType', params.nearMissType);
    if (params.shift) searchParams.set('shift', params.shift);
    if (params.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const url = `${BASE_URL}/analytics/near-misses${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch near-miss analytics');
    return res.json();
  },

  async getRiskTrends(): Promise<ObservedPatternsReport> {
    const res = await fetch(`${BASE_URL}/analytics/risk-trends`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch observed risk patterns');
    return res.json();
  },

  async getZonePolicies(): Promise<{ policies: ZoneSafetyPolicy[]; total: number }> {
    const res = await fetch(`${BASE_URL}/zone-policies`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch zone policies');
    return res.json();
  },

  async getZonePolicy(zoneId: string): Promise<{ policy: ZoneSafetyPolicy }> {
    const res = await fetch(`${BASE_URL}/zone-policies/${encodeURIComponent(zoneId)}`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch policy for zone ${zoneId}`);
    return res.json();
  },

  async updateZonePolicy(zoneId: string, policyData: Partial<ZoneSafetyPolicy>): Promise<{ success: boolean; policy: ZoneSafetyPolicy }> {
    const res = await fetch(`${BASE_URL}/zone-policies/${encodeURIComponent(zoneId)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(policyData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update zone policy');
    }
    return res.json();
  },

  async getIncidentTimeline(incidentId: string): Promise<IncidentEvidenceTimelineReport> {
    const res = await fetch(`${BASE_URL}/incidents/${encodeURIComponent(incidentId)}/timeline`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incident timeline');
    return res.json();
  },

  async getIncidentExplanation(incidentId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/incidents/${encodeURIComponent(incidentId)}/explanation`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incident explanation');
    return res.json();
  },

  async downloadIncidentsCsv(filters: Record<string, string | undefined>): Promise<void> {
    const token = localStorage.getItem('safevision_token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);

    for (const [k, v] of Object.entries(filters)) {
      if (
        v !== undefined &&
        v !== null &&
        v !== '' &&
        v !== 'All Zones' &&
        v !== 'All Violations' &&
        v !== 'All Severity' &&
        v !== 'All Status'
      ) {
        params.set(k, String(v));
      }
    }

    const res = await fetch(`${BASE_URL}/incidents/export/csv?${params.toString()}`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      let errMsg = 'Failed to export incidents CSV';
      try {
        const errJson = await res.json();
        errMsg = errJson.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const disposition = res.headers.get('content-disposition');
    let filename = 'SafeVision_Incidents.csv';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1].trim();
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Phase 11: Smart Incident Response
  async getResponseQueue(params?: {
    severity?: string;
    zone?: string;
    cameraId?: string;
    violationType?: string;
    status?: string;
    responseState?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<IncidentQueueResponse> {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          q.append(key, String(val));
        }
      });
    }
    const res = await fetch(`${BASE_URL}/incidents/response/queue?${q.toString()}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch incident response queue');
    return res.json();
  },

  async getIncidentResponse(id: string): Promise<IncidentResponseBundle> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/response`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch incident response');
    return res.json();
  },

  async getIncidentResponseSummary(id: string): Promise<{ summary: IncidentResponseSummary }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/response-summary`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch incident summary');
    return res.json();
  },

  async getIncidentSummary(id: string): Promise<{ summary: IncidentResponseSummary }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/summary`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch incident summary');
    return res.json();
  },

  async getIncidentRouting(id: string): Promise<{ routingDecision: RoutingDecision; firstResponder: FirstResponderResolution }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/routing`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch routing decision');
    return res.json();
  },

  async getIncidentFirstResponder(id: string): Promise<FirstResponderResolution> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/first-responder`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch first responder details');
    return res.json();
  },

  async getIncidentReplay(id: string): Promise<ReplayDetails & { replay: ReplayDetails }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/replay`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch replay details');
    return res.json();
  },

  async routeIncident(id: string): Promise<{ success: boolean; decision: RoutingDecision; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/route`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to route incident');
    return res.json();
  },

  async acknowledgeIncidentResponse(id: string, notes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/acknowledge`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to acknowledge incident');
    return res.json();
  },

  async assignResponder(id: string, responderId: string, notes?: string): Promise<{ success: boolean; incident: Incident; responder: any }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/assign`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ responderId, notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to assign responder');
    return res.json();
  },

  async startIncidentResponse(id: string, notes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/start-response`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to start response');
    return res.json();
  },

  async resolveIncidentResponse(id: string, resolutionNotes?: string, notes?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/resolve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ resolutionNotes, notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to resolve incident');
    return res.json();
  },

  async escalateIncidentResponse(id: string, notes?: string, reason?: string): Promise<{ success: boolean; incident: Incident }> {
    const res = await fetch(`${BASE_URL}/incidents/${id}/escalate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notes, reason }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to escalate incident');
    return res.json();
  },

  // Training & PPE Class Registry (Phase 12.2)
  async getTrainingClasses(activeOnly: boolean = false): Promise<{ classes: any[]; total: number }> {
    const res = await fetch(`${BASE_URL}/training/classes?active_only=${activeOnly}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch PPE classes');
    return res.json();
  },

  async createTrainingClass(payload: {
    name: string;
    displayName: string;
    category?: string;
    subCategory?: string;
    description?: string;
    aliases?: string[];
  }): Promise<{ success: boolean; class: any; disclaimer: string }> {
    const res = await fetch(`${BASE_URL}/training/classes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to create PPE class');
    }
    return res.json();
  },

  async patchTrainingClass(
    id: string,
    payload: { active?: boolean; status?: string }
  ): Promise<{ success: boolean; class: any }> {
    const res = await fetch(`${BASE_URL}/training/classes/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update class');
    return res.json();
  },

  async getTrainingDatasets(): Promise<{ datasets: any[]; total: number }> {
    const res = await fetch(`${BASE_URL}/training/datasets`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch datasets');
    return res.json();
  },

  async getTrainingDataset(id: string): Promise<{ dataset: any }> {
    const res = await fetch(`${BASE_URL}/training/datasets/${id}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch dataset');
    return res.json();
  },

  async importTrainingDataset(payload: {
    sourceDir: string;
    datasetId: string;
    datasetName: string;
    version?: string;
    source?: string;
    license?: string;
    attribution?: string;
    sourceUrl?: string;
  }): Promise<{ success: boolean; dataset: any }> {
    const res = await fetch(`${BASE_URL}/training/datasets/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to import dataset');
    }
    return res.json();
  },

  async auditTrainingDataset(id: string): Promise<{ success: boolean; report: any; dataset: any }> {
    const res = await fetch(`${BASE_URL}/training/datasets/${id}/audit`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to audit dataset');
    return res.json();
  },

  async getTrainingMappings(datasetId?: string): Promise<{ mappings: any[] }> {
    const url = datasetId ? `${BASE_URL}/training/mappings?datasetId=${encodeURIComponent(datasetId)}` : `${BASE_URL}/training/mappings`;
    const res = await fetch(url, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch mappings');
    return res.json();
  },

  async updateTrainingMapping(payload: {
    sourceDataset: string;
    sourceClass: string;
    sourceClassId: number;
    safeVisionClassId: string;
    mappingStatus?: string;
    mappingReason?: string;
  }): Promise<{ success: boolean; mapping: any }> {
    const res = await fetch(`${BASE_URL}/training/mappings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update mapping');
    return res.json();
  },

  async getTrainingModels(): Promise<{ models: any[]; activeModelId: string; total: number }> {
    const res = await fetch(`${BASE_URL}/training/models`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch models');
    return res.json();
  },

  async getActiveTrainingModel(): Promise<{
    activeModel: any;
    classManifest: any;
    baselinePreserved: boolean;
    baselineModelPath: string;
    baselineChecksum: string;
  }> {
    const res = await fetch(`${BASE_URL}/training/models/active`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch active model');
    return res.json();
  },

  async getTrainingJobs(): Promise<{ jobs: any[]; total: number }> {
    const res = await fetch(`${BASE_URL}/training/jobs`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch training jobs');
    return res.json();
  },

  async createTrainingJob(payload: {
    datasetId: string;
    baseModelId?: string;
    targetClasses?: string[];
    hyperparameters?: any;
  }): Promise<{ success?: boolean; message?: string; job?: any }> {
    const res = await fetch(`${BASE_URL}/training/jobs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err.error || err.detail || 'Training job request failed';
      const blockers = err.blockers ? `\nBlockers:\n- ${err.blockers.join('\n- ')}` : '';
      throw new Error(`${errorMsg}${blockers}`);
    }
    return res.json();
  },

  async getPipelineStatus(): Promise<any> {
    const res = await fetch(`${BASE_URL}/training/models/pipeline-status`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch pipeline status');
    return res.json();
  },

  async evaluateCandidate(payload: {
    candidateId: string;
    modelPath: string;
    datasetId: string;
    targetClassId: string;
    targetClassName?: string;
    thresholds?: any;
  }): Promise<{ success: boolean; evaluation: any }> {
    const res = await fetch(`${BASE_URL}/training/models/evaluate-candidate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to evaluate candidate');
    }
    return res.json();
  },

  async activateCandidateModel(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/training/models/${id}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || `Failed to activate candidate model '${id}'`);
    }
    return res.json();
  },

  async deactivateCandidateModel(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/training/models/${id}/deactivate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || `Failed to deactivate candidate model '${id}'`);
    }
    return res.json();
  },

  async rollbackToBaseline(): Promise<any> {
    const res = await fetch(`${BASE_URL}/training/models/rollback-baseline`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to rollback to baseline');
    }
    return res.json();
  },
};

