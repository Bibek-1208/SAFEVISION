import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { DataStore } from '../models/DataStore';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { verifyFirebaseIdToken, syncFirestoreUser } from '../config/firebase';
import { UserModel } from '../models/mongooseModels';
import { ROLE_PERMISSIONS } from '../security/permissions';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();
const store = DataStore.getInstance();

const profilesDir = path.resolve(__dirname, '../../uploads/profiles');
if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilesDir);
  },
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user?.id ? req.user.id.replace(/[^a-zA-Z0-9_-]/g, '') : 'user';
    const safeName = `avatar-${userId}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const profileUpload = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are allowed.`));
    }
  },
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

// POST /api/auth/login - Corporate Email + Password ONLY (Backend Determines Role)
router.post('/login', async (req: Request, res: Response) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid email or password format.' });
  }

  const { email, password } = result.data;
  const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    AuditLogger.log({
      userId: 'UNKNOWN',
      userEmail: email,
      userRole: 'UNAUTHENTICATED',
      action: 'USER_LOGIN_FAILED',
      resourceType: 'AUTH',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'FAILED',
      metadata: { reason: 'User not found' },
    });
    return res.status(401).json({ error: 'Invalid corporate credentials.' });
  }

  // Cryptographic password hash verification
  const isMatch = user.passwordHash ? bcrypt.compareSync(password, user.passwordHash) : false;
  if (!isMatch) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'USER_LOGIN_FAILED',
      resourceType: 'AUTH',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'FAILED',
      metadata: { reason: 'Incorrect password' },
    });
    return res.status(401).json({ error: 'Invalid corporate credentials.' });
  }

  if (user.status === 'DISABLED') {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'USER_LOGIN_BLOCKED',
      resourceType: 'AUTH',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'DENIED',
      metadata: { reason: 'Account disabled' },
    });
    return res.status(403).json({ error: 'User account has been disabled by security administrator.' });
  }

  // Update last login
  user.lastLogin = new Date().toISOString();
  user.updatedAt = user.lastLogin;

  const token = generateToken(user);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'USER_LOGIN',
    resourceType: 'AUTH',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    metadata: { role: user.role, siteIds: user.siteIds, zoneIds: user.zoneIds },
  });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      siteIds: user.siteIds,
      zoneIds: user.zoneIds,
      teamIds: user.teamIds,
      workerId: user.workerId,
      department: user.department,
      shift: user.shift,
      permissions: user.permissions,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      photoURL: user.photoURL ?? null,
    },
  });
});

// POST /api/auth/firebase-login - Authoritative Google Sign-In via Firebase Authentication
router.post('/firebase-login', async (req: Request, res: Response) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid Firebase idToken.' });
  }

  try {
    const decodedFb = await verifyFirebaseIdToken(idToken);
    const email = decodedFb.email?.toLowerCase();
    const uid = decodedFb.uid;

    if (!uid) {
      return res.status(401).json({ error: 'Invalid Firebase authentication payload: missing UID.' });
    }

    let user = store.users.find(
      (u) => u.firebaseUid === uid || (email && u.email.toLowerCase() === email)
    );

    if (!user) {
      // First-time user: default safe role EMPLOYEE
      const name = decodedFb.name || (email ? email.split('@')[0] : 'Operator');
      user = {
        id: uid,
        firebaseUid: uid,
        name,
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
        firebaseUid: uid,
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
      // Retain existing role and permissions! Link UID & update lastLogin
      if (!user.firebaseUid) user.firebaseUid = uid;
      if (decodedFb.picture) user.photoURL = decodedFb.picture;
      user.provider = 'google.com';
      user.lastLogin = new Date().toISOString();
      user.updatedAt = user.lastLogin;

      UserModel.updateOne(
        { email: user.email },
        { $set: { firebaseUid: uid, photoURL: user.photoURL, provider: 'google.com', lastLogin: new Date() } }
      ).catch(() => {});
    }

    if (user.status === 'DISABLED') {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'USER_LOGIN_BLOCKED',
        resourceType: 'AUTH',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: { reason: 'Account disabled' },
      });
      return res.status(403).json({ error: 'User account has been disabled by security administrator.' });
    }

    // Sync Firestore user profile
    syncFirestoreUser({
      uid,
      email: user.email,
      displayName: user.name,
      photoURL: user.photoURL,
      provider: 'google.com',
      role: user.role,
      status: user.status,
      siteIds: user.siteIds,
      idToken,
    }).catch((err) => console.warn('[Firestore Sync Notice]:', err.message));

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'USER_LOGIN',
      resourceType: 'AUTH',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'SUCCESS',
      metadata: { provider: 'google.com', role: user.role, siteIds: user.siteIds },
    });

    return res.json({
      token: idToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        siteIds: user.siteIds,
        zoneIds: user.zoneIds,
        teamIds: user.teamIds,
        workerId: user.workerId,
        department: user.department,
        shift: user.shift,
        permissions: user.permissions,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        photoURL: user.photoURL ?? null,
      },
    });
  } catch (err: any) {
    console.error('[Firebase Login Error]:', err.message);
    return res.status(401).json({ error: 'Firebase authentication failed: ' + err.message });
  }
});

// GET /api/auth/me - Current User Profile & Effective Scopes
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  return res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      siteIds: req.user.siteIds,
      zoneIds: req.user.zoneIds,
      teamIds: req.user.teamIds,
      workerId: req.user.workerId,
      department: req.user.department,
      shift: req.user.shift,
      permissions: req.user.permissions,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
      photoURL: req.user.photoURL ?? null,
    },
  });
});

// PATCH /api/auth/me/profile - Update current user profile
router.patch('/me/profile', authenticate, (req: AuthRequest, res: Response) => {
  const current = req.user!;
  const user = store.users.find((u) => u.id === current.id);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const { name, department, shift } = req.body;
  const before = { name: user.name, department: user.department, shift: user.shift };

  if (name && typeof name === 'string') user.name = name.trim();
  if (department && typeof department === 'string') user.department = department.trim();
  if (shift && typeof shift === 'string') user.shift = shift.trim();
  user.updatedAt = new Date().toISOString();

  // Also sync with employee record if matching workerId or email
  const emp = store.employees.find(
    (e) => (user.workerId && e.employeeId === user.workerId) || e.email.toLowerCase() === user.email.toLowerCase()
  );
  if (emp) {
    if (name) emp.fullName = user.name;
    if (department) emp.department = user.department;
    if (shift) emp.shift = user.shift;
    emp.updatedAt = user.updatedAt;
  }

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'USER_PROFILE_UPDATED',
    resourceType: 'USER_PROFILE',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    before,
    after: { name: user.name, department: user.department, shift: user.shift },
  });

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      siteIds: user.siteIds,
      zoneIds: user.zoneIds,
      teamIds: user.teamIds,
      workerId: user.workerId,
      department: user.department,
      shift: user.shift,
      permissions: user.permissions,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      photoURL: user.photoURL ?? null,
    },
  });
});

// POST /api/auth/me/avatar - Secure Profile Photo Upload
router.post('/me/avatar', authenticate, (req: AuthRequest, res: Response, next) => {
  profileUpload.single('avatar')(req as any, res as any, (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Avatar upload failed' });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  const current = req.user!;
  const user = store.users.find((u) => u.id === current.id);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  const photoURL = `/uploads/profiles/${file.filename}`;
  const previousPhoto = user.photoURL;
  user.photoURL = photoURL;
  user.updatedAt = new Date().toISOString();

  // Sync with MongoDB if connected
  try {
    const mongoose = await import('mongoose');
    if (mongoose.connection.readyState === 1) {
      await UserModel.updateOne(
        { $or: [{ email: user.email }, { _id: user.id }] },
        { $set: { photoURL, updatedAt: user.updatedAt } }
      );
    }
  } catch (dbErr) {
    console.error('[AuthRoutes] Failed to sync photoURL to MongoDB:', dbErr);
  }

  // Sync with employee roster if matching
  const emp = store.employees.find(
    (e) => (user.workerId && e.employeeId === user.workerId) || e.email.toLowerCase() === user.email.toLowerCase()
  );
  if (emp) {
    emp.photoUrl = photoURL;
    emp.updatedAt = user.updatedAt;
  }

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'USER_AVATAR_UPLOADED',
    resourceType: 'USER_PROFILE',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    metadata: { photoURL, previousPhoto },
  });

  return res.json({
    success: true,
    photoURL,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      siteIds: user.siteIds,
      zoneIds: user.zoneIds,
      teamIds: user.teamIds,
      workerId: user.workerId,
      department: user.department,
      shift: user.shift,
      permissions: user.permissions,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      photoURL: user.photoURL ?? null,
    },
  });
});

export default router;

