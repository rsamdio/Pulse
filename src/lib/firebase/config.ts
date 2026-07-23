/** Public Firebase web config (safe to commit; Auth + rules protect data). */
export const firebaseConfig = {
  apiKey: "AIzaSyC7AThbDKdT3Kcg7GxPXLMxYmvuNPtCABk",
  authDomain: "rotaractpulse.firebaseapp.com",
  databaseURL:
    "https://rotaractpulse-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rotaractpulse",
  storageBucket: "rotaractpulse.firebasestorage.app",
  messagingSenderId: "453006835238",
  appId: "1:453006835238:web:c932b6af99ba12bfbf30e7",
} as const;

/** Keep in sync with Cloud Functions region (near RTDB / users). */
export const functionsRegion = "asia-southeast1";

/**
 * Flip to true only when running `npm run emulators` against local Firebase.
 * Leave false for production and normal `npm run dev` against rotaractpulse.
 */
export const useFirebaseEmulators = false;
