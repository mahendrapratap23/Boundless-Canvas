/**
 * ============================================================================
 * The Boundless Canvas — Realtime Presence & Ghost Cursors
 * RTDB ephemeral sync, throttled socket broadcasts, lerp smoothing
 * ============================================================================
 */

import {
  rtdb,
  isDemoMode,
  ref,
  set,
  onValue,
  onDisconnect,
  remove
} from './firebase-config.js';

const PSEUDONYMS = [
  'Cosmic Owl', 'Neon Wanderer', 'Visitor from Tokyo', 'Solar Nomad',
  'Lunar Explorer', 'Cyber Mystic', 'Midnight Echo', 'Starlight Drift',
  'Void Surfer', 'Quantum Mirage', 'Aether Pilgrim', 'Nebula Walker',
  'Chronos Weaver', 'Polaris Glider', 'Zenith Nomad', 'Astral Cartographer'
];

const CURSOR_COLORS = [
  '#818cf8', // Indigo
  '#38bdf8', // Sky
  '#34d399', // Emerald
  '#f472b6', // Rose
  '#fbbf24', // Amber
  '#a78bfa', // Purple
  '#fb7185', // Pink
  '#2dd4bf'  // Teal
];

export class PresenceManager {
  constructor(canvasEngine, onOnlineCountChange) {
    this.canvasEngine = canvasEngine;
    this.onOnlineCountChange = onOnlineCountChange;

    // Generate local user anonymous identity
    this.userId = 'user_' + Math.random().toString(36).substring(2, 9);
    this.userName = PSEUDONYMS[Math.floor(Math.random() * PSEUDONYMS.length)];
    this.userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    // Remote cursors map: userId -> { x, y, targetX, targetY, name, color, lastSeen }
    this.remoteCursors = new Map();

    // Throttling state
    this.lastBroadcast = 0;
    this.broadcastInterval = 45; // ms (approx 22 updates/sec)
    this.pendingPos = null;

    // Simulated peers for demo mode
    this.simulatedPeers = [];

    this.init();
  }

  init() {
    this.updateIdentityUI();
    this.bindPointerMovement();

    if (isDemoMode) {
      this.initSimulatedPeers();
    } else {
      this.initRTDBPresence();
    }
  }

  updateIdentityUI() {
    const avatarDot = document.getElementById('user-avatar-dot');
    const nameLabel = document.getElementById('user-pseudonym');

    if (avatarDot) {
      avatarDot.style.backgroundColor = this.userColor;
      avatarDot.style.boxShadow = `0 0 10px ${this.userColor}`;
    }
    if (nameLabel) {
      nameLabel.textContent = `${this.userName} (You)`;
    }
  }

  /* ==========================================================================
     FIREBASE REALTIME DATABASE PRESENCE
     ========================================================================== */

  initRTDBPresence() {
    try {
      const userRef = ref(rtdb, `presence/${this.userId}`);
      const allPresenceRef = ref(rtdb, 'presence');

      // Register clean disconnect
      onDisconnect(userRef).remove();

      // Listen for other users
      onValue(allPresenceRef, (snapshot) => {
        const data = snapshot.val() || {};
        const now = Date.now();
        const activeIds = new Set();

        Object.entries(data).forEach(([uid, val]) => {
          if (uid === this.userId) return; // Skip self

          // Prune stale sessions (> 15 seconds)
          if (now - val.lastActive > 15000) return;

          activeIds.add(uid);

          if (!this.remoteCursors.has(uid)) {
            this.remoteCursors.set(uid, {
              x: val.x,
              y: val.y,
              targetX: val.x,
              targetY: val.y,
              name: val.name || 'Anonymous',
              color: val.color || '#818cf8',
              lastSeen: now
            });
          } else {
            const cursor = this.remoteCursors.get(uid);
            cursor.targetX = val.x;
            cursor.targetY = val.y;
            cursor.name = val.name;
            cursor.color = val.color;
            cursor.lastSeen = now;
          }
        });

        // Remove disconnected cursors
        for (const uid of this.remoteCursors.keys()) {
          if (!activeIds.has(uid)) {
            this.remoteCursors.delete(uid);
          }
        }

        if (this.onOnlineCountChange) {
          this.onOnlineCountChange(this.remoteCursors.size + 1);
        }
      });

      // Initial broadcast
      this.broadcastPosition(0, 0);
    } catch (err) {
      console.warn('Realtime presence init error, falling back to simulated peers:', err);
      this.initSimulatedPeers();
    }
  }

  /* ==========================================================================
     MOVEMENT BROADCAST (THROTTLED)
     ========================================================================== */

  bindPointerMovement() {
    window.addEventListener('pointermove', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      this.pendingPos = worldPos;

      const now = performance.now();
      if (now - this.lastBroadcast >= this.broadcastInterval) {
        this.broadcastPosition(worldPos.x, worldPos.y);
        this.lastBroadcast = now;
      }
    });

    // Cleanup when closing window
    window.addEventListener('beforeunload', () => {
      if (!isDemoMode && rtdb) {
        try {
          const userRef = ref(rtdb, `presence/${this.userId}`);
          remove(userRef);
        } catch (e) {}
      }
    });
  }

  broadcastPosition(worldX, worldY) {
    if (isDemoMode || !rtdb) return;

    try {
      const userRef = ref(rtdb, `presence/${this.userId}`);
      set(userRef, {
        x: Math.round(worldX),
        y: Math.round(worldY),
        name: this.userName,
        color: this.userColor,
        lastActive: Date.now()
      });
    } catch (e) {
      // Ignored for network blips
    }
  }

  /* ==========================================================================
     SIMULATED EXPLORER PEERS (DEMO MODE)
     ========================================================================== */

  initSimulatedPeers() {
    const names = ['Neon Wanderer', 'Visitor from Tokyo', 'Cosmic Owl', 'Solar Nomad'];
    const colors = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24'];

    this.simulatedPeers = names.map((name, i) => ({
      id: `sim_${i}`,
      name: name,
      color: colors[i % colors.length],
      x: (Math.random() - 0.5) * 600,
      y: (Math.random() - 0.5) * 400,
      targetX: (Math.random() - 0.5) * 600,
      targetY: (Math.random() - 0.5) * 400,
      nextMoveTime: performance.now() + Math.random() * 2000
    }));

    if (this.onOnlineCountChange) {
      this.onOnlineCountChange(this.simulatedPeers.length + 1);
    }
  }

  updateSimulatedPeers() {
    const now = performance.now();
    for (const peer of this.simulatedPeers) {
      // Pick new wander target when time elapses
      if (now >= peer.nextMoveTime) {
        peer.targetX = peer.x + (Math.random() - 0.5) * 350;
        peer.targetY = peer.y + (Math.random() - 0.5) * 250;
        peer.nextMoveTime = now + 1800 + Math.random() * 3200;
      }

      // Smooth step towards target
      peer.x += (peer.targetX - peer.x) * 0.04;
      peer.y += (peer.targetY - peer.y) * 0.04;
    }
  }

  /* ==========================================================================
     CURSOR RENDERING & SMOOTH LERP
     ========================================================================== */

  renderCursors(ctx) {
    const zoom = this.canvasEngine.camera.zoom;

    // Render Real Remote Cursors
    for (const [uid, cursor] of this.remoteCursors.entries()) {
      // Interpolate smoothly toward target
      cursor.x += (cursor.targetX - cursor.x) * 0.22;
      cursor.y += (cursor.targetY - cursor.y) * 0.22;

      this.drawSingleCursor(ctx, cursor.x, cursor.y, cursor.name, cursor.color, zoom);
    }

    // Render Simulated Peers in Demo Mode
    if (isDemoMode) {
      this.updateSimulatedPeers();
      for (const peer of this.simulatedPeers) {
        this.drawSingleCursor(ctx, peer.x, peer.y, peer.name, peer.color, zoom);
      }
    }
  }

  drawSingleCursor(ctx, worldX, worldY, name, color, zoom) {
    // Frustum check: skip if far outside screen
    if (!this.canvasEngine.isInViewport(worldX, worldY, 40, 40, 100)) {
      return;
    }

    const screenPos = this.canvasEngine.worldToScreen(worldX, worldY);

    ctx.save();

    // 1. Draw Sleek Vector Cursor Arrow
    ctx.translate(screenPos.x, screenPos.y);

    // Glowing subtle shadow under cursor
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(4.5, 14);
    ctx.lineTo(8.5, 22);
    ctx.lineTo(12, 20.5);
    ctx.lineTo(8, 12.5);
    ctx.lineTo(14, 12);
    ctx.closePath();
    ctx.fill();

    // Crisp white border
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 2. Draw Pseudonym Pill Label
    const fontSize = 11;
    ctx.font = `600 ${fontSize}px "Inter", sans-serif`;
    const labelPaddingX = 8;
    const labelHeight = 20;
    const textMetrics = ctx.measureText(name);
    const labelWidth = textMetrics.width + labelPaddingX * 2;

    const labelX = 14;
    const labelY = 16;

    // Pill background
    ctx.beginPath();
    this.roundRect(ctx, labelX, labelY, labelWidth, labelHeight, labelHeight / 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pill text (crisp dark text for readability on pastel backgrounds)
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(name, labelX + labelWidth / 2, labelY + labelHeight / 2 + 1);

    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}
