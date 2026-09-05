/**
 * ============================================================================
 * The Boundless Canvas — Firebase Configuration & Initialization
 * Firebase Modular SDK v10+ (Firestore & Realtime Database)
 * ============================================================================
 *
 * HOW TO SET UP YOUR FIREBASE PROJECT:
 * 1. Go to https://console.firebase.google.com/ and create a project.
 * 2. Add a Web App and replace the `firebaseConfig` object below with your keys.
 * 3. In the Firebase Console:
 *    - Enable "Cloud Firestore" in Test Mode or with these rules:
 *      rules_version = '2';
 *      service cloud.firestore {
 *        match /databases/{database}/documents {
 *          match /notes/{noteId} {
 *            allow read, create: if true;
 *            allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'expiresAt']);
 *          }
 *        }
 *      }
 *    - Enable "Realtime Database" with these rules:
 *      {
 *        "rules": {
 *          "presence": {
 *            ".read": true,
 *            "$userId": {
 *              ".write": true
 *            }
 *          }
 *        }
 *      }
 *
 * NOTE: If placeholder credentials remain, this file gracefully activates
 * DEMO / SIMULATION MODE so you can explore, create notes, and experience
 * simulated peer cursors immediately without any setup!
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  increment, 
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  onDisconnect, 
  remove 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Placeholder configuration — Replace with your Firebase console project config
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if credentials are placeholders
export const isPlaceholderConfig = (config) => {
  return !config.apiKey || 
         config.apiKey.startsWith("YOUR_") || 
         config.projectId === "YOUR_PROJECT_ID";
};

let app = null;
let db = null;
let rtdb = null;
let isDemoMode = false;

if (isPlaceholderConfig(firebaseConfig)) {
  console.info(
    "%c🌌 The Boundless Canvas%c Running in DEMO / SIMULATED MODE.\nTo connect live global sync, configure real credentials in js/firebase-config.js",
    "color: #818cf8; font-weight: bold; font-size: 13px;",
    "color: #94a3b8; font-size: 11px;"
  );
  isDemoMode = true;
} else {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    rtdb = getDatabase(app);
    console.info("⚡ Connected to Firebase Firestore & Realtime Database!");
  } catch (err) {
    console.warn("Firebase initialization failed, falling back to Demo Mode:", err);
    isDemoMode = true;
  }
}

export {
  app,
  db,
  rtdb,
  isDemoMode,
  // Firestore exports
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  increment,
  serverTimestamp,
  query,
  orderBy,
  // RTDB exports
  ref,
  set,
  onValue,
  onDisconnect,
  remove
};
