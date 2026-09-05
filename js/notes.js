/**
 * ============================================================================
 * The Boundless Canvas — Sticky Notes & Decay Engine
 * Firestore sync, note rendering, decay physics, ash particles, like/extend,
 * burn mechanic, floating badge animations, shake effects
 * 100% authentic — all data persisted to Cloud Firestore
 * ============================================================================
 */

import {
  db,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  increment
} from './firebase-config.js';

export const NOTE_WIDTH = 220;
export const NOTE_HEIGHT = 160;
export const DEFAULT_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours in ms
export const EXTEND_LIFETIME = 2 * 60 * 60 * 1000;   // 2 hours in ms

export const NOTE_COLORS = [
  { name: 'Sunlight Yellow', hex: '#FEF08A', textHex: '#422006' },
  { name: 'Soft Rose', hex: '#FECDD3', textHex: '#4c0519' },
  { name: 'Fresh Mint', hex: '#A7F3D0', textHex: '#022c22' },
  { name: 'Sky Blue', hex: '#BAE6FD', textHex: '#082f49' },
  { name: 'Lavender', hex: '#DDD6FE', textHex: '#2e1065' },
  { name: 'Pitch Charcoal', hex: '#1E293B', textHex: '#F8FAFC' }
];

export class NotesManager {
  constructor(canvasEngine, showToast) {
    this.canvasEngine = canvasEngine;
    this.showToast = showToast || console.log;

    this.notes = new Map(); // id -> note object
    this.selectedColor = NOTE_COLORS[0].hex;
    this.pendingWorldPos = { x: 0, y: 0 };

    // Floating action badges (drifting "+2h" / "-10%" text particles)
    this.floatingBadges = [];

    // Per-note shake animation state { noteId -> { intensity, decay, offsetX, offsetY } }
    this.noteShakes = new Map();

    // DOM Elements
    this.editorOverlay = document.getElementById('note-editor');
    this.textarea = document.getElementById('note-textarea');
    this.colorPicker = document.getElementById('color-picker');
    this.submitBtn = document.getElementById('editor-submit');
    this.closeBtn = document.getElementById('editor-close');
    this.charCounter = document.getElementById('char-counter');

    this.init();
  }

  init() {
    this.buildColorPicker();
    this.bindEditorEvents();
    this.bindCanvasInteractions();
    this.subscribeToNotes();
  }

  /* ==========================================================================
     COLOR PICKER & EDITOR UI
     ========================================================================== */

  buildColorPicker() {
    this.colorPicker.innerHTML = '';
    NOTE_COLORS.forEach((color, idx) => {
      const dot = document.createElement('button');
      dot.className = `color-dot ${idx === 0 ? 'selected' : ''}`;
      dot.style.backgroundColor = color.hex;
      dot.title = color.name;
      dot.type = 'button';
      dot.addEventListener('click', () => {
        this.colorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        this.selectedColor = color.hex;
      });
      this.colorPicker.appendChild(dot);
    });
  }

  bindEditorEvents() {
    this.textarea.addEventListener('input', () => {
      const remaining = 320 - this.textarea.value.length;
      this.charCounter.textContent = remaining;
    });

    this.submitBtn.addEventListener('click', () => this.submitNote());

    this.closeBtn.addEventListener('click', () => this.hideEditor());

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.submitNote();
      } else if (e.key === 'Escape') {
        this.hideEditor();
      }
    });
  }

  showEditorAt(screenX, screenY, worldX, worldY) {
    this.pendingWorldPos = { x: Math.round(worldX), y: Math.round(worldY) };
    this.textarea.value = '';
    this.charCounter.textContent = '320';

    const editorWidth = 320;
    const editorHeight = 220;
    const clampedX = Math.min(Math.max(screenX, editorWidth / 2 + 10), window.innerWidth - editorWidth / 2 - 10);
    const clampedY = Math.min(Math.max(screenY, editorHeight / 2 + 60), window.innerHeight - editorHeight / 2 - 60);

    this.editorOverlay.style.left = `${clampedX}px`;
    this.editorOverlay.style.top = `${clampedY}px`;
    this.editorOverlay.style.display = 'block';

    setTimeout(() => this.textarea.focus(), 50);
  }

  hideEditor() {
    this.editorOverlay.style.display = 'none';
    this.textarea.value = '';
  }

  /* ==========================================================================
     NOTE CREATION & PERSISTENCE (FIRESTORE)
     ========================================================================== */

  async submitNote() {
    const text = this.textarea.value.trim();
    if (!text) {
      this.showToast('Please enter some text before pinning!', 'alert-circle');
      return;
    }

    const now = Date.now();
    const newNote = {
      x: this.pendingWorldPos.x - NOTE_WIDTH / 2,
      y: this.pendingWorldPos.y - NOTE_HEIGHT / 2,
      text: text,
      color: this.selectedColor,
      createdAt: now,
      expiresAt: now + DEFAULT_LIFETIME,
      likes: 0
    };

    this.hideEditor();

    try {
      await addDoc(collection(db, 'notes'), newNote);
      this.showToast('Thought pinned to the void! 📌', 'check-circle');
    } catch (err) {
      console.error('Error writing note to Firestore:', err);
      this.showToast('Failed to save note — check your connection.', 'alert-triangle');
    }
  }

  /* ==========================================================================
     ❤️ LIKE — EXTEND LIFESPAN BY +2 HOURS
     ========================================================================== */

  async likeNote(noteId) {
    const note = this.notes.get(noteId);
    if (!note) return;

    // Optimistic local update for instant feedback
    note.expiresAt = (note.expiresAt || Date.now()) + EXTEND_LIFETIME;
    note.likes = (note.likes || 0) + 1;

    // Spawn floating green "+2h" badge
    this.spawnFloatingBadge(
      note.x + NOTE_WIDTH / 2,
      note.y + NOTE_HEIGHT / 2,
      '+2h',
      '#22c55e' // Green
    );

    // Emit celebration particles
    for (let i = 0; i < 6; i++) {
      this.canvasEngine.spawnDecayParticle(note.x + NOTE_WIDTH / 2, note.y + NOTE_HEIGHT / 2);
    }

    this.showToast('Lifespan extended by +2 hours! ❤️', 'heart');

    try {
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        expiresAt: increment(EXTEND_LIFETIME),
        likes: increment(1)
      });
    } catch (err) {
      console.warn('Could not sync like to Firestore:', err);
      this.showToast('Could not sync to server — try again.', 'alert-triangle');
    }
  }

  /* ==========================================================================
     🔥 BURN — REDUCE REMAINING LIFESPAN BY 10%
     ========================================================================== */

  async burnNote(noteId) {
    const note = this.notes.get(noteId);
    if (!note) return;

    const now = Date.now();
    const remaining = (note.expiresAt || now) - now;
    
    // Calculate 10% of remaining lifespan
    const burnAmount = Math.max(60000, Math.floor(remaining * 0.10)); // Minimum 1 minute burn

    // Optimistic local update
    note.expiresAt = (note.expiresAt || now) - burnAmount;

    // Spawn floating red "-10%" badge
    this.spawnFloatingBadge(
      note.x + NOTE_WIDTH / 2,
      note.y + NOTE_HEIGHT / 2,
      '-10%',
      '#ef4444' // Red
    );

    // Trigger shake animation on this note
    this.noteShakes.set(noteId, {
      intensity: 6,
      decay: 0.88,
      offsetX: 0,
      offsetY: 0
    });

    // Emit intense ash/ember particles
    for (let i = 0; i < 12; i++) {
      this.canvasEngine.spawnDecayParticle(
        note.x + Math.random() * NOTE_WIDTH,
        note.y + NOTE_HEIGHT * (0.6 + Math.random() * 0.4)
      );
    }

    this.showToast('Note scorched! Lifespan reduced by 10% 🔥', 'flame');

    try {
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        expiresAt: increment(-burnAmount)
      });
    } catch (err) {
      console.warn('Could not sync burn to Firestore:', err);
      this.showToast('Could not sync burn to server.', 'alert-triangle');
    }
  }

  /* ==========================================================================
     FLOATING BADGE PARTICLE SYSTEM
     Drifting "+2h" / "-10%" text badges that float up and fade out
     ========================================================================== */

  spawnFloatingBadge(worldX, worldY, text, color) {
    this.floatingBadges.push({
      x: worldX,
      y: worldY,
      text: text,
      color: color,
      vy: -1.2,                // Drift upward speed (world units/frame)
      opacity: 1.0,
      scale: 1.0,
      life: 1.0,               // 1.0 = full, 0.0 = gone
      decayRate: 0.018          // How fast the badge fades
    });
  }

  updateFloatingBadges() {
    for (let i = this.floatingBadges.length - 1; i >= 0; i--) {
      const badge = this.floatingBadges[i];
      badge.y += badge.vy;
      badge.life -= badge.decayRate;
      badge.opacity = Math.max(0, badge.life);
      badge.scale = 0.8 + badge.life * 0.4; // Slight shrink as it fades

      if (badge.life <= 0) {
        this.floatingBadges.splice(i, 1);
      }
    }
  }

  renderFloatingBadges(ctx) {
    const zoom = this.canvasEngine.camera.zoom;

    for (const badge of this.floatingBadges) {
      const screenPos = this.canvasEngine.worldToScreen(badge.x, badge.y);

      // Skip if offscreen
      if (screenPos.x < -80 || screenPos.x > this.canvasEngine.width + 80 ||
          screenPos.y < -80 || screenPos.y > this.canvasEngine.height + 80) {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = badge.opacity;
      ctx.translate(screenPos.x, screenPos.y);

      const fontSize = Math.max(12, 16 * zoom * badge.scale);

      // Glow shadow
      ctx.shadowColor = badge.color;
      ctx.shadowBlur = 12;

      // Pill background
      ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "Inter", sans-serif`;
      const metrics = ctx.measureText(badge.text);
      const pillW = metrics.width + 16 * zoom;
      const pillH = fontSize + 8 * zoom;
      const pillX = -pillW / 2;
      const pillY = -pillH / 2;

      ctx.beginPath();
      this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fillStyle = badge.color;
      ctx.fill();

      // Reset shadow for text
      ctx.shadowColor = 'transparent';

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge.text, 0, 1);

      ctx.restore();
    }
  }

  /* ==========================================================================
     SHAKE ANIMATION UPDATE
     ========================================================================== */

  updateShakes() {
    for (const [noteId, shake] of this.noteShakes.entries()) {
      shake.offsetX = (Math.random() - 0.5) * shake.intensity * 2;
      shake.offsetY = (Math.random() - 0.5) * shake.intensity * 2;
      shake.intensity *= shake.decay;

      if (shake.intensity < 0.15) {
        this.noteShakes.delete(noteId);
      }
    }
  }

  /* ==========================================================================
     FIRESTORE REAL-TIME SUBSCRIPTION
     ========================================================================== */

  subscribeToNotes() {
    const notesRef = collection(db, 'notes');

    onSnapshot(notesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docData = change.doc.data();
        const id = change.doc.id;

        if (change.type === 'added' || change.type === 'modified') {
          this.notes.set(id, { id, ...docData });
        } else if (change.type === 'removed') {
          this.notes.delete(id);
        }
      });
    }, (error) => {
      console.error('Firestore snapshot listener error:', error);
      this.showToast('Lost connection to Firestore — notes may be stale.', 'wifi-off');
    });
  }

  /* ==========================================================================
     INTERACTIONS — HIT TESTING FOR ❤️ LIKE & 🔥 BURN BUTTONS
     ========================================================================== */

  bindCanvasInteractions() {
    const canvas = this.canvasEngine.canvas;

    // Double-click on canvas creates note
    canvas.addEventListener('dblclick', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      const clickedNote = this.hitTestNote(worldPos.x, worldPos.y);

      if (!clickedNote) {
        this.showEditorAt(e.clientX, e.clientY, worldPos.x, worldPos.y);
      }
    });

    // Single click for action buttons
    canvas.addEventListener('click', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);

      // Check Like button first
      const hitLike = this.hitTestLikeButton(worldPos.x, worldPos.y);
      if (hitLike) {
        this.likeNote(hitLike.id);
        return;
      }

      // Check Burn button
      const hitBurn = this.hitTestBurnButton(worldPos.x, worldPos.y);
      if (hitBurn) {
        this.burnNote(hitBurn.id);
        return;
      }
    });

    // Cursor hover style update
    canvas.addEventListener('mousemove', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      const hitLike = this.hitTestLikeButton(worldPos.x, worldPos.y);
      const hitBurn = this.hitTestBurnButton(worldPos.x, worldPos.y);

      if (hitLike || hitBurn) {
        canvas.style.cursor = 'pointer';
      } else if (!this.canvasEngine.isSpacePressed && !this.canvasEngine.isDragging) {
        const hitNote = this.hitTestNote(worldPos.x, worldPos.y);
        canvas.style.cursor = hitNote ? 'default' : 'crosshair';
      }
    });
  }

  hitTestNote(worldX, worldY) {
    for (const note of this.notes.values()) {
      if (
        worldX >= note.x &&
        worldX <= note.x + NOTE_WIDTH &&
        worldY >= note.y &&
        worldY <= note.y + NOTE_HEIGHT
      ) {
        return note;
      }
    }
    return null;
  }

  /**
   * ❤️ Like button — positioned at bottom-right of each note
   */
  hitTestLikeButton(worldX, worldY) {
    const btnW = 48;
    const btnH = 26;
    for (const note of this.notes.values()) {
      const btnX = note.x + NOTE_WIDTH - btnW - 10;
      const btnY = note.y + NOTE_HEIGHT - btnH - 10;

      if (worldX >= btnX && worldX <= btnX + btnW &&
          worldY >= btnY && worldY <= btnY + btnH) {
        return note;
      }
    }
    return null;
  }

  /**
   * 🔥 Burn button — positioned to the left of the Like button
   */
  hitTestBurnButton(worldX, worldY) {
    const btnW = 48;
    const btnH = 26;
    for (const note of this.notes.values()) {
      const likeBtnX = note.x + NOTE_WIDTH - btnW - 10;
      const btnX = likeBtnX - btnW - 6; // Left of the like button with gap
      const btnY = note.y + NOTE_HEIGHT - btnH - 10;

      if (worldX >= btnX && worldX <= btnX + btnW &&
          worldY >= btnY && worldY <= btnY + btnH) {
        return note;
      }
    }
    return null;
  }

  /* ==========================================================================
     RENDERING NOTES WITH DECAY, ACTIONS & FRUSTUM CULLING
     ========================================================================== */

  renderNotes(ctx) {
    const now = Date.now();
    const zoom = this.canvasEngine.camera.zoom;
    let visibleCount = 0;

    // Update animation systems
    this.updateFloatingBadges();
    this.updateShakes();

    for (const note of this.notes.values()) {
      // 1. Frustum Culling Check
      if (!this.canvasEngine.isInViewport(note.x, note.y, NOTE_WIDTH, NOTE_HEIGHT, 80)) {
        continue;
      }
      visibleCount++;

      // 2. Decay Calculation
      const remaining = (note.expiresAt || (note.createdAt + DEFAULT_LIFETIME)) - now;
      const totalLifespan = DEFAULT_LIFETIME;
      const ratio = Math.max(0, remaining / totalLifespan);

      // Skip expired notes
      if (remaining <= 0) {
        continue;
      }

      // 3. Emit ash particles when decaying (< 25% lifetime remaining)
      if (ratio < 0.25 && Math.random() < 0.2) {
        this.canvasEngine.spawnDecayParticle(
          note.x + Math.random() * NOTE_WIDTH,
          note.y + NOTE_HEIGHT * (0.8 + Math.random() * 0.2)
        );
      }

      // 4. Compute Screen Coordinates & Render (with optional shake offset)
      this.drawSingleNote(ctx, note, ratio, remaining, zoom);
    }

    // 5. Render floating badges on top of everything
    this.renderFloatingBadges(ctx);

    return visibleCount;
  }

  drawSingleNote(ctx, note, ratio, remaining, zoom) {
    const shake = this.noteShakes.get(note.id);
    const shakeX = shake ? shake.offsetX : 0;
    const shakeY = shake ? shake.offsetY : 0;

    const screenPos = this.canvasEngine.worldToScreen(note.x, note.y);
    const sx = screenPos.x + shakeX;
    const sy = screenPos.y + shakeY;
    const screenW = NOTE_WIDTH * zoom;
    const screenH = NOTE_HEIGHT * zoom;
    const cornerRadius = 10 * Math.min(1.5, Math.max(0.5, zoom));

    ctx.save();

    // Decay opacity effect (fades when ratio < 0.25)
    let opacity = 1.0;
    if (ratio < 0.25) {
      opacity = 0.45 + (ratio / 0.25) * 0.55;
    }
    ctx.globalAlpha = opacity;

    // Shake-induced red glow when burning
    if (shake && shake.intensity > 1) {
      ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
      ctx.shadowBlur = 20 * zoom;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 16 * zoom;
    }
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6 * zoom;

    // Rounded rectangle path
    ctx.beginPath();
    this.roundRect(ctx, sx, sy, screenW, screenH, cornerRadius);

    // Note Background
    const colorInfo = NOTE_COLORS.find(c => c.hex.toLowerCase() === (note.color || '').toLowerCase()) || NOTE_COLORS[0];
    ctx.fillStyle = note.color || '#FEF08A';

    // If decaying (< 0.25), darken edges with charred ash tone
    if (ratio < 0.25) {
      const charGrad = ctx.createLinearGradient(sx, sy, sx, sy + screenH);
      charGrad.addColorStop(0, note.color);
      charGrad.addColorStop(0.7, note.color);
      charGrad.addColorStop(1, '#1e1b18');
      ctx.fillStyle = charGrad;
    }

    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Subtle border / charred border
    ctx.strokeStyle = ratio < 0.25 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * zoom);
    ctx.stroke();

    // Do not draw text/UI if zoomed way out to save draw calls
    if (zoom < 0.25) {
      ctx.restore();
      return;
    }

    // 5. Draw Note Content Text
    ctx.fillStyle = colorInfo.textHex || '#0f172a';
    const fontSize = Math.max(10, 13 * zoom);
    ctx.font = `500 ${fontSize}px "Inter", sans-serif`;
    ctx.textBaseline = 'top';

    const padding = 14 * zoom;
    const maxTextWidth = screenW - padding * 2;
    this.drawWrappedText(ctx, note.text, sx + padding, sy + padding, maxTextWidth, fontSize * 1.35, 4);

    // 6. Draw Footer: Lifespan Timer & Action Buttons
    const footerY = sy + screenH - 26 * zoom;

    // Time remaining string
    const timeLeftStr = this.formatTimeRemaining(remaining, ratio);
    ctx.font = `600 ${Math.max(8, 10 * zoom)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = ratio < 0.25 ? '#dc2626' : 'rgba(0, 0, 0, 0.55)';
    ctx.fillText(timeLeftStr, sx + padding, footerY + 5 * zoom);

    // ── Action Buttons ──────────────────────────────────────────────────

    const btnH = 22 * zoom;
    const btnW = 44 * zoom;
    const btnGap = 5 * zoom;

    // ❤️ Like Button (rightmost)
    const likeBtnX = sx + screenW - btnW - padding;
    const likeBtnY = footerY;
    this.drawActionButton(ctx, likeBtnX, likeBtnY, btnW, btnH, '❤️', `${note.likes || 0}`, 
      'rgba(34, 197, 94, 0.12)', 'rgba(34, 197, 94, 0.25)', colorInfo.textHex, zoom);

    // 🔥 Burn Button (left of Like)
    const burnBtnX = likeBtnX - btnW - btnGap;
    const burnBtnY = footerY;
    this.drawActionButton(ctx, burnBtnX, burnBtnY, btnW, btnH, '🔥', '', 
      'rgba(239, 68, 68, 0.1)', 'rgba(239, 68, 68, 0.2)', colorInfo.textHex, zoom);

    ctx.restore();
  }

  /**
   * Draws a single rounded action button pill with an emoji and optional count label.
   */
  drawActionButton(ctx, x, y, w, h, emoji, label, bgColor, borderColor, textColor, zoom) {
    const radius = h / 2;

    // Pill background
    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Emoji icon
    const emojiFontSize = Math.max(9, 11 * zoom);
    ctx.font = `${emojiFontSize}px "Inter", sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(emoji, x + 5 * zoom, y + h / 2 + 1);

    // Optional count label
    if (label) {
      ctx.font = `700 ${Math.max(8, 9 * zoom)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 22 * zoom, y + h / 2 + 1);
    }
  }

  formatTimeRemaining(ms, ratio) {
    if (ms <= 0) return 'Vanished';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `⏳ ${hours}h ${minutes}m`;
    }
    return `🔥 ${minutes}m left`;
  }

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(' ');
    let line = '';
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lineCount++;
        if (lineCount >= maxLines) {
          ctx.fillText(line.trim() + '...', x, y);
          return;
        }
        ctx.fillText(line.trim(), x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, y);
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
