import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Role } from '../types';
import { api } from '../services/api';
import { signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';

interface AuthContextType {
  user: User | null;
  token: string | null;
  role: Role | null;
  permissions: string[];
  siteScope: string[];
  zoneScope: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (roles: Role | Role[]) => boolean;
  isInScope: (siteId?: string, zoneId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('safevision_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('safevision_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    fbSignOut(auth).catch(() => {});
    setToken(null);
    setUser(null);
    localStorage.removeItem('safevision_token');
    localStorage.removeItem('safevision_user');
  }, []);

  useEffect(() => {
    if (token) {
      api.getProfile()
        .then(({ user }) => {
          setUser(user);
          localStorage.setItem('safevision_user', JSON.stringify(user));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token, logout]);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const data = await api.login(email, password);
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('safevision_token', data.token);
      localStorage.setItem('safevision_user', JSON.stringify(data.user));
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<User> => {
    setIsLoading(true);
    try {
      const userCred = await signInWithPopup(auth, googleProvider);
      const fbUser = userCred.user;
      const idToken = await fbUser.getIdToken(true);

      // Client-side Firestore user profile sync (guarantees profile visibility in Firebase)
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || '',
            photoURL: fbUser.photoURL || '',
            provider: 'google.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            siteIds: ['*'],
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });
        } else {
          await setDoc(
            userRef,
            {
              lastLoginAt: serverTimestamp(),
              displayName: fbUser.displayName || userSnap.data()?.displayName,
              photoURL: fbUser.photoURL || userSnap.data()?.photoURL,
            },
            { merge: true }
          );
        }
      } catch (fsErr: any) {
        console.warn('[Firestore Client Profile Notice]:', fsErr.message);
      }

      // Authoritative backend verification and RBAC session initialization
      const data = await api.loginWithFirebase(idToken);
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('safevision_token', data.token);
      localStorage.setItem('safevision_user', JSON.stringify(data.user));
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('safevision_user', JSON.stringify(updatedUser));
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.getProfile();
      if (res.user) {
        updateUser(res.user);
      }
    } catch (_) {}
  }, [updateUser]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return user.permissions?.includes(permission) || false;
  }, [user]);

  const hasRole = useCallback((allowed: Role | Role[]): boolean => {
    if (!user) return false;
    const list = Array.isArray(allowed) ? allowed : [allowed];
    return list.includes(user.role);
  }, [user]);

  const isInScope = useCallback((siteId?: string, zoneId?: string): boolean => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    if (siteId && !user.siteIds.includes('*') && !user.siteIds.includes(siteId)) {
      return false;
    }
    if (zoneId && !user.zoneIds.includes('*')) {
      const match = user.zoneIds.some(
        (z) => z.toLowerCase() === zoneId.toLowerCase()
      );
      if (!match) return false;
    }
    return true;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role || null,
        permissions: user?.permissions || [],
        siteScope: user?.siteIds || [],
        zoneScope: user?.zoneIds || [],
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        loginWithGoogle,
        logout,
        updateUser,
        refreshProfile,
        hasPermission,
        hasRole,
        isInScope,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
