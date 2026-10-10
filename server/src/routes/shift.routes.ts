import { Router, Response } from 'express';
import { DataStore, ShiftDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

// GET /api/shifts/current - Authoritative active shift based on server time & schedule
router.get('/current', authenticate, (req: AuthRequest, res: Response) => {
  const currentShift = store.getCurrentShift();
  const serverTime = new Date().toISOString();
  const timezone = process.env.TIMEZONE || 'Asia/Kolkata';

  res.json({
    activeShift: currentShift,
    hasActiveShift: Boolean(currentShift),
    serverTime,
    timezone,
  });
});

// GET /api/shifts - List all operational shifts
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const { siteId } = req.query;
  let shifts = [...store.shifts];
  if (siteId) {
    shifts = shifts.filter((s) => s.siteId === String(siteId));
  }
  const currentShift = store.getCurrentShift();
  res.json({
    shifts,
    total: shifts.length,
    activeShift: currentShift,
    hasActiveShift: Boolean(currentShift),
    serverTime: new Date().toISOString(),
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  });
});

// POST /api/shifts - Create a new operational shift (Admin / Plant Manager)
router.post('/', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { name, code, startTime, endTime, days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], supervisorId, siteId = 'site-rsp-1' } = req.body;

  if (!name || !code || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields: name, code, startTime, endTime.' });
  }

  const existing = store.shifts.find((s) => (s.code || '').toLowerCase() === String(code).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: `Shift with code '${code}' already exists.` });
  }

  const newShift: ShiftDoc = {
    id: `shift-${Date.now()}`,
    name,
    code: code.toUpperCase(),
    startTime,
    endTime,
    days: Array.isArray(days) ? days : [days],
    active: true,
    supervisorId,
    siteId,
  };

  store.shifts.push(newShift);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SHIFT_CREATED',
    resourceType: 'SHIFT',
    resourceId: newShift.id,
    siteId: newShift.siteId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    after: newShift,
  });

  socketService.emitShiftUpdated(newShift);
  res.status(201).json({ success: true, shift: newShift });
});

// PATCH /api/shifts/:id - Update shift details
router.patch('/:id', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const shift = store.shifts.find((s) => s.id === req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Shift not found.' });
  }

  const before = { ...shift };
  const { name, startTime, endTime, days, active, supervisorId, siteId } = req.body;

  if (name !== undefined) shift.name = name;
  if (startTime !== undefined) shift.startTime = startTime;
  if (endTime !== undefined) shift.endTime = endTime;
  if (days !== undefined) shift.days = Array.isArray(days) ? days : [days];
  if (active !== undefined) shift.active = Boolean(active);
  if (supervisorId !== undefined) shift.supervisorId = supervisorId;
  if (siteId !== undefined) shift.siteId = siteId;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SHIFT_UPDATED',
    resourceType: 'SHIFT',
    resourceId: shift.id,
    siteId: shift.siteId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: shift,
  });

  socketService.emitShiftUpdated(shift);
  res.json({ success: true, shift });
});

// PATCH /api/shifts/:id/toggle - Toggle active status
router.patch('/:id/toggle', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const shift = store.shifts.find((s) => s.id === req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Shift not found.' });
  }

  const before = { active: shift.active };
  shift.active = !shift.active;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SHIFT_TOGGLED',
    resourceType: 'SHIFT',
    resourceId: shift.id,
    siteId: shift.siteId,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: { active: shift.active },
  });

  socketService.emitShiftUpdated(shift);
  res.json({ success: true, shift });
});

export default router;
