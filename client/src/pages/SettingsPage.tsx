import React, { useState } from 'react';
import {
  User,
  Bell,
  Key,
  Shield,
  CheckCircle2,
  Sliders,
  Smartphone,
  Mail,
  Phone,
  Building2,
  Clock,
  Save,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'notifications' | 'api' | 'security'>('personal');
  const [savedMessage, setSavedMessage] = useState(false);

  // Form states
  const [name, setName] = useState(user?.name || 'Bibek Kumar');
  const [email, setEmail] = useState(user?.email || 'bibek@safevision.ai');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [department, setDepartment] = useState('Safety & Compliance');
  const [shift, setShift] = useState('06:00 - 14:00 (Day Shift)');
  const [location, setLocation] = useState('Rourkela Steel Plant');

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [sirenActive, setSirenActive] = useState(true);
  const [mobilePush, setMobilePush] = useState(true);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto text-gray-100 text-left">
      {/* Header */}
      <div className="bg-[#181818] border border-[#2B2B2B] p-4 rounded-xl flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold font-mono text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-safe" />
            SYSTEM & OPERATOR SETTINGS
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            Configure telemetry notification channels, API access, and user credentials
          </p>
        </div>

        {savedMessage && (
          <span className="text-xs font-mono text-safe bg-safe/20 px-3 py-1 rounded border border-safe flex items-center gap-1.5 animate-pulse">
            <CheckCircle2 className="w-4 h-4" />
            Settings Updated Successfully
          </span>
        )}
      </div>

      {/* Settings Panel with Tabs (Matching Image 2 D) */}
      <div className="hud-panel rounded-xl border border-[#2B2B2B] overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-[#2A2A2A] bg-[#161616] text-xs font-mono">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-5 py-3 font-bold transition flex items-center gap-2 ${
              activeTab === 'personal'
                ? 'text-safe border-b-2 border-safe bg-[#1E1E1E]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Personal Info
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-5 py-3 font-bold transition flex items-center gap-2 ${
              activeTab === 'notifications'
                ? 'text-safe border-b-2 border-safe bg-[#1E1E1E]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-5 py-3 font-bold transition flex items-center gap-2 ${
              activeTab === 'api'
                ? 'text-safe border-b-2 border-safe bg-[#1E1E1E]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            API Keys & Webhooks
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-5 py-3 font-bold transition flex items-center gap-2 ${
              activeTab === 'security'
                ? 'text-safe border-b-2 border-safe bg-[#1E1E1E]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Security
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* 1. Personal Info Tab (Matching Image 2 D) */}
          {activeTab === 'personal' && (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Profile Avatar Header */}
              <div className="flex items-center gap-5 pb-6 border-b border-[#282828]">
                <div className="w-16 h-16 rounded-full bg-safe/20 border-2 border-safe flex items-center justify-center font-mono font-extrabold text-xl text-safe shadow-glow-safe">
                  BK
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">{name}</h3>
                  <p className="text-xs text-gray-400 font-mono">Plant Safety Officer • Tier 4 EHS Inspector</p>
                  <button
                    type="button"
                    onClick={() => alert('Photo updated')}
                    className="mt-1.5 text-[11px] font-mono text-safe hover:underline"
                  >
                    Change Photo
                  </button>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <label className="block text-gray-400 mb-1">FULL OPERATOR NAME</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">CORP EMAIL ADDRESS</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">DEPARTMENT / DIVISION</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">PHONE NUMBER (EMERGENCY SMS)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">ACTIVE SHIFT ASSIGNMENT</label>
                  <input
                    type="text"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">PLANT LOCATION</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-white outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#282828] flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-safe hover:bg-safe-light text-black font-mono font-bold text-xs rounded-lg transition shadow-glow-safe flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* 2. Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 text-xs font-mono">
              <h3 className="text-sm font-bold text-white mb-2">
                Emergency Alert Escalation Channels
              </h3>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg border border-[#2A2A2A] bg-[#181818]">
                  <div>
                    <p className="font-bold text-white">Email Incident Digests</p>
                    <p className="text-[11px] text-gray-400">Receive shift summaries and critical breach reports</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="accent-safe w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-[#2A2A2A] bg-[#181818]">
                  <div>
                    <p className="font-bold text-white">Mobile Push Notifications</p>
                    <p className="text-[11px] text-gray-400">Push instant critical alerts to field ops mobile app</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={mobilePush}
                    onChange={(e) => setMobilePush(e.target.checked)}
                    className="accent-safe w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-[#2A2A2A] bg-[#181818]">
                  <div>
                    <p className="font-bold text-white">SMS Steward Dispatch</p>
                    <p className="text-[11px] text-gray-400">Send direct SMS dispatch coordinates to area stewards</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={smsAlerts}
                    onChange={(e) => setSmsAlerts(e.target.checked)}
                    className="accent-safe w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-critical/40 bg-[#1A1214]">
                  <div>
                    <p className="font-bold text-critical">Automated Acoustic Bay Horn Interlock</p>
                    <p className="text-[11px] text-gray-400">Sound 110dB sirens for crane swing violations & fire events</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={sirenActive}
                    onChange={(e) => setSirenActive(e.target.checked)}
                    className="accent-critical w-4 h-4"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 3. API Keys Tab */}
          {activeTab === 'api' && (
            <div className="space-y-4 text-xs font-mono">
              <h3 className="text-sm font-bold text-white mb-2">
                SCADA & Industrial Edge API Keys
              </h3>
              <div className="p-4 bg-[#181818] border border-[#2A2A2A] rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">PRIMARY TELEMETRY KEY</span>
                  <span className="text-safe font-bold">ACTIVE (READ/WRITE)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="sv_live_9f8d9a2c3b4e5f6a7b8c9d0e1f2a3b4c"
                    className="w-full bg-[#121212] border border-[#333] rounded px-3 py-2 text-gray-300 font-mono text-xs"
                  />
                  <button
                    onClick={() => alert('API Key copied to clipboard')}
                    className="px-3 py-2 bg-[#252525] hover:bg-[#303030] text-gray-200 rounded font-bold"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">
                  Used by YOLO inference edge nodes to publish detection frames to POST /api/detection/frame.
                </p>
              </div>
            </div>
          )}

          {/* 4. Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-4 text-xs font-mono">
              <h3 className="text-sm font-bold text-white mb-2">
                Access Security & Two-Factor Authentication
              </h3>
              <div className="p-4 bg-[#181818] border border-[#2A2A2A] rounded-lg space-y-3">
                <p className="text-gray-300 font-bold">SESSION AUTHENTICATION: JWT (7 Days Expiry)</p>
                <p className="text-gray-400 text-[11px]">
                  All cryptographic requests require authorization bearer tokens verified against ISO 27001 plant protocols.
                </p>
                <button
                  onClick={() => alert('All other operator sessions invalidated.')}
                  className="px-4 py-2 bg-critical/20 hover:bg-critical/30 border border-critical/40 text-critical rounded font-bold transition"
                >
                  Revoke All Active Sessions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
