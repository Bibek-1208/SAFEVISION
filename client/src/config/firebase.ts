import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB7OfXB7Ej0_My3pXxihQ-6aAn8sz-rmw8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'safevision-6c0df.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'safevision-6c0df',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'safevision-6c0df.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '895198610830',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:895198610830:web:21c652621dbe85fee9d0df',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-YXGHVFSJBW',
};

// Initialize or reuse Firebase App instance
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
