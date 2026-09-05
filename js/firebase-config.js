/**
 * ============================================================================
 * The Boundless Canvas — Firebase Configuration & Initialization
 * Firebase Modular SDK v10+ (Firestore & Realtime Database)
 * ============================================================================
 *
 * FIRESTORE SECURITY RULES:
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /notes/{noteId} {
 *         allow read, create: if true;
 *         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'expiresAt']);
 *       }
 *     }
 *   }
 *
 * REALTIME DATABASE RULES:
 *   {
 *     "rules": {
 *       "presence": {
 *         ".read": true,
 *         "$userId": {
 *           ".write": true
 *         }
 *       }
 *     }
 *   }
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

// Live Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDLK00ZhsN2gxsA1VliYD77tCBknBu5SBU",
  authDomain: "boundless-canvas-web.firebaseapp.com",
  databaseURL: "https://boundless-canvas-web-default-rtdb.firebaseio.com",
  projectId: "boundless-canvas-web",
  storageBucket: "boundless-canvas-web.firebasestorage.app",
  messagingSenderId: "1078852641608",
  appId: "1:1078852641608:web:10e369ab229c6b5c3f497d",
  measurementId: "G-B8R939WPEB"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

console.info(
  "%c🌌 Boundless Canvas%c Connected to Firebase — Firestore + Realtime Database live!",
  "color: #818cf8; font-weight: bold; font-size: 13px;",
  "color: #34d399; font-size: 11px;"
);

export {
  app,
  db,
  rtdb,
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
