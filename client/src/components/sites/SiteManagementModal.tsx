import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Clock,
  Layers,
  Camera,
  MapPin,
  ArrowRight,
  ShieldAlert,
  Radio,
} from 'lucide-react';
import { useSite, SiteRecord } from '../../context/SiteContext';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const SiteManagementModal: React.FC = () => {
  const {
    sites,
    currentSite,
    isSiteModalOpen,
    siteModalMode,
    editingSite,
    openSiteModal,
    closeSiteModal,
    selectSite,
    refreshSites,
  } = useSite();

  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [industry, setIndustry] = useState('Heavy Manufacturing & Industrial');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync form when editingSite or mode changes
  useEffect(() => {
    if (siteModalMode === 'edit' && editingSite) {
      setCompanyName(editingSite.companyName || 'SafeVision Industrial');
      setName(editingSite.name || '');
      setCode(editingSite.code || '');
      setLocation(editingSite.location || '');
      setIndustry(editingSite.industry || 'Heavy Manufacturing & Industrial');
      setTimezone(editingSite.timezone || 'Asia/Kolkata');
      setStatus(editingSite.status || 'ACTIVE');
      setFormError(null);
    } else if (siteModalMode === 'add') {
      setCompanyName('SafeVision Industrial');
      setName('');
      setCode('');
      setLocation('');
      setIndustry('Heavy Manufacturing & Industrial');
      setTimezone('Asia/Kolkata');
      setStatus('ACTIVE');
      setFormError(null);
    }
  }, [siteModalMode, editingSite]);

  if (!isSiteModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Site Name is required.');
      return;
    }
    if (!code.trim()) {
      setFormError('Site Code is required.');
      return;
    }
    if (!location.trim()) {
      setFormError('Site Location/Address is required.');
      return;
    }

    const payload = {
      companyName: companyName.trim() || 'SafeVision Industrial',
      name: name.trim(),
      code: code.trim().toUpperCase(),
      location: location.trim(),
      industry: industry.trim(),
      timezone: timezone.trim(),
      status,
    };

    setIsSubmitting(true);
    try {
      if (siteModalMode === 'add') {
        const res = await api.createSite(payload);
        await refreshSites();
        if (res.site) {
          await selectSite(res.site.id || res.site.siteId || res.site.code);
        }
        openSiteModal('manage');
      } else if (siteModalMode === 'edit' && editingSite) {
        const targetId = editingSite.id || editingSite.siteId || editingSite.code;
        const res = await api.updateSite(targetId, payload);
        await refreshSites();
        if (res.site && currentSite?.id === targetId) {
          await selectSite(res.site.id || res.site.siteId || res.site.code);
        }
        openSiteModal('manage');
      }
    } catch (err: any) {
      setFormError(err.message || 'Operation failed. Please verify site code uniqueness.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (siteId: string) => {
    try {
      setIsSubmitting(true);
      await api.deleteSite(siteId);
      setDeleteConfirmId(null);
      await refreshSites();
    } catch (err: any) {
      setFormError(err.message || 'Failed to delete site.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="site-management-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono uppercase tracking-wide">
                {siteModalMode === 'add'
                  ? 'Add Company / Site'
                  : siteModalMode === 'edit'
                  ? `Edit Site: ${editingSite?.name}`
                  : 'Company & Site Management'}
              </h2>
              <p className="text-xs text-slate-400">
                {siteModalMode === 'manage'
                  ? 'Configure operational facilities, hazard zones, and regional camera scopes'
                  : 'Enter official corporate and plant details for real database persistence'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSiteModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {siteModalMode === 'manage' ? (
            /* ================= DIRECTORY VIEW ================= */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Configured Operational Sites ({sites.length})
                </span>
                {isAdmin && (
                  <button
                    onClick={() => openSiteModal('add')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    ADD COMPANY / SITE
                  </button>
                )}
              </div>

              {sites.length === 0 ? (
                /* Empty State */
                <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide">
                    NO SITES CONFIGURED
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No manufacturing plants or corporate facilities are currently registered.
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => openSiteModal('add')}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                    >
                      <Plus className="w-4 h-4" />
                      ADD SITE
                    </button>
                  )}
                </div>
              ) : (
                /* List of Sites */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sites.map((s) => {
                    const isActive =
                      currentSite?.id === s.id ||
                      currentSite?.siteId === s.siteId ||
                      currentSite?.code === s.code;

                    return (
                      <div
                        key={s.id || s.siteId || s.code}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                          isActive
                            ? 'bg-emerald-500/[0.04] border-emerald-500/40 shadow-sm'
                            : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-mono text-slate-400 block uppercase">
                                {s.companyName || 'SafeVision Industrial'}
                              </span>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
                                {s.name}
                                {isActive && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-mono font-bold uppercase">
                                    ACTIVE
                                  </span>
                                )}
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-mono text-[10px] font-bold">
                              {s.code}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            <span className="truncate">{s.location}</span>
                          </p>

                          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-[11px] font-mono">
                            <div className="flex items-center gap-1 text-slate-400">
                              <Layers className="w-3.5 h-3.5 text-amber-400" />
                              <span>{s.zoneCount ?? 0} zones</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400">
                              <Camera className="w-3.5 h-3.5 text-blue-400" />
                              <span>{s.cameraCount ?? 0} cameras</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400 col-span-2">
                              <Clock className="w-3.5 h-3.5 text-purple-400" />
                              <span>{s.timezone || 'Asia/Kolkata'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/5">
                          {!isActive ? (
                            <button
                              onClick={() => selectSite(s.id || s.siteId || s.code)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono transition"
                            >
                              Set as Active
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Current Active Site
                            </span>
                          )}

                          {isAdmin && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                onClick={() => openSiteModal('edit', s)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
                                title="Edit site details"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {s.code !== 'RSP-ZB-01' && s.id !== 'site-rsp-1' && (
                                deleteConfirmId === s.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(s.id || s.siteId || s.code)}
                                      disabled={isSubmitting}
                                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-mono transition"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="px-1.5 py-1 bg-white/5 hover:bg-white/10 text-slate-400 rounded text-[10px] font-mono transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(s.id || s.siteId || s.code)}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                                    title="Delete site"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ================= ADD / EDIT FORM VIEW ================= */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Company / Organization Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Steel Authority of India Limited"
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Site / Plant Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Durgapur Steel Plant"
                    required
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Site Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. DSP-PL-02"
                    required
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Industry Domain
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  >
                    <option value="Integrated Steel Manufacturing">Integrated Steel Manufacturing</option>
                    <option value="Heavy Manufacturing & Industrial">Heavy Manufacturing & Industrial</option>
                    <option value="Automotive Assembly">Automotive Assembly</option>
                    <option value="Chemical & Petrochemical Refining">Chemical & Petrochemical Refining</option>
                    <option value="Logistics & Maritime Freight">Logistics & Maritime Freight</option>
                    <option value="Pharmaceutical Manufacturing">Pharmaceutical Manufacturing</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Address / Plant Location <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Durgapur, West Bengal, India"
                    required
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Site Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full bg-[#181c24] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                    <option value="UTC">UTC (+00:00)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (+04:00)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (+09:00)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Operating Status
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-mono">
                      <input
                        type="radio"
                        name="siteStatus"
                        value="ACTIVE"
                        checked={status === 'ACTIVE'}
                        onChange={() => setStatus('ACTIVE')}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      Active Facility
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-mono">
                      <input
                        type="radio"
                        name="siteStatus"
                        value="INACTIVE"
                        checked={status === 'INACTIVE'}
                        onChange={() => setStatus('INACTIVE')}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      Standby / Inactive
                    </label>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => openSiteModal('manage')}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving to MongoDB...</span>
                    </>
                  ) : (
                    <span>{siteModalMode === 'add' ? 'Create Real Site' : 'Save Changes'}</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
