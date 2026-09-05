<p align="center">
  <img src="assets/logo.png" alt="The Boundless Canvas Logo" width="320" style="border-radius: 24px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);" />
</p>

<h1 align="center">🌌 The Boundless Canvas</h1>

<p align="center">
  <strong>An infinite, dark-mode 2D digital void for honest, ephemeral human connection.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Live%20Authentic-10b981?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/Backend-Firebase%20v10+-f59e0b?style=flat-square" alt="Firebase" />
  <img src="https://img.shields.io/badge/Stack-Vanilla%20HTML5%20%2F%20CSS3%20%2F%20ES6+-3b82f6?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/License-MIT-8b5cf6?style=flat-square" alt="License" />
</p>

A modern, high-performance, single-page infinite 2D digital void built with **vanilla HTML5, CSS3, modern ES6+ JavaScript**, and **Firebase Modular SDK (v10+)**.

Users can pan and zoom endlessly across the void, post anonymous sticky notes at any coordinate, interact with notes to extend or burn their lifespan, watch forgotten thoughts fade into ash, and observe real-time ghost cursors of other connected wanderers.

---

## 🌟 Why It Matters & Purpose

The Boundless Canvas is designed around an intentional digital philosophy:

- **Zero Identity Pressure**: You post with no name, profile, or followers, so you can be completely honest without fear.
- **Emotional Catharsis**: You get a safe place to dump secret thoughts, grief, or late-night feelings and let them go.
- **The Desire to Leave a Mark**: Pinning a note gives you the natural human feeling of saying "I was here."
- **No Algorithmic Stress**: You explore a real spatial map instead of being trapped in an addictive, angry feed.
- **Meaningful Feedback**: Strangers keeping your note alive with +2 hours feels like real empathy, not just empty likes.
- **Natural Closure**: Thoughts fade into ash if forgotten, which stops the burden of a permanent internet record.
- **A Feeling of Togetherness**: Seeing live ghost cursors reminds you that you are not alone in the void.

---

## ✨ Features

### 🌌 Infinite Camera & Rendering Engine
- **Endless Pan & Momentum**: Pan smoothly with physics inertia damping (`Space + Drag`, `Middle-Click Drag`, or touch).
- **Cursor-Centric Zooming**: Smooth wheel and trackpad scaling (`0.1x` to `3.0x`) centered precisely on the cursor.
- **Frustum Culling**: High-performance rendering pipeline maintaining 60 FPS by rendering only visible notes and particles.
- **Dynamic Dot Grid & Horizon**: Subtle coordinate grid that scales with zoom levels and an origin marker at `(0, 0)`.

### 📝 Sticky Notes & Decay Physics
- **Anonymous Note Creation**: Double-click anywhere or press <kbd>N</kbd> to pin a note at exact world coordinates.
- **Curated Palette**: 6 pastel and atmospheric paper colors (Sunlight Yellow, Soft Rose, Fresh Mint, Sky Blue, Lavender, Pitch Charcoal).
- **Decay Physics**: Notes have a default 24-hour lifespan. When under 25% lifetime remaining, they visually fray, darken, and emit floating ember and ash particles.
- **❤️ Like Button (`+2h`)**: Extends a note's lifespan by **+2 hours** with an atomic Firestore increment, spawning a floating green `+2h` badge that drifts upward.
- **🔥 Burn Button (`-10%`)**: Accelerates decay by reducing remaining lifespan by **10%**, spawning a floating red `-10%` badge, triggering an ash/flame shake animation, and releasing an ember burst.
- **Optimistic UI Updates**: Timer readouts update instantaneously in memory before the network write finishes to keep the experience snappy.

### 👻 100% Authentic Realtime Presence
- **Real Ghost Cursors**: Ephemeral presence synchronization powered by Firebase Realtime Database (`presence/{userId}`).
- **Zero Simulation / No Bots**: All visible cursors are authentic connected users; no simulated bot wanderers.
- **Smooth Interpolation**: Throttled broadcasts (45ms) smoothed with linear interpolation (lerping) for fluid movement.
- **Automatic Disconnect Cleanup**: Managed via Firebase's `onDisconnect().remove()`.

### 🪟 Glassmorphism UI & Navigation
- **Floating HUD**: Minimalist top bar with live online wanderer count and real-time `(X, Y, Zoom)` coordinate readout.
- **Floating Dock**: Bottom navigation bar for rapid actions (Pin Thought, Recenter, Zoom, Share View, Why It Matters).
- **Deep-Linking URL Hash**: Instant sharing of exact coordinates and zoom via `#x=...&y=...&z=...`.
- **Purpose & Guide Modal**: Frosted glassmorphism overlay (`backdrop-filter: blur(16px)`, `rgba(15, 23, 42, 0.85)`) with tabbed navigation between *Why It Matters* (featuring glowing celestial markers) and *Navigation & Controls*.

---

## 📁 File Structure

```
boundless-canvas/
├── assets/
│   ├── logo.png            # Application logo
│   ├── logo.svg            # Vector brand mark
│   └── logo-full.svg       # Full brand vector asset
├── index.html              # HTML5 structure, HUD dock, glassmorphism modal, CDN imports
├── style.css               # Vanilla CSS design system, glassmorphism & responsive layouts
├── js/
│   ├── firebase-config.js  # Firebase v10 Modular SDK initialization (Firestore & RTDB)
│   ├── canvas.js           # 2D Camera math, pan/zoom inertia, frustum culling & grid
│   ├── notes.js            # Sticky notes, Firestore sync, decay physics, particles & actions
│   ├── presence.js         # Realtime Database presence & lerped ghost cursors
│   └── app.js              # Coordinator, 60 FPS game loop, modal controls & shortcuts
├── README.md               # Documentation & setup guide
└── .gitignore              # Standard gitignore
```

---

## 🚀 Quick Start

No Node.js, Webpack, or Vite build steps required! Run with any static server:

### Option 1: VS Code Live Server
Right-click `index.html` and select **"Open with Live Server"**.

### Option 2: Python HTTP Server
```bash
python3 -m http.server 3000
```
Then open `http://localhost:3000` in your browser.

---

## 🔥 Firebase Configuration

The app uses Cloud Firestore for persisting sticky notes and Firebase Realtime Database for live presence.

Edit `js/firebase-config.js` to insert your project credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 1. Cloud Firestore Rules
In Firebase Console → **Firestore Database** → **Rules**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read, create: if true;
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'burns', 'expiresAt']);
      allow delete: if false;
    }
  }
}
```

### 2. Realtime Database Rules
In Firebase Console → **Realtime Database** → **Rules**:
```json
{
  "rules": {
    "presence": {
      ".read": true,
      "$userId": {
        ".write": true
      }
    }
  }
}
```

---

## ⌨️ Controls & Shortcuts

| Action | Shortcut / Trigger |
|---|---|
| **Pan Canvas** | <kbd>Space</kbd> + Drag / Middle-Click Drag / Touch Drag |
| **Zoom In / Out** | Mouse Wheel / Trackpad Pinch / <kbd>+</kbd> / <kbd>-</kbd> |
| **Pin New Note** | Double Click on canvas / Press <kbd>N</kbd> / Click **Pin** in dock |
| **Commit Note** | <kbd>Ctrl</kbd> + <kbd>Enter</kbd> or click **Pin** button |
| **Recenter Camera** | Press <kbd>0</kbd> or click **Recenter** |
| **❤️ Like Note** | Click ❤️ on any note overlay (adds **+2h** lifespan) |
| **🔥 Burn Note** | Click 🔥 on any note overlay (reduces **10%** lifespan) |
| **Why It Matters & Guide** | Click <kbd>?</kbd> in dock or press <kbd>?</kbd> on keyboard |
| **Close Modal / Editor** | Press <kbd>Esc</kbd> or click outside the card |
| **Share View Coordinates** | Click **Share View** in dock to copy `#x=...&y=...&z=...` URL |

---

## 📄 License

MIT License — open for community exploration. Pin your thoughts into the void! 🌌
