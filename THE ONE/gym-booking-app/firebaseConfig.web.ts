import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCTEiKfNklaxEXMEQ_8MsP5motk6JnNuVA",
  authDomain: "the-one-38b36.firebaseapp.com",
  projectId: "the-one-38b36",
  storageBucket: "the-one-38b36.firebasestorage.app",
  messagingSenderId: "502992390630",
  appId: "1:502992390630:web:869c2c9bc5c54fefefae27",
  measurementId: "G-MPQ6GYKEN0"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
