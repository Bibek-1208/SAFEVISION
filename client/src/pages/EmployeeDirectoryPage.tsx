import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  ShieldCheck,
  Building,
  Clock,
  Phone,
  AlertCircle,
  CheckCircle2,
  X,
  Edit2,
  RefreshCw,
  Eye,
  UserX,
  HardHat
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  roleTitle: string;
  department: string;
  shift: string;
  siteId: string;
  assignedZoneId: string;
  status: 'ACTIVE' | 'INACTIVE';
  phone: string;
  emergencyContact: string;
  requiredPPE: string[];
  createdAt: string;
  updatedAt: string;
}

export const EmployeeDirectoryPage: React.FC = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');

  // Modals
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    fullName: '',
    email: '',
    roleTitle: '',
    department: '',
    shift: '',
    assignedZoneId: '',
    phone: '',
    emergencyContact: '',
    requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Steel-Toe Boots'],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.getZones().catch(() => ({ zones: [] })),
      api.getShifts().catch(() => ({ shifts: [] })),
    ]).then(([zRes, sRes]) => {
      setZones(zRes.zones || []);
      setShifts(sRes.shifts || []);
    });
  }, []);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'PLANT_MANAGER';
  const isSupervisor = user?.role === 'SUPERVISOR' || user?.role === 'SAFETY_OFFICER';

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const res = await api.getEmployees({
        search: search || undefined,
        zoneId: zoneFilter !== 'ALL' ? zoneFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        shift: shiftFilter !== 'ALL' ? shiftFilter : undefined,
      });
      setEmployees(res.employees || []);
    } catch (err: any) {
      console.error('Failed to fetch employees', err);
      setMessage({ type: 'error', text: err.message || 'Failed to load employee directory' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [zoneFilter, statusFilter, shiftFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmployees();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.createEmployee(createForm);
      setMessage({ type: 'success', text: `Employee ${createForm.fullName} (${createForm.employeeId}) registered successfully.` });
      setIsCreateOpen(false);
      setCreateForm({
        employeeId: '',
        fullName: '',
        email: '',
        roleTitle: '',
        department: '',
        shift: '',
        assignedZoneId: '',
        phone: '',
        emergencyContact: '',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Steel-Toe Boots'],
      });
      fetchEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to register employee' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.updateEmployee(selectedEmployee.id, editForm);
      setMessage({ type: 'success', text: `Updated record for ${selectedEmployee.fullName}.` });
      setIsEditOpen(false);
      fetchEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update employee' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (employee: Employee) => {
    try {
      await api.deactivateEmployee(employee.id);
      setMessage({
        type: 'success',
        text: `Employee status toggled for ${employee.fullName} (${employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}).`,
      });
      fetchEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to toggle employee status' });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                ENTERPRISE WORKFORCE
              </span>
              <span className="text-xs font-mono text-slate-400">SCOPED DIRECTORY</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Personnel & Industrial Safety Directory</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchEmployees}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          {isPrivileged && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono transition-colors shadow-lg shadow-blue-500/20"
            >
              <UserPlus className="w-4 h-4" />
              REGISTER EMPLOYEE
            </button>
          )}
        </div>
      </div>

      {/* Status Message Notification */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-4 rounded-2xl">
        <form onSubmit={handleSearchSubmit} className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search employee by name, ID, role, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500/50 font-mono"
          />
        </form>

        <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>ZONE:</span>
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="bg-[#0e1017] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Zones</option>
              <option value="zone-sms-01">Zone 1 - Furnace Primary</option>
              <option value="zone-sms-02">Zone 2 - Secondary Refining</option>
              <option value="zone-sms-03">Zone 3 - Continuous Caster</option>
              <option value="zone-sms-04">Zone 4 - Ladle Maintenance</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span>STATUS:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0e1017] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Roster Table */}
      <div className="bg-[#12151b] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-[#0e1017]/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">ID / Designation</th>
                <th className="py-3 px-4">Department & Shift</th>
                <th className="py-3 px-4">Zone Assignment</th>
                <th className="py-3 px-4">Required PPE</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    {isLoading ? 'Scanning personnel database...' : 'No employee records found matching query filters.'}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-blue-400 font-bold font-mono text-xs">
                          {emp.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{emp.fullName}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-amber-400 font-bold">{emp.employeeId}</span>
                      <p className="text-slate-400 text-[11px]">{emp.roleTitle}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-200">{emp.department}</p>
                      <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {emp.shift}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 text-[11px]">
                        {emp.assignedZoneId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {emp.requiredPPE.map((ppe, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20"
                          >
                            {ppe}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                          emp.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                          title="View Profile"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {(isPrivileged || isSupervisor) && (
                          <button
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setEditForm({
                                fullName: emp.fullName,
                                roleTitle: emp.roleTitle,
                                department: emp.department,
                                shift: emp.shift,
                                assignedZoneId: emp.assignedZoneId,
                                phone: emp.phone,
                                emergencyContact: emp.emergencyContact,
                              });
                              setIsEditOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-colors"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isPrivileged && (
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors"
                            title={emp.status === 'ACTIVE' ? 'Deactivate Personnel' : 'Reactivate Personnel'}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Employee Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold text-white">Register Personnel Record</h2>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Employee Worker ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0115-WK"
                    value={createForm.employeeId}
                    onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunita Soren"
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Corporate Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sunita.soren@rourkela.sail.in"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Role / Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Secondary Furnace Operator"
                    value={createForm.roleTitle}
                    onChange={(e) => setCreateForm({ ...createForm, roleTitle: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Assigned Zone</label>
                  <select
                    value={createForm.assignedZoneId}
                    onChange={(e) => setCreateForm({ ...createForm, assignedZoneId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  >
                    <option value="zone-sms-01">Zone 1 - Furnace Primary (SMS-01)</option>
                    <option value="zone-sms-02">Zone 2 - Secondary Refining (SMS-02)</option>
                    <option value="zone-sms-03">Zone 3 - Continuous Caster (SMS-03)</option>
                    <option value="zone-sms-04">Zone 4 - Ladle Maintenance (SMS-04)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Shift Schedule</label>
                  <input
                    type="text"
                    value={createForm.shift}
                    onChange={(e) => setCreateForm({ ...createForm, shift: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Emergency SOS Phone</label>
                  <input
                    type="text"
                    value={createForm.emergencyContact}
                    onChange={(e) => setCreateForm({ ...createForm, emergencyContact: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'REGISTERING...' : 'CONFIRM REGISTRATION'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <Edit2 className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold text-white">Modify Employee: {selectedEmployee.fullName}</h2>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-mono">
              {isPrivileged && (
                <div>
                  <label className="block text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editForm.fullName || ''}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Assigned Zone</label>
                  <select
                    value={editForm.assignedZoneId || selectedEmployee.assignedZoneId}
                    onChange={(e) => setEditForm({ ...editForm, assignedZoneId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  >
                    <option value="zone-sms-01">Zone 1 - Furnace Primary (SMS-01)</option>
                    <option value="zone-sms-02">Zone 2 - Secondary Refining (SMS-02)</option>
                    <option value="zone-sms-03">Zone 3 - Continuous Caster (SMS-03)</option>
                    <option value="zone-sms-04">Zone 4 - Ladle Maintenance (SMS-04)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Shift</label>
                  <input
                    type="text"
                    value={editForm.shift || ''}
                    onChange={(e) => setEditForm({ ...editForm, shift: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              {isPrivileged && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 mb-1">Phone</label>
                    <input
                      type="text"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Emergency SOS</label>
                    <input
                      type="text"
                      value={editForm.emergencyContact || ''}
                      onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'SAVING...' : 'SAVE MODIFICATIONS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details View Drawer / Modal */}
      {selectedEmployee && !isEditOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold font-mono">
                  {selectedEmployee.fullName.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{selectedEmployee.fullName}</h3>
                  <p className="text-xs text-amber-400 font-mono">ID: {selectedEmployee.employeeId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#0e1017] border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Designation:</span>
                  <span className="text-white font-semibold">{selectedEmployee.roleTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Department:</span>
                  <span className="text-white">{selectedEmployee.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Shift Schedule:</span>
                  <span className="text-white">{selectedEmployee.shift}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned Zone:</span>
                  <span className="text-amber-400">{selectedEmployee.assignedZoneId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contact Phone:</span>
                  <span className="text-white">{selectedEmployee.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Emergency SOS:</span>
                  <span className="text-rose-400">{selectedEmployee.emergencyContact}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={selectedEmployee.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}>
                    {selectedEmployee.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-2 font-bold">MANDATORY PPE PROFILE:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedEmployee.requiredPPE.map((ppe, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1.5"
                    >
                      <HardHat className="w-3.5 h-3.5 text-blue-400" />
                      {ppe}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-mono text-xs"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
