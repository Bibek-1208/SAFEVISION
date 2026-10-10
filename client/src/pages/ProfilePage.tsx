import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  Award,
  Clock,
  Building2,
  FileCheck,
  LogOut,
  Edit2,
  CheckCircle2,
  AlertCircle,
  HardHat,
  Save,
  Key,
  Camera as CameraIcon,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const ProfilePage: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    department: user?.department || '',
    shift: user?.shift || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile photo upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Please select a valid image file (JPEG, PNG, or WebP).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Profile photo size must be less than 5MB.' });
      return;
    }

    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) return;
    setIsUploadingAvatar(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const res = await api.uploadAvatar(formData);
      if (res.user) {
        updateUser(res.user);
        setMessage({ type: 'success', text: 'Profile photo successfully updated and synced across all consoles.' });
        setAvatarFile(null);
        setAvatarPreview(null);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to upload profile photo.' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCancelAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await api.updateMyProfile(formData);
      if (res.user) {
        updateUser(res.user);
        setMessage({ type: 'success', text: 'Profile successfully updated and saved to corporate directory.' });
        setIsEditing(false);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 text-gray-100 text-left animate-fadeIn">
      {/* Profile Card Header */}
      <div className="bg-[#12151b] p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-xl">
        <div className="relative group flex flex-col items-center">
          <div className="w-24 h-24 rounded-2xl bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center font-mono font-extrabold text-2xl text-blue-400 overflow-hidden shadow-md relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
            ) : user?.photoURL ? (
              <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span>{user ? user.name.charAt(0).toUpperCase() : 'U'}</span>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[10px] font-mono text-white"
              title="Change Profile Photo"
            >
              <CameraIcon className="w-5 h-5 text-emerald-400" />
              <span>Change</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarSelect}
            className="hidden"
          />

          {avatarFile && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={handleUploadAvatar}
                disabled={isUploadingAvatar}
                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-mono font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-1 shadow-sm"
              >
                {isUploadingAvatar ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handleCancelAvatar}
                disabled={isUploadingAvatar}
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] font-mono rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="space-y-1 text-center sm:text-left flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h1 className="text-2xl font-bold font-mono text-white">{user?.name}</h1>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 w-fit mx-auto sm:mx-0">
              ROLE: {user?.role}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">{user?.email}</p>
          <p className="text-xs text-slate-300 font-mono pt-1">
            Department: <span className="text-white font-bold">{user?.department}</span> • Shift:{' '}
            <span className="text-amber-400 font-bold">{user?.shift}</span>
          </p>
          <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
            <span>Sites: {user?.siteIds?.join(', ')}</span>
            <span>•</span>
            <span>Authorized Zones: {user?.zoneIds?.includes('*') ? 'All Plant Zones (*)' : user?.zoneIds?.join(', ')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => {
              setFormData({
                name: user?.name || '',
                department: user?.department || '',
                shift: user?.shift || '',
              });
              setIsEditing(!isEditing);
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-mono font-bold rounded-xl transition flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" />
            {isEditing ? 'Cancel Edit' : 'Edit Profile'}
          </button>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold rounded-xl transition flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-mono ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Edit Profile Form */}
      {isEditing && (
        <div className="bg-[#12151b] p-6 rounded-2xl border border-white/10 space-y-4 animate-fadeIn">
          <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-blue-400" />
            Edit Operational Details
          </h3>
          <form onSubmit={handleSave} className="space-y-4 text-xs font-mono">
            <div>
              <label className="block text-slate-400 mb-1">Full Legal / Operator Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Assigned Shift Schedule</label>
                <input
                  type="text"
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Permissions Breakdown */}
      <div className="bg-[#12151b] p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          Cryptographically Authorized RBAC Permissions ({user?.permissions?.length || 0})
        </h3>
        <div className="flex flex-wrap gap-2">
          {user?.permissions?.map((perm, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/5 text-slate-300 border border-white/10"
            >
              {perm}
            </span>
          ))}
        </div>
      </div>

      {/* Certifications & Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
        <div className="bg-[#12151b] p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-bold">DGFASLI ACCREDITED</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            License #IND-EHS-2024-8902 valid for heavy metallurgical & blast furnace sites.
          </p>
        </div>

        <div className="bg-[#12151b] p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <Award className="w-4 h-4" />
            <span className="font-bold">OSHA 30-HOUR GENERAL</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Certified industrial hygiene & hazardous area transit supervisor.
          </p>
        </div>

        <div className="bg-[#12151b] p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <FileCheck className="w-4 h-4" />
            <span className="font-bold">ISO 45001 LEAD AUDITOR</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Authorized to generate and electronically sign official statutory compliance filings.
          </p>
        </div>
      </div>
    </div>
  );
};
