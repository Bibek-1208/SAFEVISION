import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Loader2,
  AlertTriangle,
  Video,
  Users,
  Shield,
  MapPin,
  Clock,
  Building2,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../services/api';

interface SearchResultItem {
  id: string;
  entityType: string;
  title: string;
  subtitle: string;
  badge?: string;
  url: string;
  violationType?: string;
  camera?: string;
  zone?: string;
  timestamp?: string;
  confidence?: number;
  severity?: string;
  trackId?: string;
  status?: string;
}

interface CategoriesMap {
  incidents: SearchResultItem[];
  cameras: SearchResultItem[];
  workers: SearchResultItem[];
  rules: SearchResultItem[];
  zones: SearchResultItem[];
  shifts: SearchResultItem[];
  sites: SearchResultItem[];
}

const CATEGORY_CONFIG: Record<
  keyof CategoriesMap,
  { label: string; icon: React.FC<{ className?: string }>; color: string }
> = {
  incidents: {
    label: 'INCIDENTS',
    icon: AlertTriangle,
    color: 'text-amber-400',
  },
  cameras: {
    label: 'CAMERAS',
    icon: Video,
    color: 'text-cyan-400',
  },
  sites: {
    label: 'SITES',
    icon: Building2,
    color: 'text-indigo-400',
  },
  workers: {
    label: 'PERSONNEL',
    icon: Users,
    color: 'text-emerald-400',
  },
  zones: {
    label: 'ZONES',
    icon: MapPin,
    color: 'text-rose-400',
  },
  rules: {
    label: 'SAFETY RULES',
    icon: Shield,
    color: 'text-purple-400',
  },
  shifts: {
    label: 'SHIFTS',
    icon: Clock,
    color: 'text-blue-400',
  },
};

const CATEGORY_ORDER: Array<keyof CategoriesMap> = [
  'incidents',
  'cameras',
  'sites',
  'workers',
  'zones',
  'rules',
  'shifts',
];

export const GlobalSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoriesMap | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Active categories containing results
  const activeCategories = categories
    ? CATEGORY_ORDER.filter(
        (key) => categories[key] && categories[key].length > 0
      )
    : [];

  // Flattened results for keyboard navigation
  const flattenedItems: Array<{ item: SearchResultItem; category: keyof CategoriesMap }> = [];
  if (categories) {
    for (const cat of activeCategories) {
      for (const item of categories[cat]) {
        flattenedItems.push({ item, category: cat });
      }
    }
  }

  // Global hotkeys (Ctrl+K, Cmd+K, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query (kept per requirement 10)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCategories(null);
      setTotalResults(0);
      setIsLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await api.globalSearch(trimmed);
        setCategories(res.categories as CategoriesMap);
        setTotalResults(res.totalResults);
        setError(null);
        setSelectedIndex(res.totalResults > 0 ? 0 : -1);
      } catch (err: any) {
        console.error('Global search error:', err);
        setError(err.message || 'Failed to execute global search query');
        setCategories(null);
        setTotalResults(0);
        setSelectedIndex(-1);
      } finally {
        setIsLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation inside input (ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flattenedItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % flattenedItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flattenedItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + flattenedItems.length) % flattenedItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < flattenedItems.length) {
        handleSelect(flattenedItems[selectedIndex].item.url);
      } else if (query.trim().length >= 2) {
        handleSelect(`/incidents?search=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (url: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(url);
  };

  const handleClear = () => {
    setQuery('');
    setCategories(null);
    setTotalResults(0);
    setError(null);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  let globalIndexTracker = 0;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md mx-4">
      {/* Search Input Box */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search... (Incident, Camera, Site, Worker, Rule)"
          className="w-full bg-[#141720] border border-white/10 hover:border-white/20 focus:border-emerald-500/80 focus:bg-[#181c26] rounded-xl pl-9 pr-14 py-2 text-xs text-gray-100 placeholder-slate-400 font-mono outline-none transition-all shadow-inner"
        />

        <div className="absolute right-2.5 top-2 flex items-center gap-1.5">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          ) : query ? (
            <button
              onClick={handleClear}
              className="text-slate-400 hover:text-white p-0.5 rounded transition"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block text-[10px] bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded font-mono">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      {/* Professional Search Command Panel (Section 2 - 400-520px responsive, no horizontal scroll) */}
      {isOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-2 w-[460px] sm:w-[500px] max-w-[calc(100vw-2rem)] bg-[#0d1017] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn backdrop-blur-xl"
          style={{ minWidth: '380px' }}
        >
          {/* Header Bar */}
          <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-300">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold tracking-wider text-white">SAFEVISION SEARCH</span>
            </div>
            <span className="text-[10px] text-slate-400">
              {isLoading
                ? 'SEARCHING...'
                : totalResults > 0
                ? `${totalResults} RESULT${totalResults === 1 ? '' : 'S'}`
                : query.trim().length >= 2
                ? '0 RESULTS'
                : 'COMMAND SEARCH'}
            </span>
          </div>

          {/* Results Container (strictly overflow-x-hidden, no horizontal scrollbar) */}
          <div
            ref={listRef}
            className="max-h-[440px] overflow-y-auto overflow-x-hidden p-2 space-y-3 divide-y divide-white/5"
          >
            {/* Error Message */}
            {error && (
              <div className="p-4 text-center space-y-1">
                <AlertTriangle className="w-5 h-5 text-rose-400 mx-auto" />
                <p className="text-xs text-rose-300 font-mono">{error}</p>
                <p className="text-[10px] text-slate-500">Ensure backend connectivity to database</p>
              </div>
            )}

            {/* Prompt to type at least 2 chars */}
            {!error && query.trim().length < 2 && (
              <div className="py-6 px-4 text-center text-slate-400 font-mono text-xs space-y-1">
                <p className="text-slate-200 font-semibold">Search authoritative plant records</p>
                <p className="text-[11px] text-slate-400">
                  Type an incident, camera code (CAM-04), site (Rourkela), or safety rule...
                </p>
              </div>
            )}

            {/* Loading State (Requirement 9: Do not show stale results as current) */}
            {!error && isLoading && (
              <div className="py-8 text-center space-y-2 font-mono">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                <p className="text-xs text-emerald-300 font-bold tracking-wider">SEARCHING...</p>
                <p className="text-[11px] text-slate-400">Querying authoritative plant intelligence</p>
              </div>
            )}

            {/* Empty State (Requirement 8) */}
            {!error && !isLoading && query.trim().length >= 2 && totalResults === 0 && (
              <div className="py-8 px-6 text-center space-y-2 font-mono">
                <p className="text-xs font-bold text-slate-200 tracking-wider">NO RESULTS FOUND</p>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-sm mx-auto">
                  No matching incidents, cameras, personnel, sites, zones, or rules found for &ldquo;<span className="text-amber-300">{query.trim()}</span>&rdquo;.
                </p>
              </div>
            )}

            {/* Categorized Results (Requirement 2 & 7: Group results by actual entity type) */}
            {!error &&
              !isLoading &&
              activeCategories.map((catKey) => {
                const items = categories![catKey];
                const config = CATEGORY_CONFIG[catKey];
                const IconComponent = config.icon;

                return (
                  <div key={catKey} className="pt-2 first:pt-0">
                    {/* Category Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                      <div className="flex items-center gap-1.5">
                        <IconComponent className={`w-3.5 h-3.5 ${config.color}`} />
                        <span>{config.label} · {items.length}</span>
                      </div>
                    </div>

                    {/* Result Items */}
                    <div className="mt-1 space-y-1">
                      {items.map((item) => {
                        const currentIndex = globalIndexTracker++;
                        const isSelected = currentIndex === selectedIndex;

                        if (catKey === 'incidents') {
                          // Professional Incident Result Card (Section 2 & 5)
                          const confVal =
                            item.confidence !== undefined
                              ? Number(item.confidence) > 1
                                ? Number(item.confidence).toFixed(1)
                                : (Number(item.confidence) * 100).toFixed(1)
                              : null;

                          let formattedDate = '';
                          if (item.timestamp) {
                            const d = new Date(item.timestamp);
                            formattedDate =
                              d.toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              }) +
                              ' · ' +
                              d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          }

                          return (
                            <div
                              key={`${catKey}-${item.id}`}
                              data-index={currentIndex}
                              onClick={() => handleSelect(item.url)}
                              onMouseEnter={() => setSelectedIndex(currentIndex)}
                              className={`px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                                isSelected
                                  ? 'bg-white/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-white font-mono truncate">
                                    {item.violationType || item.title}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                    {item.zone && item.camera
                                      ? `${item.zone} · ${item.camera}`
                                      : item.subtitle}
                                  </p>
                                  {formattedDate && (
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                                      {formattedDate}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                  {item.badge && (
                                    <span
                                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                        item.badge === 'CRITICAL' || item.badge === 'critical'
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                          : item.badge === 'HIGH' || item.badge === 'high'
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      }`}
                                    >
                                      {item.badge}
                                    </span>
                                  )}
                                  {confVal && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                                      {confVal}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (catKey === 'cameras') {
                          // Professional Camera Result Card (Section 2)
                          return (
                            <div
                              key={`${catKey}-${item.id}`}
                              data-index={currentIndex}
                              onClick={() => handleSelect(item.url)}
                              onMouseEnter={() => setSelectedIndex(currentIndex)}
                              className={`px-3 py-2 rounded-xl cursor-pointer transition-all border ${
                                isSelected
                                  ? 'bg-white/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-white font-mono truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono truncate">
                                    {item.subtitle}
                                  </p>
                                </div>
                                {item.badge && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase shrink-0">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (catKey === 'sites') {
                          // Professional Site Result Card (Section 2)
                          return (
                            <div
                              key={`${catKey}-${item.id}`}
                              data-index={currentIndex}
                              onClick={() => handleSelect(item.url)}
                              onMouseEnter={() => setSelectedIndex(currentIndex)}
                              className={`px-3 py-2 rounded-xl cursor-pointer transition-all border ${
                                isSelected
                                  ? 'bg-white/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-white font-mono truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono truncate">
                                    {item.subtitle}
                                  </p>
                                </div>
                                {item.badge && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 uppercase shrink-0">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Default Generic Result Card (Workers, Rules, Zones, Shifts)
                        return (
                          <div
                            key={`${catKey}-${item.id}`}
                            data-index={currentIndex}
                            onClick={() => handleSelect(item.url)}
                            onMouseEnter={() => setSelectedIndex(currentIndex)}
                            className={`px-3 py-2 rounded-xl cursor-pointer transition-all border ${
                              isSelected
                                ? 'bg-white/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                : 'hover:bg-white/5 border-transparent'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-white font-mono truncate">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono truncate">
                                  {item.subtitle}
                                </p>
                              </div>
                              {item.badge && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 uppercase shrink-0">
                                  {item.badge}
                                </span>
                              )}
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* View All Results (Section 13) */}
          {!error && !isLoading && totalResults > 0 && (
            <div className="p-2 border-t border-white/5 bg-white/[0.01]">
              <button
                onClick={() =>
                  handleSelect(`/incidents?search=${encodeURIComponent(query.trim())}`)
                }
                className="w-full py-1.5 px-3 text-left text-xs font-mono text-emerald-400 hover:text-emerald-300 hover:bg-white/5 rounded-lg transition flex items-center justify-between"
              >
                <span>View all results in Incident Log</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Footer Bar (Section 11: Keyboard Navigation Legend - no column wrapping) */}
          <div className="px-4 py-2 bg-black/60 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-400 select-none">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="bg-white/10 px-1 py-0.5 rounded text-slate-300">↑</kbd>{' '}
                <kbd className="bg-white/10 px-1 py-0.5 rounded text-slate-300">↓</kbd> Navigate
              </span>
              <span>
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-slate-300">Enter</kbd> Open
              </span>
              <span>
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-slate-300">Esc</kbd> Close
              </span>
            </div>
            <span className="text-slate-500 hidden sm:inline">SafeVision Intelligence</span>
          </div>
        </div>
      )}
    </div>
  );
};
