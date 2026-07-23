"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import {
  getDatabase,
  connectDatabaseEmulator,
  type Database,
} from "firebase/database";
import {
  getFunctions,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import {
  firebaseConfig,
  functionsRegion,
  useFirebaseEmulators,
} from "./config";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let rtdb: Database | undefined;
let functions: Functions | undefined;
let emulatorsConnected = false;

function ensureApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(ensureApp());
    maybeConnectEmulators();
  }
  return auth;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(ensureApp());
    maybeConnectEmulators();
  }
  return db;
}

export function getRtdb(): Database {
  if (!rtdb) {
    rtdb = getDatabase(ensureApp());
    maybeConnectEmulators();
  }
  return rtdb;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(ensureApp(), functionsRegion);
    maybeConnectEmulators();
  }
  return functions;
}

function maybeConnectEmulators(): void {
  if (emulatorsConnected || !useFirebaseEmulators) return;
  if (typeof window === "undefined") return;

  const authInstance = auth ?? getAuth(ensureApp());
  const dbInstance = db ?? getFirestore(ensureApp());
  const rtdbInstance = rtdb ?? getDatabase(ensureApp());
  const fnInstance = functions ?? getFunctions(ensureApp(), functionsRegion);

  connectAuthEmulator(authInstance, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  connectDatabaseEmulator(rtdbInstance, "127.0.0.1", 9000);
  connectFunctionsEmulator(fnInstance, "127.0.0.1", 5001);
  emulatorsConnected = true;
}
