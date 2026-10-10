import { Router, Response } from 'express';
import { DataStore, EmployeeDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

function projectEmployeeDTO(employee: EmployeeDoc, user: any): Partial<EmployeeDoc> {
  const isPrivileged = user.role === 'ADMIN' || user.role === 'PLANT_MANAGER';
  const isSelf = user.role === 'EMPLOYEE' && (
    (user.workerId && employee.employeeId.toLowerCase() === user.workerId.toLowerCase()) ||
    (employee.email && employee.email.toLowerCase() === user.email.toLowerCase())
  );

  if (isPrivileged || isSelf) {
    return employee;
  }

  // Sanitize sensitive PII for supervisors, safety officers, and others
  const sanitized = { ...employee };
  delete sanitized.address;
  delete sanitized.phone;
  delete sanitized.emergencyContact;
  delete sanitized.emergencyContacts;
  delete sanitized.insurance;
  delete sanitized.idReferences;
  delete sanitized.education;
  delete sanitized.dateOfBirth;
  return sanitized;
}

// GET /api/employees - Role-Scoped Employee Directory
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { search, zoneId, status, shift } = req.query;

  let employees = [...store.employees];

  // Role Scoping
  if (user.role === 'ADMIN' || user.role === 'PLANT_MANAGER') {
    // Unrestricted
  } else if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
    if (!user.zoneIds.includes('*')) {
      employees = employees.filter((e) =>
        user.zoneIds.some(
          (zid) =>
            (e.assignedZoneId && zid.toLowerCase() === e.assignedZoneId.toLowerCase()) ||
            (e.siteId && zid.toLowerCase() === e.siteId.toLowerCase())
        )
      );
    }
  } else if (user.role === 'EMPLOYEE') {
    employees = employees.filter(
      (e) =>
        (user.workerId && e.employeeId && e.employeeId.toLowerCase() === user.workerId.toLowerCase()) ||
        (e.email && e.email.toLowerCase() === user.email.toLowerCase())
    );
  }

  // Query Filters
  if (zoneId && zoneId !== 'ALL') {
    employees = employees.filter((e) => e.assignedZoneId && e.assignedZoneId.toLowerCase() === String(zoneId).toLowerCase());
  }

  if (status && status !== 'ALL') {
    employees = employees.filter((e) => e.status && e.status.toLowerCase() === String(status).toLowerCase());
  }

  if (shift && shift !== 'ALL') {
    employees = employees.filter((e) => e.shift && e.shift.toLowerCase().includes(String(shift).toLowerCase()));
  }

  if (search) {
    const q = String(search).toLowerCase();
    employees = employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.roleTitle.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
    );
  }

  // Project role-specific DTOs (strip sensitive PII from non-privileged roles)
  const projected = employees.map((e) => projectEmployeeDTO(e, user));

  res.json({
    employees: projected,
    total: projected.length,
    userRole: user.role,
  });
});

// GET /api/employees/:id
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toLowerCase();
  const employee = store.employees.find((e) => e.id.toLowerCase() === targetId || e.employeeId.toLowerCase() === targetId);

  if (!employee) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  if (user.role === 'EMPLOYEE') {
    const isSelf = (user.workerId && employee.employeeId.toLowerCase() === user.workerId.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase() === user.email.toLowerCase());
    if (!isSelf) {
      return res.status(403).json({ error: 'Access denied. You can only view your own employee profile.' });
    }
  } else if (user.role === 'SUPERVISOR' && !user.zoneIds.includes('*')) {
    const inScope = user.zoneIds.some(
      (zid) => zid.toLowerCase() === employee.assignedZoneId.toLowerCase() || (employee.siteId && zid.toLowerCase() === employee.siteId.toLowerCase())
    );
    if (!inScope) {
      return res.status(403).json({ error: 'Access denied. Employee is outside your supervision zone.' });
    }
  }

  res.json({ employee: projectEmployeeDTO(employee, user) });
});

// POST /api/employees - Register Employee (Admin / Plant Manager)
router.post('/', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const {
    employeeId,
    fullName,
    email,
    roleTitle,
    department = 'Operations',
    shift = '',
    siteId = store.sites[0]?.id || 'site-01',
    assignedZoneId = store.zones[0]?.id || 'zone-01',
    phone = '',
    emergencyContact = '',
    requiredPPE = [],
  } = req.body;

  if (!employeeId || !fullName || !email || !roleTitle) {
    return res.status(400).json({ error: 'Missing required fields: employeeId, fullName, email, roleTitle.' });
  }

  const existing = store.employees.find((e) => e.employeeId.toLowerCase() === String(employeeId).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: `Employee with ID '${employeeId}' already registered.` });
  }

  const nowIso = new Date().toISOString();
  const newEmployee: EmployeeDoc = {
    id: `emp-${Date.now()}`,
    employeeId: employeeId.toUpperCase(),
    fullName,
    email: email.toLowerCase(),
    roleTitle,
    department,
    shift,
    siteId,
    assignedZoneId,
    status: 'ACTIVE',
    phone,
    emergencyContact,
    requiredPPE: Array.isArray(requiredPPE) ? requiredPPE : [requiredPPE],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.employees.unshift(newEmployee);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'EMPLOYEE_CREATED',
    resourceType: 'EMPLOYEE',
    resourceId: newEmployee.employeeId,
    siteId: newEmployee.siteId,
    zoneId: newEmployee.assignedZoneId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    after: newEmployee,
  });

  socketService.emitEmployeeCreated(newEmployee);
  res.status(201).json({ success: true, employee: newEmployee });
});

// PATCH /api/employees/:id - Update Employee Details
router.patch('/:id', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const employee = store.employees.find((e) => e.id === req.params.id || e.employeeId === req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Authorization: Admins & Plant Managers can edit everything.
  // Supervisors can only update zone assignment and shift for workers in their scope.
  const isPrivileged = user.role === 'ADMIN' || user.role === 'PLANT_MANAGER';
  const isSupervisor = user.role === 'SUPERVISOR';

  if (!isPrivileged && !isSupervisor) {
    return res.status(403).json({ error: 'Access denied. Insufficient permissions to edit employee records.' });
  }

  if (isSupervisor) {
    const inScope = user.zoneIds.includes('*') || user.zoneIds.some(
      (zid) => zid.toLowerCase() === employee.assignedZoneId.toLowerCase() || (employee.siteId && zid.toLowerCase() === employee.siteId.toLowerCase())
    );
    if (!inScope) {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'EMPLOYEE_UPDATE',
        resourceId: employee.employeeId,
        result: 'DENIED',
        metadata: { reason: 'Supervisor attempted to edit employee outside assigned zone' },
      });
      return res.status(403).json({
        error: `Access denied. Employee ${employee.employeeId} is in zone '${employee.assignedZoneId}', which is outside your supervision scope.`,
        code: 'ZONE_SCOPE_FORBIDDEN',
      });
    }
  }

  const before = { ...employee };
  const { fullName, roleTitle, department, shift, assignedZoneId, phone, emergencyContact, requiredPPE, status } = req.body;

  if (isPrivileged) {
    if (fullName !== undefined) employee.fullName = fullName;
    if (roleTitle !== undefined) employee.roleTitle = roleTitle;
    if (department !== undefined) employee.department = department;
    if (shift !== undefined) employee.shift = shift;
    if (assignedZoneId !== undefined) employee.assignedZoneId = assignedZoneId;
    if (phone !== undefined) employee.phone = phone;
    if (emergencyContact !== undefined) employee.emergencyContact = emergencyContact;
    if (requiredPPE !== undefined) employee.requiredPPE = Array.isArray(requiredPPE) ? requiredPPE : [requiredPPE];
    if (status !== undefined) employee.status = status;
  } else if (isSupervisor) {
    // Limited edits
    if (shift !== undefined) employee.shift = shift;
    if (assignedZoneId !== undefined) employee.assignedZoneId = assignedZoneId;
  }

  employee.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'EMPLOYEE_UPDATED',
    resourceType: 'EMPLOYEE',
    resourceId: employee.employeeId,
    siteId: employee.siteId,
    zoneId: employee.assignedZoneId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: employee,
  });

  socketService.emitEmployeeUpdated(employee);
  res.json({ success: true, employee: projectEmployeeDTO(employee, user) });
});

// PATCH /api/employees/:id/deactivate - Deactivate Employee (Admin Only)
router.patch('/:id/deactivate', authenticate, requireRole('ADMIN'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const employee = store.employees.find((e) => e.id === req.params.id || e.employeeId === req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  const before = { status: employee.status };
  employee.status = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  employee.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: employee.status === 'INACTIVE' ? 'EMPLOYEE_DEACTIVATED' : 'EMPLOYEE_ACTIVATED',
    resourceType: 'EMPLOYEE',
    resourceId: employee.employeeId,
    siteId: employee.siteId,
    zoneId: employee.assignedZoneId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: { status: employee.status },
  });

  socketService.emitEmployeeUpdated(employee);
  res.json({ success: true, employee });
});

export default router;
