import { initializeApp, getApps, App, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth, DecodedIdToken, Auth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

let firebaseApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (!firebaseApp) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseApp = existingApps[0]!;
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'safevision-6c0df';

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          firebaseApp = initializeApp({
            credential: applicationDefault(),
            projectId,
          });
        } catch (err: any) {
          console.warn('[FirebaseAdmin] applicationDefault notice:', err.message);
          firebaseApp = initializeApp({ projectId });
        }
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          firebaseApp = initializeApp({
            credential: cert(sa),
            projectId: sa.project_id || projectId,
          });
        } catch (err: any) {
          console.warn('[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT parse notice:', err.message);
          firebaseApp = initializeApp({ projectId });
        }
      } else {
        firebaseApp = initializeApp({ projectId });
      }
      console.log(`[FirebaseAdmin] Initialized for project '${projectId}'`);
    }
  }
  return firebaseApp;
}

export function getAdminAuth(): Auth {
  const app = getFirebaseAdmin();
  return getAuth(app);
}

export function getAdminFirestore(): Firestore {
  const app = getFirebaseAdmin();
  return getFirestore(app);
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  const auth = getAdminAuth();
  return await auth.verifyIdToken(token);
}

export async function syncFirestoreUser(profile: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider?: string;
  role: string;
  status: string;
  siteIds: string[];
  idToken?: string;
}): Promise<void> {
  // 1. Try Firebase Admin Firestore SDK
  try {
    const firestore = getAdminFirestore();
    const userRef = firestore.collection('users').doc(profile.uid);
    const docSnap = await userRef.get().catch(() => null);

    if (!docSnap || !docSnap.exists) {
      await userRef.set({
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName || '',
        photoURL: profile.photoURL || '',
        provider: profile.provider || 'google.com',
        role: profile.role || 'EMPLOYEE',
        status: profile.status || 'ACTIVE',
        siteIds: profile.siteIds || ['*'],
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
      console.log(`[Firestore] Created profile users/${profile.uid}`);
    } else {
      await userRef.update({
        lastLoginAt: FieldValue.serverTimestamp(),
        displayName: profile.displayName || docSnap.data()?.displayName,
        photoURL: profile.photoURL || docSnap.data()?.photoURL,
      });
      console.log(`[Firestore] Updated lastLoginAt for users/${profile.uid}`);
    }
    return;
  } catch (adminErr: any) {
    console.warn('[Firestore Admin Notice]:', adminErr.message);
  }

  // 2. Fallback to Firestore REST API with the user's verified ID Token
  if (profile.idToken) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'safevision-6c0df';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${profile.uid}`;
      const nowIso = new Date().toISOString();

      const fields: Record<string, any> = {
        uid: { stringValue: profile.uid },
        email: { stringValue: profile.email },
        displayName: { stringValue: profile.displayName || '' },
        photoURL: { stringValue: profile.photoURL || '' },
        provider: { stringValue: profile.provider || 'google.com' },
        role: { stringValue: profile.role || 'EMPLOYEE' },
        status: { stringValue: profile.status || 'ACTIVE' },
        siteIds: { arrayValue: { values: (profile.siteIds || ['*']).map((s) => ({ stringValue: s })) } },
        lastLoginAt: { timestampValue: nowIso },
      };

      const res = await fetch(`${url}?updateMask.fieldPaths=lastLoginAt&updateMask.fieldPaths=displayName&updateMask.fieldPaths=photoURL`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${profile.idToken}`,
        },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok && res.status === 404) {
        fields.createdAt = { timestampValue: nowIso };
        await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${profile.idToken}`,
          },
          body: JSON.stringify({ fields }),
        });
      }
      console.log(`[Firestore REST] Successfully synchronized users/${profile.uid}`);
    } catch (restErr: any) {
      console.warn('[Firestore REST Notice]:', restErr.message);
    }
  }
}
