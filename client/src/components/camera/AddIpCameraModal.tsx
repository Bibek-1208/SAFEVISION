import React, { useState, useEffect } from 'react';
import {
  Camera,
  X,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  Globe,
  Layers,
} from 'lucide-react';
import { api } from '../../services/api';

interface AddIpCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCameraAdded: (camera: any) => void;
  zones?: Array<{ id: string; name: string; code: string }>;
}

export const AddIpCameraModal: React.FC<AddIpCameraModalProps> = ({
  isOpen,
  onClose,
  onCameraAdded,
  zones: propZones,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [zoneList, setZoneList] = useState<Array<{ id: string; name: string; code: string }>>(propZones || []);
  const [zone, setZone] = useState('');
  const [protocol, setProtocol] = useState<'RTSP' | 'HLS' | 'WebRTC'>('RTSP');
  const [streamUrl, setStreamUrl] = useState('');
  const [resolution, setResolution] = useState('1920x1080');

  useEffect(() => {
    if (propZones && propZones.length > 0) {
      setZoneList(propZones);
      if (!zone) setZone(propZones[0].name);
      return;
    }
    api.getZones()
      .then((res) => {
        if (res.zones && res.zones.length > 0) {
          const mapped = res.zones.map((z: any) => ({
            id: z.id || z._id,
            name: z.name,
            code: z.code || z.name.slice(0, 4).toUpperCase(),
          }));
          setZoneList(mapped);
          if (!zone) setZone(mapped[0].name);
        }
      })
      .catch((err) => console.error('Failed to load zones for AddIpCameraModal:', err));
  }, [propZones]);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    reachable: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateCamera, setDuplicateCamera] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReconnect = async () => {
    if (!duplicateCamera) return;
    setActionLoading('reconnecting');
    setFormError(null);
    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch(`/api/cameras/${duplicateCamera.code}/connect`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Reconnect request failed');
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      onClose();
    } catch (e: any) {
      setFormError(e.message || 'Reconnect failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    if (!duplicateCamera) return;
    setActionLoading('updating');
    setFormError(null);
    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch(`/api/cameras/${duplicateCamera.code}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim() || duplicateCamera.name,
          zone: zone || duplicateCamera.zone,
          streamUrl: streamUrl.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Update request failed');
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      onClose();
    } catch (e: any) {
      setFormError(e.message || 'Update failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisable = async () => {
    if (!duplicateCamera) return;
    setActionLoading('disabling');
    setFormError(null);
    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch(`/api/cameras/${duplicateCamera.code}/disconnect`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Disable request failed');
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      onClose();
    } catch (e: any) {
      setFormError(e.message || 'Disable failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async () => {
    if (!duplicateCamera) return;
    setActionLoading('removing');
    setFormError(null);
    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch(`/api/cameras/${duplicateCamera.code}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Remove request failed');
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      onClose();
    } catch (e: any) {
      setFormError(e.message || 'Remove failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestConnection = async () => {
    if (!streamUrl.trim()) {
      setFormError('Please enter a stream URL to test.');
      return;
    }

    setFormError(null);
    setIsTesting(true);
    setTestResult(null);

    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch('/api/cameras/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ streamUrl: streamUrl.trim(), protocol }),
      });

      const data = await res.json();
      setTestResult({
        tested: true,
        reachable: data.reachable,
        latencyMs: data.latencyMs,
        message: data.message,
      });
    } catch (err: any) {
      setTestResult({
        tested: true,
        reachable: false,
        message: `Network probe failed: ${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !zone.trim()) {
      setFormError('Please complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setDuplicateCamera(null);

    try {
      const token = localStorage.getItem('safevision_token');
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          zone,
          protocol,
          streamUrl: streamUrl.trim(),
          resolution,
          fps: 30,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409 || data.code === 'CAMERA_ALREADY_EXISTS') {
          setDuplicateCamera(data.camera || { code: code.trim().toUpperCase(), name: name.trim() });
          setFormError('Camera already configured. You can edit, reconnect, disable, or remove this camera.');
          return;
        }
        throw new Error(data.error || 'Failed to add camera.');
      }

      const { camera } = await res.json();
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      onCameraAdded(camera);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register camera stream.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 select-none">
      <div className="bg-[#141720] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 px-6 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono tracking-wide text-white uppercase">
                ATTACH INDUSTRIAL IP / CCTV CAMERA
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Connect real RTSP/HLS factory camera feed to live AI detection pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {duplicateCamera && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3 font-mono text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-bold">Camera already configured: {duplicateCamera.code} ({duplicateCamera.name})</span>
              </div>
              <p className="text-[11px] text-slate-300">
                This camera code is already registered in MongoDB. Choose an action below:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReconnect}
                  disabled={Boolean(actionLoading)}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition text-[11px]"
                >
                  {actionLoading === 'reconnecting' ? 'Reconnecting...' : 'Reconnect'}
                </button>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={Boolean(actionLoading)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition text-[11px]"
                >
                  {actionLoading === 'updating' ? 'Updating...' : 'Edit / Update'}
                </button>
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={Boolean(actionLoading)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-amber-400 rounded-lg transition text-[11px]"
                >
                  {actionLoading === 'disabling' ? 'Disabling...' : 'Disable'}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={Boolean(actionLoading)}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 rounded-lg transition text-[11px]"
                >
                  {actionLoading === 'removing' ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          )}

          {formError && !duplicateCamera && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-red-400 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                Camera Code *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. CAM-05"
                required
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                Camera Name / Label *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Secondary Furnace Deck"
                required
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                Monitored Hazard Zone *
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              >
                {zoneList.map((z) => (
                  <option key={z.id} value={z.name}>
                    {z.name} ({z.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                Protocol & Egress *
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              >
                <option value="RTSP">RTSP (Real-Time Streaming Protocol)</option>
                <option value="HLS">HLS (HTTP Live Streaming)</option>
                <option value="WebRTC">WebRTC (WHEP Gateway)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Stream URI / Endpoint *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder={
                  protocol === 'RTSP'
                    ? 'rtsp://192.168.1.120:554/live/stream1'
                    : protocol === 'HLS'
                    ? 'http://192.168.1.120:8888/cam/index.m3u8'
                    : 'http://localhost:8889/cam/whep'
                }
                className="flex-1 bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition shrink-0"
              >
                {isTesting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Probe Endpoint</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono mt-1">
              Supports standard RTSP streams from Axis, Dahua, Hikvision, Hanwha or MediaMTX gateway
            </p>
          </div>

          {/* Test Probe Result Card */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2.5 ${
                testResult.reachable
                  ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300'
                  : 'bg-red-950/30 border-red-900/60 text-red-300'
              }`}
            >
              {testResult.reachable ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {testResult.reachable ? 'HOST REACHABLE' : 'HOST UNREACHABLE'}
                  </span>
                  {testResult.latencyMs !== undefined && (
                    <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                      {testResult.latencyMs}ms Latency
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-4 border-t border-white/10 flex justify-end gap-3 font-mono text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Configuring...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Register & Connect Stream</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
