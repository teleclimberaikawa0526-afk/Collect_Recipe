import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCAfDZ11mobL4m-1obXcGcrYIOzSBTZOTo",
  authDomain: "collectrecipe-cce31.firebaseapp.com",
  projectId: "collectrecipe-cce31",
  storageBucket: "collectrecipe-cce31.firebasestorage.app",
  messagingSenderId: "934267002111",
  appId: "1:934267002111:web:23b82896817ce13051c0ca",
  measurementId: "G-WZTQRYQ7CM"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with React Native persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };
