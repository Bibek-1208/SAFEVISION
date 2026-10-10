import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  CheckCircle,
  XCircle,
  KeyRound,
  Edit2,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { User, Role } from '../../types';

const ROLES: Role[] = ['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE'];

const ROLE_COLORS: Record<Role, string> = {
  ADMIN: 'bg-red-500/10 text-red-400 border-red-500/30',
  PLANT_MANAGER: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SAFETY_OFFICER: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  SUPERVISOR: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  EMPLOYEE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

export const UserManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('EMPLOYEE');
  const [newZones, setNewZones] = useState<string>('ZONE-A');
  const [isCreating, setIsCreating] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: 'Password123!',
    role: 'EMPLOYEE' as Role,
    department: 'Plant Operations',
    shift: 'Shift A (06:00 - 14:00)',
    zoneIds: 'ZONE-A',
  });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: 'Failed to fetch enterprise users' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleUpdate = async () => {
    if (!editingUser) return;
    try {
      const zoneArr = newZones.split(',').map((z) => z.trim());
      await api.updateUserRole(editingUser.id, newRole, ['site-rsp-1'], zoneArr);
      setStatusMessage({ type: 'success', text: `Updated ${editingUser.name}'s role to ${newRole}` });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update role' });
    }
  };

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await api.toggleUserStatus(user.id, nextStatus);
      setStatusMessage({ type: 'success', text: `Set status of ${user.name} to ${nextStatus}` });
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to toggle user status' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const zoneArr = newUserForm.zoneIds.split(',').map((z) => z.trim());
      await api.createUser({
        name: newUserForm.name,
        email: newUserForm.email,
        password: newUserForm.password,
        role: newUserForm.role,
        department: newUserForm.department,
        shift: newUserForm.shift,
        siteIds: ['site-rsp-1'],
        zoneIds: zoneArr,
      });
      setStatusMessage({ type: 'success', text: `Successfully registered user ${newUserForm.email}` });
      setIsCreating(false);
      setNewUserForm({
        name: '',
        email: '',
        password: 'Password123!',
        role: 'EMPLOYEE',
        department: 'Plant Operations',
        shift: 'Shift A (06:00 - 14:00)',
        zoneIds: 'ZONE-A',
      });
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create user' });
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.department?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = selectedRole === 'ALL' || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                ENTERPRISE IDENTITY
              </span>
              <span className="text-xs font-mono text-slate-400">RBAC & SCOPE DIRECTORY</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">User & Role Management</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            CREATE NEW USER
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-mono ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-4">
            ×
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-4 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search user by name, email, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['ALL', ...ROLES].map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all whitespace-nowrap ${
                selectedRole === role
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#12151b] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0e1017] text-slate-400 uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="py-3.5 px-4 font-semibold">User Identity</th>
                <th className="py-3.5 px-4 font-semibold">Role</th>
                <th className="py-3.5 px-4 font-semibold">Zone Clearance</th>
                <th className="py-3.5 px-4 font-semibold">Department & Shift</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold">Last Login</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    No users matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{u.name}</div>
                      <div className="text-slate-400 text-[11px]">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${ROLE_COLORS[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-emerald-400 font-semibold">
                        {u.zoneIds.includes('*') ? 'All Plant Zones (*)' : u.zoneIds.join(', ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <div>{u.department}</div>
                      <div className="text-[10px] text-slate-500">{u.shift}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <>
                            <CheckCircle className="w-3 h-3" /> ACTIVE
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> DISABLED
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {u.lastLogin
                        ? new Date(u.lastLogin).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setEditingUser(u);
                          setNewRole(u.role);
                          setNewZones(u.zoneIds.join(', '));
                        }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                        title="Edit Role & Scope"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Adjust Role & Scopes</h3>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                ×
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Editing permissions for <span className="text-white font-semibold">{editingUser.name}</span> ({editingUser.email}). Permissions update automatically based on RBAC matrix.
            </p>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">Security Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500/50"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">
                Zone Clearance (Comma separated or *)
              </label>
              <input
                type="text"
                value={newZones}
                onChange={(e) => setNewZones(e.target.value)}
                placeholder="e.g. ZONE-A, ZONE-B or *"
                className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleUpdate}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <Check className="w-3.5 h-3.5" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Register Corporate User</h3>
              </div>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
                ×
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Corporate Email</label>
                  <input
                    type="email"
                    required
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    placeholder="r.kumar@steelplant.com"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Password</label>
                  <input
                    type="password"
                    required
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Security Role</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as Role })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Department</label>
                  <input
                    type="text"
                    value={newUserForm.department}
                    onChange={(e) => setNewUserForm({ ...newUserForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 uppercase">Shift</label>
                  <input
                    type="text"
                    value={newUserForm.shift}
                    onChange={(e) => setNewUserForm({ ...newUserForm, shift: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 uppercase">Zone Clearance (comma separated or *)</label>
                <input
                  type="text"
                  value={newUserForm.zoneIds}
                  onChange={(e) => setNewUserForm({ ...newUserForm, zoneIds: e.target.value })}
                  placeholder="ZONE-A, ZONE-B"
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Register Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
