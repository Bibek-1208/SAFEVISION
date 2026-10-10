import React, { useState, useEffect } from 'react';
import { Camera, X, Check, Save } from 'lucide-react';
import { api } from '../../services/api';
import { Camera as CameraType } from '../../types';

interface EditCameraModalProps {
  isOpen: boolean;
  camera: CameraType | null;
  onClose: () => void;
  onSaved: (updatedCam: CameraType) => void;
  zones?: string[];
}

export const EditCameraModal: React.FC<EditCameraModalProps> = ({
  isOpen,
  camera,
  onClose,
  onSaved,
  zones = [],
}) => {
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [resolution, setResolution] = useState('1920x1080');
  const [fps, setFps] = useState(20);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (camera) {
      setName(camera.name || '');
      setZone(camera.zone || '');
      setStreamUrl(camera.streamUrl || '');
      setResolution(camera.resolution || '1920x1080');
      setFps(camera.fps || 20);
      setEnabled(camera.enabled !== false);
      setError(null);
    }
  }, [camera]);

  if (!isOpen || !camera) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Camera name is required');
      return;
    }
    if (!zone.trim()) {
      setError('Zone is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await api.updateCamera(camera.code || camera.id, {
        name: name.trim(),
        zone: zone.trim(),
        streamUrl: streamUrl.trim(),
        resolution,
        fps: Number(fps),
        enabled,
      });

      if (res.camera) {
        onSaved(res.camera);
        onClose();
      } else {
        throw new Error('Server returned empty camera update response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update camera');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none font-mono">
      <div className="bg-[#141720] border border-white/15 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                EDIT CAMERA SETTINGS
              </h3>
              <p className="text-[11px] text-slate-400">
                Identifier: <strong className="text-emerald-400">{camera.code}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-500/60 rounded-xl p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Camera Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-white outline-none"
              placeholder="e.g. Bay 4 Overhead Telemetry"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Assigned Zone</label>
            <input
              type="text"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              list="zones-list"
              className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-white outline-none"
              placeholder="e.g. Zone B - Heavy Machinery"
              required
            />
            <datalist id="zones-list">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Stream Endpoint URL (RTSP / HTTP / WebRTC)</label>
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-white outline-none font-mono text-[11px]"
              placeholder="rtsp://192.168.1.100:554/live/stream1"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Stream endpoints with credentials will be masked in responses for security.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Target Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-white outline-none"
              >
                <option value="1920x1080">1080p (1920x1080)</option>
                <option value="1280x720">720p (1280x720)</option>
                <option value="640x480">VGA (640x480)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Target FPS</label>
              <input
                type="number"
                min={1}
                max={60}
                value={fps}
                onChange={(e) => setFps(parseInt(e.target.value, 10) || 20)}
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-white outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span className="text-slate-300">Camera Enabled for Live Surveillance</span>
            </label>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
