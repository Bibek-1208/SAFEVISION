import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Camera as CameraIcon,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  ShieldAlert,
  Plus,
} from 'lucide-react';
import { api } from '../services/api';
import { useSite } from '../context/SiteContext';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { sites, currentSite, openSiteModal } = useSite();
  const [step, setStep] = useState(1);
  const [siteLocation, setSiteLocation] = useState(currentSite?.name || 'Rourkela Steel Plant');
  const [siteCode, setSiteCode] = useState(currentSite?.code || 'RSP-ZB-01');
  const [dbCameras, setDbCameras] = useState<any[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);

  // Sync with currentSite if available
  React.useEffect(() => {
    if (currentSite) {
      setSiteLocation(currentSite.name);
      setSiteCode(currentSite.code);
    }
  }, [currentSite]);

  React.useEffect(() => {
    api.getCameras().then((res) => {
      const cams = Array.isArray(res?.cameras) ? res.cameras : [];
      setDbCameras(cams);
      setSelectedCameras(cams.map((c: any) => c.code || c.id));
    }).catch(() => {
      setDbCameras([]);
      setSelectedCameras([]);
    });
  }, []);
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [dwellTolerance, setDwellTolerance] = useState(3.0);
  const [mandatedPPE, setMandatedPPE] = useState({
    helmet: true,
    vest: true,
    footwear: true,
    gloves: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleCameraToggle = (code: string) => {
    setSelectedCameras((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await api.submitOnboarding({
        siteLocation,
        siteCode,
        selectedCameras,
        thresholds: {
          confidenceThreshold,
          dwellTolerance,
          mandatedPPE,
        },
      });
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      navigate('/dashboard');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      {/* Modal Card (Matching Image 2 B) */}
      <div className="bg-[#1C1C1C] border border-[#2E2E2E] rounded-xl max-w-xl w-full p-6 shadow-2xl relative text-left">
        <button
          onClick={() => navigate('/dashboard')}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Stepper Header */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-white">Site Configuration</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            Set up your plant monitoring system and neural telemetry
          </p>

          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                  step >= 1
                    ? 'bg-safe text-black'
                    : 'bg-[#2A2A2A] text-gray-400'
                }`}
              >
                1
              </span>
              <span className={`text-xs font-mono ${step === 1 ? 'text-safe font-bold' : 'text-gray-400'}`}>
                Define Site
              </span>
            </div>

            <div className="w-8 h-px bg-[#333]" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                  step >= 2
                    ? 'bg-safe text-black'
                    : 'bg-[#2A2A2A] text-gray-400'
                }`}
              >
                2
              </span>
              <span className={`text-xs font-mono ${step === 2 ? 'text-safe font-bold' : 'text-gray-400'}`}>
                Select Cameras
              </span>
            </div>

            <div className="w-8 h-px bg-[#333]" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                  step >= 3
                    ? 'bg-safe text-black'
                    : 'bg-[#2A2A2A] text-gray-400'
                }`}
              >
                3
              </span>
              <span className={`text-xs font-mono ${step === 3 ? 'text-safe font-bold' : 'text-gray-400'}`}>
                Set Thresholds
              </span>
            </div>
          </div>
        </div>

        {/* Step 1: Define Site */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-200 border-b border-[#2A2A2A] pb-2">
              1. Define Your Site
            </h3>
            <p className="text-xs text-gray-400">
              Select the manufacturing plant location you want to monitor:
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-mono text-gray-400">
                  Site Location
                </label>
                <button
                  type="button"
                  onClick={() => openSiteModal('add')}
                  className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> + New Site
                </button>
              </div>
              <select
                value={siteLocation}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__ADD_NEW__') {
                    openSiteModal('add');
                    return;
                  }
                  setSiteLocation(val);
                  const matched = sites.find((s) => s.name === val);
                  if (matched) {
                    setSiteCode(matched.code);
                  }
                }}
                className="w-full bg-[#161616] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
              >
                {sites.map((s) => (
                  <option key={s.id || s.siteId} value={s.name}>
                    {s.name} ({s.code})
                  </option>
                ))}
                <option value="__ADD_NEW__">+ Register Another Site...</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">
                Site Code
              </label>
              <input
                type="text"
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
                className="w-full bg-[#161616] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
              />
            </div>

            {/* Visual preview of plant */}
            <div className="rounded-lg overflow-hidden border border-[#2E2E2E] relative h-36 bg-gradient-to-r from-[#18110D] via-[#2A1D16] to-[#141414] p-4 flex items-end">
              <div className="relative z-10">
                <span className="text-[10px] font-mono font-bold bg-safe/20 text-safe px-2 py-0.5 rounded">
                  {siteCode}
                </span>
                <p className="text-sm font-bold text-white mt-1">{siteLocation}</p>
                <p className="text-[11px] text-gray-400 font-mono">
                  {(() => {
                    const matched = sites.find((s) => s.name === siteLocation || s.code === siteCode);
                    const count = matched?.zoneCount ?? (currentSite?.zoneCount ?? 0);
                    return `${count} Designated Industrial Hazard Zones Registered`;
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Cameras */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-200 border-b border-[#2A2A2A] pb-2">
              2. Select Surveillance Cameras
            </h3>
            <p className="text-xs text-gray-400">
              Select the CCTV streams to connect to the YOLO inference pipeline:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {dbCameras.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#181818] border border-[#2A2A2A] text-center text-xs text-gray-400 font-mono">
                  No physical CCTV streams registered in database yet.
                  <div className="text-[10px] text-gray-500 mt-1">
                    Streams can be attached directly via "Attach IP / CCTV" in the Surveillance Feeds matrix.
                  </div>
                </div>
              ) : (
                dbCameras.map((c: any) => {
                  const camCode = c.code || c.id;
                  return (
                    <label
                      key={camCode}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition ${
                        selectedCameras.includes(camCode)
                          ? 'bg-safe/10 border-safe/50 text-white'
                          : 'bg-[#181818] border-[#2A2A2A] text-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedCameras.includes(camCode)}
                          onChange={() => handleCameraToggle(camCode)}
                          className="accent-safe w-4 h-4 rounded"
                        />
                        <div>
                          <p className="text-xs font-mono font-bold">{camCode}: {c.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{c.zone || 'Unassigned Zone'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-safe font-bold">{c.protocol || 'RTSP'}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Step 3: Set Thresholds */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-200 border-b border-[#2A2A2A] pb-2">
              3. Set Safety & Alarm Thresholds
            </h3>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-gray-400">AI Confidence Trigger Level</span>
                <span className="text-safe font-bold">{confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min={75}
                max={99}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                className="w-full accent-safe"
              />
              <span className="text-[10px] text-gray-500 font-mono">
                Only violations above {confidenceThreshold}% confidence will sound bay horns.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-gray-400">Restricted Zone Dwell Tolerance</span>
                <span className="text-warning font-bold">{dwellTolerance} seconds</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={10.0}
                step={0.5}
                value={dwellTolerance}
                onChange={(e) => setDwellTolerance(Number(e.target.value))}
                className="w-full accent-warning"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2 font-bold">
                MANDATED PPE COMPLIANCE CHECKS
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {Object.entries(mandatedPPE).map(([key, val]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-2 bg-[#181818] border border-[#2A2A2A] rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) =>
                        setMandatedPPE({ ...mandatedPPE, [key]: e.target.checked })
                      }
                      className="accent-safe"
                    />
                    <span className="capitalize">{key}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-6 mt-6 border-t border-[#262626]">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#252525] hover:bg-[#303030] text-gray-300 rounded text-xs font-mono font-medium transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-[#252525] hover:bg-[#303030] text-gray-300 rounded text-xs font-mono font-medium transition"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-5 py-2 bg-safe hover:bg-safe-light text-black rounded text-xs font-mono font-bold transition shadow-glow-safe"
            >
              Continue
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-safe hover:bg-safe-light text-black rounded text-xs font-mono font-bold transition shadow-glow-safe"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSaving ? 'Configuring Plant...' : 'Deploy Telemetry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
