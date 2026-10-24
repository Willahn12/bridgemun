"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

/* Browser-side Firebase client. These keys only identify the project: everything a signed-in
   user can read or write is enforced by firestore.rules, not by keeping this secret. */
let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/* `npm run dev:emu` sets this: everything goes to the local Auth and Firestore emulators under a
   throwaway "demo-" project, so test accounts and data never touch the real Firebase project. */
export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
export const EMULATOR_PROJECT = "demo-bridgemun";

function firebaseApp(): FirebaseApp {
  if (!app) {
    const config = USE_EMULATORS ? { apiKey: "demo-key", projectId: EMULATOR_PROJECT } : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    if (!config.apiKey || !config.projectId) throw new Error("Firebase is not configured. Check .env.local.");
    app = getApps()[0] ?? initializeApp(config);
  }
  return app;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(firebaseApp());
    if (USE_EMULATORS) connectAuthEmulator(authInstance, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(firebaseApp());
    if (USE_EMULATORS) connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  }
  return dbInstance;
}
