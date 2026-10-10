import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { DataStore, SiteDoc } from '../models/DataStore';
import { SiteModel, ZoneModel, CameraModel } from '../models/mongooseModels';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

/**
 * Helper to calculate real zone and camera counts for a site from database / memory
 */
async function getSiteStats(siteId: string, siteCode: string) {
  let zoneCount = 0;
  let cameraCount = 0;

  if (mongoose.connection.readyState === 1) {
    try {
      zoneCount = await ZoneModel.countDocuments({
        $or: [{ siteId }, { siteId: siteCode }],
      });
      cameraCount = await CameraModel.countDocuments({
        $or: [{ siteId }, { siteId: siteCode }],
      });
    } catch (_) {}
  }

  // Fallback / merge with memory if counts are 0
  if (zoneCount === 0) {
    zoneCount = store.zones.filter(
      (z: any) => z.siteId === siteId || z.siteId === siteCode || (!z.siteId && (siteId === 'site-rsp-1' || siteCode === 'RSP-ZB-01'))
    ).length;
  }
  if (cameraCount === 0) {
    cameraCount = store.cameras.filter(
      (c: any) => c.siteId === siteId || c.siteId === siteCode || (!c.siteId && (siteId === 'site-rsp-1' || siteCode === 'RSP-ZB-01'))
    ).length;
  }

  return { zoneCount, cameraCount };
}

// GET /api/sites - List all sites with real dynamic counts
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let sites: any[] = [];

    if (mongoose.connection.readyState === 1) {
      const dbSites = await SiteModel.find({}).lean();
      if (dbSites && dbSites.length > 0) {
        sites = dbSites.map((s: any) => ({
          id: s.siteId || s._id.toString(),
          siteId: s.siteId,
          companyName: s.companyName || 'SafeVision Industrial',
          name: s.name,
          code: s.code,
          location: s.location,
          industry: s.industry || 'Heavy Manufacturing & Industrial',
          timezone: s.timezone || 'Asia/Kolkata',
          status: s.status || 'ACTIVE',
          activeShift: s.activeShift || null,
          complianceRate: s.complianceRate ?? 0,
          totalWorkers: s.totalWorkers ?? 0,
          createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
        }));
      }
    }

    if (sites.length === 0) {
      sites = [...store.sites];
    }

    // Enrich with dynamic zone and camera counts
    const enriched = await Promise.all(
      sites.map(async (s) => {
        const stats = await getSiteStats(s.id || s.siteId, s.code);
        return {
          ...s,
          zoneCount: stats.zoneCount,
          cameraCount: stats.cameraCount,
          totalCameras: stats.cameraCount,
        };
      })
    );

    res.json({ sites: enriched, total: enriched.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve sites', detail: err.message });
  }
});

// GET /api/sites/current - Current active site context with real counts
router.get('/current', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requestedId = (req.query.siteId as string) || (req.headers['x-site-id'] as string);

    let site: any = null;

    if (requestedId && mongoose.connection.readyState === 1) {
      site = await SiteModel.findOne({
        $or: [{ siteId: requestedId }, { code: requestedId }],
      }).lean();
    }

    if (!site && requestedId) {
      site = store.sites.find((s) => s.id === requestedId || s.code === requestedId);
    }

    if (!site && mongoose.connection.readyState === 1) {
      site = await SiteModel.findOne({ status: 'ACTIVE' }).lean();
      if (!site) site = await SiteModel.findOne({}).lean();
    }

    if (!site) {
      site = store.sites[0] || null;
    }

    if (!site) {
      return res.json({ site: null, zoneCount: 0, cameraCount: 0 });
    }

    const normalized = {
      id: site.siteId || site.id || site._id?.toString(),
      siteId: site.siteId || site.id,
      companyName: site.companyName || 'SafeVision Industrial',
      name: site.name,
      code: site.code,
      location: site.location,
      industry: site.industry || 'Heavy Manufacturing & Industrial',
      timezone: site.timezone || 'Asia/Kolkata',
      status: site.status || 'ACTIVE',
      activeShift: site.activeShift || null,
      complianceRate: site.complianceRate ?? 0,
      totalWorkers: site.totalWorkers ?? 0,
    };

    const stats = await getSiteStats(normalized.id, normalized.code);

    res.json({
      site: {
        ...normalized,
        zoneCount: stats.zoneCount,
        cameraCount: stats.cameraCount,
        totalCameras: stats.cameraCount,
      },
      zoneCount: stats.zoneCount,
      cameraCount: stats.cameraCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve active site', detail: err.message });
  }
});

// GET /api/sites/:id - Fetch single site details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let site: any = null;

    if (mongoose.connection.readyState === 1) {
      site = await SiteModel.findOne({
        $or: [{ siteId: id }, { code: id }],
      }).lean();
    }

    if (!site) {
      site = store.sites.find((s) => s.id === id || s.code === id);
    }

    if (!site) {
      return res.status(404).json({ error: `Site with ID or Code '${id}' not found`, code: 'SITE_NOT_FOUND' });
    }

    const normalized = {
      id: site.siteId || site.id || site._id?.toString(),
      siteId: site.siteId || site.id,
      companyName: site.companyName || 'SafeVision Industrial',
      name: site.name,
      code: site.code,
      location: site.location,
      industry: site.industry || 'Heavy Manufacturing & Industrial',
      timezone: site.timezone || 'Asia/Kolkata',
      status: site.status || 'ACTIVE',
      activeShift: site.activeShift || null,
      complianceRate: site.complianceRate ?? 0,
      totalWorkers: site.totalWorkers ?? 0,
    };

    const stats = await getSiteStats(normalized.id, normalized.code);

    res.json({
      site: {
        ...normalized,
        zoneCount: stats.zoneCount,
        cameraCount: stats.cameraCount,
        totalCameras: stats.cameraCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch site', detail: err.message });
  }
});

// POST /api/sites - Create New Real Site (Admin Only)
router.post('/', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { companyName, name, code, location, industry, timezone, status } = req.body;

  // Validation
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Site name is required.', field: 'name' });
  }
  if (!code || !String(code).trim()) {
    return res.status(400).json({ error: 'Site code is required.', field: 'code' });
  }
  if (!location || !String(location).trim()) {
    return res.status(400).json({ error: 'Site location/address is required.', field: 'location' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  const cleanName = String(name).trim();
  const cleanLocation = String(location).trim();
  const cleanCompany = companyName ? String(companyName).trim() : 'SafeVision Industrial';
  const cleanIndustry = industry ? String(industry).trim() : 'Heavy Manufacturing & Industrial';
  const cleanTimezone = timezone ? String(timezone).trim() : 'Asia/Kolkata';
  const cleanStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  // Check unique code
  if (mongoose.connection.readyState === 1) {
    const existing = await SiteModel.findOne({ code: cleanCode });
    if (existing) {
      return res.status(409).json({
        error: `Site code '${cleanCode}' already exists. Please choose a unique code.`,
        field: 'code',
      });
    }
  }

  const memoryExisting = store.sites.find((s) => s.code?.toUpperCase() === cleanCode);
  if (memoryExisting) {
    return res.status(409).json({
      error: `Site code '${cleanCode}' already exists. Please choose a unique code.`,
      field: 'code',
    });
  }

  const siteId = `site-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const newSite: SiteDoc = {
    id: siteId,
    siteId,
    companyName: cleanCompany,
    name: cleanName,
    code: cleanCode,
    location: cleanLocation,
    industry: cleanIndustry,
    timezone: cleanTimezone,
    status: cleanStatus,
    activeShift: null as any,
    complianceRate: 100,
    totalWorkers: 0,
    camerasOnline: 0,
    totalCameras: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Persist to MongoDB
  if (mongoose.connection.readyState === 1) {
    try {
      await SiteModel.create({
        siteId,
        companyName: cleanCompany,
        name: cleanName,
        code: cleanCode,
        location: cleanLocation,
        industry: cleanIndustry,
        timezone: cleanTimezone,
        status: cleanStatus,
        activeShift: null,
        complianceRate: 100,
        totalWorkers: 0,
        camerasOnline: 0,
        totalCameras: 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to persist site to MongoDB', detail: err.message });
    }
  }

  // Update in-memory store
  store.sites.push(newSite);

  // Cryptographic audit log
  await AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SITE_CREATED',
    resourceType: 'SITE',
    resourceId: siteId,
    siteId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    after: newSite,
  });

  socketService.emitSiteCreated(newSite);

  res.status(201).json({
    success: true,
    message: 'Site created successfully',
    site: {
      ...newSite,
      zoneCount: 0,
      cameraCount: 0,
    },
  });
});

// PATCH /api/sites/:id - Edit Existing Site (Admin Only)
router.patch('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { companyName, name, code, location, industry, timezone, status } = req.body;

  let existingSite: any = null;
  if (mongoose.connection.readyState === 1) {
    existingSite = await SiteModel.findOne({
      $or: [{ siteId: id }, { code: id }],
    });
  }
  if (!existingSite) {
    existingSite = store.sites.find((s) => s.id === id || s.code === id);
  }

  if (!existingSite) {
    return res.status(404).json({ error: `Site '${id}' not found`, code: 'SITE_NOT_FOUND' });
  }

  const targetSiteId = existingSite.siteId || existingSite.id;
  const oldSnapshot = JSON.parse(JSON.stringify(existingSite));

  // Check code uniqueness if changing
  if (code && String(code).trim().toUpperCase() !== existingSite.code?.toUpperCase()) {
    const newCode = String(code).trim().toUpperCase();
    if (mongoose.connection.readyState === 1) {
      const codeClash = await SiteModel.findOne({ code: newCode, siteId: { $ne: targetSiteId } });
      if (codeClash) {
        return res.status(409).json({
          error: `Site code '${newCode}' is already taken by another site.`,
          field: 'code',
        });
      }
    }
    const memClash = store.sites.find((s) => s.code?.toUpperCase() === newCode && s.id !== targetSiteId);
    if (memClash) {
      return res.status(409).json({
        error: `Site code '${newCode}' is already taken by another site.`,
        field: 'code',
      });
    }
  }

  const updates: any = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (companyName !== undefined) updates.companyName = String(companyName).trim();
  if (code !== undefined) updates.code = String(code).trim().toUpperCase();
  if (location !== undefined) updates.location = String(location).trim();
  if (industry !== undefined) updates.industry = String(industry).trim();
  if (timezone !== undefined) updates.timezone = String(timezone).trim();
  if (status !== undefined) updates.status = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  updates.updatedAt = new Date();

  // Persist to MongoDB
  let updatedDoc: any = null;
  if (mongoose.connection.readyState === 1) {
    updatedDoc = await SiteModel.findOneAndUpdate(
      { $or: [{ siteId: targetSiteId }, { code: existingSite.code }] },
      { $set: updates },
      { new: true }
    ).lean();
  }

  // Update in-memory
  const memIdx = store.sites.findIndex((s) => s.id === targetSiteId || s.code === existingSite.code);
  if (memIdx !== -1) {
    store.sites[memIdx] = {
      ...store.sites[memIdx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  const finalSite = updatedDoc || store.sites[memIdx] || { ...existingSite, ...updates };
  const stats = await getSiteStats(finalSite.siteId || finalSite.id, finalSite.code);

  await AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SITE_UPDATED',
    resourceType: 'SITE',
    resourceId: targetSiteId,
    siteId: targetSiteId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    before: oldSnapshot,
    after: finalSite,
  });

  socketService.emitSiteUpdated(finalSite);

  res.json({
    success: true,
    message: 'Site updated successfully',
    site: {
      id: finalSite.siteId || finalSite.id,
      siteId: finalSite.siteId || finalSite.id,
      companyName: finalSite.companyName,
      name: finalSite.name,
      code: finalSite.code,
      location: finalSite.location,
      industry: finalSite.industry,
      timezone: finalSite.timezone,
      status: finalSite.status,
      zoneCount: stats.zoneCount,
      cameraCount: stats.cameraCount,
    },
  });
});

// DELETE /api/sites/:id - Delete Temporary/Test Site (Admin Only)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  // Protect the baseline primary plant
  if (id === 'site-rsp-1' || id === 'RSP-ZB-01') {
    return res.status(403).json({
      error: 'Cannot delete primary operational site (Rourkela Steel Plant).',
      code: 'PRIMARY_SITE_PROTECTED',
    });
  }

  let siteToDelete: any = null;
  if (mongoose.connection.readyState === 1) {
    siteToDelete = await SiteModel.findOne({
      $or: [{ siteId: id }, { code: id }],
    }).lean();
  }
  if (!siteToDelete) {
    siteToDelete = store.sites.find((s) => s.id === id || s.code === id);
  }

  if (!siteToDelete) {
    return res.status(404).json({ error: `Site '${id}' not found`, code: 'SITE_NOT_FOUND' });
  }

  const targetSiteId = siteToDelete.siteId || siteToDelete.id;

  // Check if site has cameras attached
  const stats = await getSiteStats(targetSiteId, siteToDelete.code);
  if (stats.cameraCount > 0) {
    return res.status(400).json({
      error: `Cannot delete site with ${stats.cameraCount} active camera stream(s). Reassign or remove cameras first.`,
      code: 'SITE_HAS_CAMERAS',
    });
  }

  // Delete from MongoDB
  if (mongoose.connection.readyState === 1) {
    await SiteModel.deleteOne({ $or: [{ siteId: targetSiteId }, { code: siteToDelete.code }] });
  }

  // Remove from DataStore
  store.sites = store.sites.filter((s) => s.id !== targetSiteId && s.code !== siteToDelete.code);

  await AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'SITE_DELETED',
    resourceType: 'SITE',
    resourceId: targetSiteId,
    siteId: targetSiteId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    before: siteToDelete,
  });

  socketService.emitSiteDeleted(targetSiteId);

  res.json({
    success: true,
    message: `Site '${siteToDelete.name}' (${siteToDelete.code}) deleted successfully.`,
  });
});

// POST /api/sites/onboarding - Retained for backward compatibility
router.post('/onboarding', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { siteLocation, siteCode, selectedCameras, thresholds } = req.body;

  if (store.sites.length > 0) {
    if (siteLocation) store.sites[0].name = siteLocation;
    if (siteCode) store.sites[0].code = siteCode;

    if (mongoose.connection.readyState === 1) {
      await SiteModel.findOneAndUpdate(
        { siteId: store.sites[0].id },
        {
          $set: {
            name: store.sites[0].name,
            code: store.sites[0].code,
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  res.json({
    success: true,
    message: 'Site configuration updated successfully',
    site: store.sites[0] || null,
    selectedCameras,
    thresholds,
  });
});

export default router;
