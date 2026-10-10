import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Eye,
  EyeOff,
  ArrowRight,
  Lock,
  Mail,
  Building2,
  CheckCircle2,
  Users,
  Radio,
  Cpu,
  KeyRound,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState('officer@test.local');
  const [password, setPassword] = useState('Test@1234');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDashboardRoute = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return '/admin';
      case 'PLANT_MANAGER':
        return '/dashboard';
      case 'SAFETY_OFFICER':
        return '/surveillance';
      case 'SUPERVISOR':
        return '/supervisor';
      case 'EMPLOYEE':
        return '/employee';
      default:
        return '/dashboard';
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const user = await loginWithGoogle();
      navigate(getDashboardRoute(user.role));
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google Sign-In window was closed. Please try again.');
      } else {
        setError(err.message || 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      // Authoritative role from backend dictates destination dashboard
      navigate(getDashboardRoute(user.role));
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check corporate email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  const setTestAccount = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('Test@1234');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#101318] flex flex-col md:flex-row text-gray-100">
      {/* Left Column: Industrial Brand & Zero-Trust Telemetry */}
      <div className="md:w-1/2 bg-[#141720] p-8 md:p-12 flex flex-col justify-between relative border-r border-white/5 overflow-hidden">
        {/* Ambience glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black via-[#161a24] to-[#101318] opacity-95" />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-wider text-white">SafeVision AI</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono font-bold rounded border border-emerald-500/30">
                  ENTERPRISE RBAC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Industrial Safety Monitoring Platform</p>
            </div>
          </div>
          <h2 className="text-2xl lg:text-3xl font-bold text-white mt-4 leading-snug">
            See the Risk. Prevent the Incident. Protect the Workforce.
          </h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Real-time neural detection of PPE guidelines (helmets, high-vis vests, footwear, gloves), hazardous fire/smoke, restricted zone breaches, and worker falls.
          </p>
        </div>

        {/* Center Graphic / RBAC Security Architecture Badge */}
        <div className="relative z-10 my-8">
          <div className="bg-[#0e1017]/90 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl max-w-md space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white">ZERO-TRUST ACCESS GATEWAY</span>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                ACTIVE
              </span>
            </div>

            <div className="space-y-1.5 text-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">AUTHORITY:</span>
                <span className="text-white font-semibold">Backend Role Resolution</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">POLICY MATRIX:</span>
                <span className="text-amber-400 font-semibold">28 Granular Permissions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ZONE ISOLATION:</span>
                <span className="text-cyan-400 font-semibold">Scope-Based (SBAC)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">AUDIT TRAIL:</span>
                <span className="text-emerald-400 font-semibold">Immutable Event Logger</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Hero Stats Strip */}
        <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-white/10 font-mono">
          <div>
            <p className="text-2xl font-extrabold text-white">5 Roles</p>
            <p className="text-[10px] text-slate-400">Strict Separation</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-emerald-400">99.4%</p>
            <p className="text-[10px] text-slate-400">Neural Accuracy</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-amber-400">DGFASLI</p>
            <p className="text-[10px] text-slate-400">OSHA Compliant</p>
          </div>
        </div>
      </div>

      {/* Right Column: Corporate Email + Password Login Form */}
      <div className="md:w-1/2 p-8 md:p-14 flex flex-col justify-center max-w-lg mx-auto w-full">
        <div className="mb-6 text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-slate-400 mb-2">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>CORPORATE SINGLE SIGN-ON</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Corporate Portal Sign In</h1>
          <p className="text-xs text-slate-400 mt-1">
            Enter your company email and password. Your role and zone clearance are assigned automatically.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl font-mono flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Primary Enterprise Authentication: Continue with Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isLoading}
          className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-gray-900 font-bold rounded-xl text-xs tracking-wider flex items-center justify-center gap-3 transition shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-50 border border-slate-300 mb-5 cursor-pointer font-sans"
        >
          {isGoogleLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-xs">Authenticating with Google...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="font-semibold text-xs tracking-wider uppercase">CONTINUE WITH GOOGLE</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-[#101318] px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest relative">
            OR SIGN IN WITH CORPORATE ID
          </span>
        </div>

        {/* Authoritative Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-left font-mono text-xs">
          <div>
            <label className="block text-slate-400 mb-1.5 uppercase tracking-wider text-[11px]">
              Corporate Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@test.local"
                className="w-full bg-[#141720] border border-white/10 focus:border-emerald-500/60 rounded-xl pl-10 pr-3 py-2.5 text-white placeholder-slate-600 outline-none transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-slate-400 uppercase tracking-wider text-[11px]">Password</label>
              <span className="text-[10px] text-slate-500 font-sans">Default: Test@1234</span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-[#141720] border border-white/10 focus:border-emerald-500/60 rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-slate-600 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 mt-2 active:scale-[0.99] disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Authenticating Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In To Command Center</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </form>

        {/* Quick Fill Credentials for 5 Evaluator Test Accounts */}
        <div className="mt-6 bg-[#141720] border border-white/5 rounded-2xl p-4 text-left">
          <p className="text-[10px] font-mono text-slate-400 font-bold uppercase mb-2.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Hackathon Evaluator Credentials (Click to pre-fill):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setTestAccount('admin@test.local')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'admin@test.local'
                  ? 'bg-red-500/15 border-red-500/50 text-white font-bold ring-1 ring-red-500/30'
                  : 'bg-[#0e1017] border-white/5 text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-red-400 font-bold">1. ADMIN</div>
              <div className="text-[10px] text-slate-400 truncate">admin@test.local</div>
            </button>

            <button
              type="button"
              onClick={() => setTestAccount('manager@test.local')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'manager@test.local'
                  ? 'bg-purple-500/15 border-purple-500/50 text-white font-bold ring-1 ring-purple-500/30'
                  : 'bg-[#0e1017] border-white/5 text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-purple-400 font-bold">2. PLANT MANAGER</div>
              <div className="text-[10px] text-slate-400 truncate">manager@test.local</div>
            </button>

            <button
              type="button"
              onClick={() => setTestAccount('officer@test.local')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'officer@test.local'
                  ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold ring-1 ring-amber-500/30'
                  : 'bg-[#0e1017] border-white/5 text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-amber-400 font-bold">3. SAFETY OFFICER</div>
              <div className="text-[10px] text-slate-400 truncate">officer@test.local</div>
            </button>

            <button
              type="button"
              onClick={() => setTestAccount('supervisor@test.local')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'supervisor@test.local'
                  ? 'bg-blue-500/15 border-blue-500/50 text-white font-bold ring-1 ring-blue-500/30'
                  : 'bg-[#0e1017] border-white/5 text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-blue-400 font-bold">4. SUPERVISOR</div>
              <div className="text-[10px] text-slate-400 truncate">Zones A & B Only</div>
            </button>

            <button
              type="button"
              onClick={() => setTestAccount('employee@test.local')}
              className={`sm:col-span-2 p-2.5 rounded-xl border text-left transition-all ${
                email === 'employee@test.local'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-bold ring-1 ring-emerald-500/30'
                  : 'bg-[#0e1017] border-white/5 text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-emerald-400 font-bold">5. EMPLOYEE / WORKER</div>
              <div className="text-[10px] text-slate-400 truncate">employee@test.local (Worker 0112-WK)</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
