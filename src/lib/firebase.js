import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Configuración consumida desde variables de entorno de Vite
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// Usar Vercel Rewrites para evadir AdBlockers (enrutando al mismo dominio)
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const db = initializeFirestore(app, {
  host: isLocalhost ? 'firestore.googleapis.com' : window.location.host,
  ssl: true,
  experimentalForceLongPolling: true // Ayuda con los proxies serverless
});

export const auth = getAuth(app);
