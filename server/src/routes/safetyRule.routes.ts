import { Router, Response } from 'express';
import { DataStore, SafetyRuleDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';

const router = Router();
const store = DataStore.getInstance();

// GET /api/safety-rules - List all industrial safety rules (Admin, Plant Manager, Safety Officer read-only)
router.get('/', authenticate, requireRole('ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER'), (req: AuthRequest, res: Response) => {
  const { severity, enabled } = req.query;
  let rules = [...store.safetyRules];

  if (severity) {
    rules = rules.filter((r) => r.severity.toLowerCase() === String(severity).toLowerCase());
  }

  if (enabled !== undefined) {
    const isEnabled = enabled === 'true';
    rules = rules.filter((r) => r.enabled === isEnabled);
  }

  // Contract guarantee: notificationChannels and zones must always be arrays
  const normalizedRules = rules.map((r) => ({
    ...r,
    ruleCode: r.ruleCode || r.id.toUpperCase(),
    description: r.description || '',
    minConfidence: r.minConfidence ?? r.confidenceThreshold ?? 0.75,
    cooldownSeconds: r.cooldownSeconds ?? (r.cooldownMs ? Math.round(r.cooldownMs / 1000) : 30),
    zones: Array.isArray(r.zones) ? r.zones : [],
    notificationChannels: Array.isArray(r.notificationChannels) ? r.notificationChannels : [],
  }));

  res.json({ rules: normalizedRules, total: normalizedRules.length });
});

// POST /api/safety-rules - Create new custom rule (Admin / Plant Manager)
router.post('/', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const {
    name,
    ruleCode,
    description,
    severity = 'MEDIUM',
    minConfidence = 0.75,
    cooldownSeconds = 30,
    zones = [],
    notificationChannels = [],
  } = req.body;

  if (!name || !ruleCode) {
    return res.status(400).json({ error: 'Missing required fields: name, ruleCode.' });
  }

  const existing = store.safetyRules.find((r) => (r.ruleCode || '').toLowerCase() === String(ruleCode).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: `Rule with code '${ruleCode}' already exists.` });
  }

  const newRule: SafetyRuleDoc = {
    id: `rule-${Date.now()}`,
    name,
    ruleCode: ruleCode.toUpperCase(),
    violationClass: req.body.violationClass || ruleCode.toLowerCase(),
    description: description || '',
    severity,
    minConfidence: Number(minConfidence),
    cooldownSeconds: Number(cooldownSeconds),
    enabled: true,
    zones: Array.isArray(zones) ? zones : (zones ? [zones] : []),
    notificationChannels: Array.isArray(notificationChannels) ? notificationChannels : (notificationChannels ? [notificationChannels] : []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.safetyRules.push(newRule);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SAFETY_RULE_CREATED',
    resourceType: 'SAFETY_RULE',
    resourceId: newRule.id,
    ipAddress: req.ip,
    result: 'SUCCESS',
    after: newRule,
  });

  res.status(201).json({ success: true, rule: newRule });
});

// PATCH /api/safety-rules/:id - Update rule parameters
router.patch('/:id', authenticate, requireRole('ADMIN', 'PLANT_MANAGER'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const rule = store.safetyRules.find((r) => r.id === req.params.id || r.ruleCode === req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Safety rule not found.' });
  }

  const before = { ...rule };
  const { name, description, severity, minConfidence, cooldownSeconds, enabled, zones, notificationChannels } = req.body;

  if (name !== undefined) rule.name = name;
  if (description !== undefined) rule.description = description;
  if (severity !== undefined) rule.severity = severity;
  if (minConfidence !== undefined) rule.minConfidence = Number(minConfidence);
  if (cooldownSeconds !== undefined) rule.cooldownSeconds = Number(cooldownSeconds);
  if (enabled !== undefined) rule.enabled = Boolean(enabled);
  if (zones !== undefined) rule.zones = Array.isArray(zones) ? zones : [zones];
  if (notificationChannels !== undefined) rule.notificationChannels = Array.isArray(notificationChannels) ? notificationChannels : [notificationChannels];
  rule.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SAFETY_RULE_UPDATED',
    resourceType: 'SAFETY_RULE',
    resourceId: rule.id,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: rule,
  });

  res.json({ success: true, rule });
});

export default router;
