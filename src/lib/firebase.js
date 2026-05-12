import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuración para el nuevo proyecto: real-time-sync-5967a
const firebaseConfig = {
  apiKey: "AIzaSyBf4fo6PAvDByXyrFDp8bn44O1CFK7bscM",
  authDomain: "real-time-sync-5967a.firebaseapp.com",
  projectId: "real-time-sync-5967a",
  storageBucket: "real-time-sync-5967a.firebasestorage.app",
  messagingSenderId: "900742185195",
  appId: "1:900742185195:web:867630da47e3fb1bf9beae",
  measurementId: "G-S31B9CKMYD"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
