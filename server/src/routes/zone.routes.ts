import { Router, Response } from 'express';
import { DataStore } from '../models/DataStore';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const store = DataStore.getInstance();

// GET /api/zones - Role & Zone-Scoped Industrial Zones
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;

  let eligibleZones = [...store.zones];

  // Scoping: Supervisor and Employee only receive their assigned zones
  if (user.role === 'SUPERVISOR' || user.role === 'EMPLOYEE') {
    if (!user.zoneIds.includes('*')) {
      eligibleZones = eligibleZones.filter((z) =>
        user.zoneIds.some(
          (zid) =>
            zid.toLowerCase() === z.id.toLowerCase() ||
            zid.toLowerCase() === z.code.toLowerCase() ||
            zid.toLowerCase() === z.name.toLowerCase()
        )
      );
    }
  }

  // Update zone incident counts dynamically from real incidents
  const zonesWithStats = eligibleZones.map((z) => {
    const activeIncidents = store.incidents.filter(
      (i) =>
        (i.zoneId === z.id || i.zone?.toLowerCase() === z.name?.toLowerCase()) &&
        i.status !== 'RESOLVED' &&
        i.status !== 'FALSE_POSITIVE'
    ).length;

    return {
      ...z,
      incidentCount: activeIncidents,
      status: activeIncidents > 2 ? 'CRITICAL' : activeIncidents > 0 ? 'ELEVATED' : 'SAFE',
    };
  });

  res.json({ zones: zonesWithStats, total: zonesWithStats.length });
});

export default router;
