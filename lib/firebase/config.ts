import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (works on both client and server)
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

try {
  if (!getApps().length) {
    // Check if config is valid
    if (!firebaseConfig.projectId) {
      console.warn('⚠️ Firebase config eksik! .env.local dosyasını kontrol edin.');
    }
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  // Initialize Firestore (works on both client and server)
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  // Create a minimal app instance to prevent crashes
  if (!getApps().length && firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } else {
    // Fallback: use existing app
    app = getApps()[0];
    db = getFirestore(app);
    auth = getAuth(app);
  }
}

// Connect to emulator if in development (client-side only)
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) {
  try {
    const [host, port] = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST.split(':');
    connectFirestoreEmulator(db, host, parseInt(port));
  } catch (e) {
    // Emulator already connected, ignore
  }
}

export { app, db, auth };

