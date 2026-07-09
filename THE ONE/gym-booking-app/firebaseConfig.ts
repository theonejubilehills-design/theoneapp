import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCTEiKfNklaxEXMEQ_8MsP5motk6JnNuVA",
  authDomain: "the-one-38b36.firebaseapp.com",
  projectId: "the-one-38b36",
  storageBucket: "the-one-38b36.firebasestorage.app",
  messagingSenderId: "502992390630",
  appId: "1:502992390630:web:869c2c9bc5c54fefefae27",
  measurementId: "G-MPQ6GYKEN0"
};

// Initialize Firebase Web SDK for Firestore database (which is cross-platform JS SDK)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// Initialize Auth conditionally to prevent compilation and runtime errors across platforms
let auth: any;
try {
  if (Platform.OS === 'web') {
    const { getAuth } = require('firebase/auth');
    auth = getAuth(app);
  } else {
    try {
      // Try native Firebase Auth first (for custom native standalone builds)
      // @ts-ignore
      const nativeAuth = require('@react-native-firebase/auth').default;
      auth = nativeAuth();
    } catch (e) {
      console.warn('[FirebaseConfig] Native @react-native-firebase/auth not found. Falling back to Web Auth JS SDK (required for Expo Go)...');
      
      try {
        // Safe check: get existing auth instance to prevent crash on HMR reloads
        const { getAuth } = require('firebase/auth');
        auth = getAuth(app);
      } catch (authErr) {
        // If not initialized, initialize it with AsyncStorage persistence
        const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        auth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage as any),
        });
      }
    }
  }
} catch (error) {
  console.warn('[FirebaseConfig] Auth initialization failed:', error);
}

export { auth };
