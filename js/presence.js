/**
 * ============================================================================
 * The Boundless Canvas — Realtime Presence & Ghost Cursors
 * Firebase RTDB ephemeral sync, throttled broadcasts, lerp smoothing
 * 100% authentic — no simulated peers
 * ============================================================================
 */

import {
  rtdb,
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
  'Chronos Weaver', 'Polaris Glider', 'Zenith Nomad', 'Astral Cartographer',
  'Deep Horizon', 'Phantom Beacon', 'Eclipse Drifter', 'Nova Pathfinder'
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

    // Generate local user anonymous identity (persistent across page reloads within session)
    this.userId = this.getOrCreateUserId();
    this.userName = PSEUDONYMS[Math.floor(Math.random() * PSEUDONYMS.length)];
    this.userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    // Remote cursors map: userId -> { x, y, targetX, targetY, name, color, lastSeen }
    this.remoteCursors = new Map();

    // Throttling state
    this.lastBroadcast = 0;
    this.broadcastInterval = 45; // ms (~22 updates/sec)

    this.init();
  }

  /**
   * Create or retrieve a stable session ID so the same tab
   * doesn't register multiple presence entries on reload.
   */
  getOrCreateUserId() {
    let id = sessionStorage.getItem('boundless_canvas_uid');
    if (!id) {
      id = 'user_' + crypto.randomUUID().split('-')[0];
      sessionStorage.setItem('boundless_canvas_uid', id);
    }
    return id;
  }

  init() {
    this.updateIdentityUI();
    this.initRTDBPresence();
    this.bindPointerMovement();
  }

  updateIdentityUI() {
    const avatarDot = document.getElementById('user-avatar-dot');
    const nameLabel = document.getElementById('user-pseudonym');

    if (avatarDot) {
      avatarDot.style.backgroundColor = this.userColor;
      avatarDot.style.boxShadow = `0 0 10px ${this.userColor}`;
    }
    if (nameLabel) {
      nameLabel.textContent = this.userName;
    }
  }

  /* ==========================================================================
     FIREBASE REALTIME DATABASE PRESENCE
     ========================================================================== */

  initRTDBPresence() {
    const userRef = ref(rtdb, `presence/${this.userId}`);
    const allPresenceRef = ref(rtdb, 'presence');

    // Register clean disconnect so our entry is removed when we leave
    onDisconnect(userRef).remove();

    // Write initial presence immediately
    set(userRef, {
      x: 0,
      y: 0,
      name: this.userName,
      color: this.userColor,
      lastActive: Date.now()
    });

    // Listen for all users' presence data
    onValue(allPresenceRef, (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();
      const activeIds = new Set();

      Object.entries(data).forEach(([uid, val]) => {
        if (uid === this.userId) return; // Skip our own cursor

        // Prune stale sessions (> 30 seconds without update)
        if (now - val.lastActive > 30000) return;

        activeIds.add(uid);

        if (!this.remoteCursors.has(uid)) {
          // New peer joined — initialize their cursor
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
          // Existing peer moved — update their target for lerping
          const cursor = this.remoteCursors.get(uid);
          cursor.targetX = val.x;
          cursor.targetY = val.y;
          cursor.name = val.name;
          cursor.color = val.color;
          cursor.lastSeen = now;
        }
      });

      // Remove peers who disconnected
      for (const uid of this.remoteCursors.keys()) {
        if (!activeIds.has(uid)) {
          this.remoteCursors.delete(uid);
        }
      }

      // Update the live online count (remote peers + self)
      if (this.onOnlineCountChange) {
        this.onOnlineCountChange(this.remoteCursors.size + 1);
      }
    });
  }

  /* ==========================================================================
     MOVEMENT BROADCAST (THROTTLED)
     ========================================================================== */

  bindPointerMovement() {
    window.addEventListener('pointermove', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);

      const now = performance.now();
      if (now - this.lastBroadcast >= this.broadcastInterval) {
        this.broadcastPosition(worldPos.x, worldPos.y);
        this.lastBroadcast = now;
      }
    });

    // Explicit cleanup when the user closes/refreshes the tab
    window.addEventListener('beforeunload', () => {
      try {
        const userRef = ref(rtdb, `presence/${this.userId}`);
        remove(userRef);
      } catch (e) {
        // Silently ignore — onDisconnect handles this server-side too
      }
    });
  }

  broadcastPosition(worldX, worldY) {
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
      // Silently ignore transient network errors
    }
  }

  /* ==========================================================================
     CURSOR RENDERING & SMOOTH LERP
     ========================================================================== */

  renderCursors(ctx) {
    // Render only real remote peer cursors
    for (const [uid, cursor] of this.remoteCursors.entries()) {
      // Smoothly interpolate toward latest known position
      cursor.x += (cursor.targetX - cursor.x) * 0.22;
      cursor.y += (cursor.targetY - cursor.y) * 0.22;

      this.drawSingleCursor(ctx, cursor.x, cursor.y, cursor.name, cursor.color);
    }
  }

  drawSingleCursor(ctx, worldX, worldY, name, color) {
    // Frustum check: skip if far outside screen
    if (!this.canvasEngine.isInViewport(worldX, worldY, 40, 40, 100)) {
      return;
    }

    const screenPos = this.canvasEngine.worldToScreen(worldX, worldY);

    ctx.save();

    // 1. Draw sleek vector cursor arrow
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

    // 2. Draw pseudonym pill label
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

    // Pill text
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
