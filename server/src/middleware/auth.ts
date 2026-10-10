import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { DataStore, UserDoc } from '../models/DataStore';
import { Role, Permission } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';

import { verifyFirebaseIdToken } from '../config/firebase';
import { UserModel } from '../models/mongooseModels';
import { ROLE_PERMISSIONS } from '../security/permissions';

export interface AuthRequest extends Request {
  user?: UserDoc;
}

export function generateToken(user: UserDoc): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
      siteIds: user.siteIds,
      zoneIds: user.zoneIds,
    },
    ENV.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 1. Authentication Middleware - Authenticates Firebase ID Token or legacy JWT
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in with corporate credentials or Google SSO.',
      code: 'UNAUTHENTICATED',
    });
  }

  const store = DataStore.getInstance();

  // A. Try Firebase ID Token verification
  try {
    const decodedFb = await verifyFirebaseIdToken(token);
    if (decodedFb && decodedFb.uid) {
      const email = decodedFb.email?.toLowerCase();
      let user = store.users.find(
        (u) => u.firebaseUid === decodedFb.uid || (email && u.email.toLowerCase() === email)
      );

      if (!user) {
        // First-time user creation: default safe role EMPLOYEE
        const uid = decodedFb.uid;
        const newUserName = decodedFb.name || (email ? email.split('@')[0] : 'Operator');
        user = {
          id: uid,
          firebaseUid: uid,
          name: newUserName,
          email: email || `${uid}@safevision.local`,
          photoURL: decodedFb.picture || undefined,
          provider: 'google.com',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
          siteIds: ['*'],
          zoneIds: ['*'],
          teamIds: [],
          department: 'Operations',
          shift: 'Shift A',
          permissions: ROLE_PERMISSIONS['EMPLOYEE'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };
        store.users.push(user);

        UserModel.create({
          name: user.name,
          email: user.email,
          firebaseUid: user.firebaseUid,
          photoURL: user.photoURL,
          provider: 'google.com',
          role: user.role,
          department: user.department,
          siteIds: user.siteIds,
          zoneIds: user.zoneIds,
          status: user.status,
          lastLogin: new Date(),
        }).catch((err) => console.warn('[MongoDB User Creation Notice]:', err.message));
      } else {
        if (!user.firebaseUid) user.firebaseUid = decodedFb.uid;
        if (decodedFb.picture) user.photoURL = decodedFb.picture;
        user.provider = 'google.com';
        user.lastLogin = new Date().toISOString();
        user.updatedAt = user.lastLogin;

        UserModel.updateOne(
          { email: user.email },
          { $set: { firebaseUid: user.firebaseUid, photoURL: user.photoURL, provider: 'google.com', lastLogin: new Date() } }
        ).catch(() => {});
      }

      if (user.status === 'DISABLED') {
        AuditLogger.log({
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'SECURITY_ACCESS_DENIED',
          resourceType: 'AUTH',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          result: 'DENIED',
          metadata: { reason: 'Account disabled' },
        });
        return res.status(403).json({
          error: 'User account has been disabled by security administrator.',
          code: 'ACCOUNT_DISABLED',
        });
      }

      req.user = user;
      return next();
    }
  } catch (_fbErr) {
    // Proceed to legacy JWT verification
  }

  // B. Fallback to Legacy JWT verification
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    const user = store.users.find((u) => u.id === decoded.id || (decoded.email && u.email.toLowerCase() === decoded.email.toLowerCase()));

    if (!user) {
      return res.status(401).json({
        error: 'Session invalid or user record not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.status === 'DISABLED') {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'AUTH',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: { reason: 'Account disabled' },
      });
      return res.status(403).json({
        error: 'User account has been disabled by security administrator.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'Session expired or token signature invalid.',
      details: err.message,
      code: 'INVALID_TOKEN',
    });
  }
}

// Alias for backwards compatibility with existing route imports
export const authenticateToken = authenticate;

// 2. Role-Based Access Control Middleware - Returns 403 on role mismatch
export function requireRole(...allowedRoles: (Role | Role[])[]) {
  const roles = allowedRoles.flat();

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      AuditLogger.log({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'ROUTE',
        resourceId: req.originalUrl,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: {
          requiredRoles: roles,
          actualRole: req.user.role,
          url: req.originalUrl,
        },
      });

      return res.status(403).json({
        error: `Access denied. Requires role: [${roles.join(' or ')}]. Your current role is [${req.user.role}].`,
        code: 'ROLE_FORBIDDEN',
      });
    }

    next();
  };
}

// 3. Permission-Based Access Control Middleware - Returns 403 on missing permission
export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Admin has universal permission bypass
    if (req.user.role === 'ADMIN' || req.user.permissions.includes(permission)) {
      return next();
    }

    AuditLogger.log({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'SECURITY_ACCESS_DENIED',
      resourceType: 'PERMISSION',
      resourceId: permission,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'DENIED',
      metadata: {
        missingPermission: permission,
        url: req.originalUrl,
      },
    });

    return res.status(403).json({
      error: `Access denied. Missing required permission: '${permission}'.`,
      code: 'PERMISSION_FORBIDDEN',
    });
  };
}

// 4. Scope-Based Access Control Middleware (Site & Zone Scoping)
export function requireScope(scopeType: 'site' | 'zone') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Admin has global scope
    if (req.user.role === 'ADMIN' || req.user.siteIds.includes('*') || req.user.zoneIds.includes('*')) {
      return next();
    }

    const requestedZone = req.params.zoneId || req.query.zone || req.body?.zone;
    const requestedSite = req.params.siteId || req.query.site || req.body?.siteId;

    if (scopeType === 'zone' && requestedZone) {
      const allowed = req.user.zoneIds.some(
        (z) => z.toLowerCase() === String(requestedZone).toLowerCase()
      );
      if (!allowed) {
        AuditLogger.log({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'SECURITY_ACCESS_DENIED',
          resourceType: 'ZONE_SCOPE',
          resourceId: String(requestedZone),
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          result: 'DENIED',
          metadata: { allowedZones: req.user.zoneIds, requestedZone },
        });

        return res.status(403).json({
          error: `Scope denied. You are not authorized to access zone '${requestedZone}'. Authorized zones: [${req.user.zoneIds.join(', ')}].`,
          code: 'ZONE_SCOPE_FORBIDDEN',
        });
      }
    }

    next();
  };
}
