/**
 * ============================================================================
 * The Boundless Canvas — Sticky Notes & Decay Engine
 * Firestore sync, note rendering, decay physics, ash particles, like/extend
 * ============================================================================
 */

import {
  db,
  isDemoMode,
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
    this.hoveredLikeNoteId = null;

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

    // Ensure editor stays within screen boundaries
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
     NOTE CREATION & PERSISTENCE
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

    if (isDemoMode) {
      // LocalStorage Demo Mode
      const id = 'demo_' + Math.random().toString(36).substring(2, 9);
      newNote.id = id;
      this.notes.set(id, newNote);
      this.saveLocalNotes();
      this.showToast('Thought pinned to the void! (Saved locally)', 'check-circle');
    } else {
      try {
        const docRef = await addDoc(collection(db, 'notes'), newNote);
        this.showToast('Thought pinned to the global void! 📌', 'check-circle');
      } catch (err) {
        console.error('Error writing note to Firestore:', err);
        this.showToast('Error saving note. Stored locally.', 'alert-triangle');
        const id = 'local_' + Date.now();
        newNote.id = id;
        this.notes.set(id, newNote);
      }
    }
  }

  /* ==========================================================================
     NOTE EXTENSION & LIKE MECHANICS
     ========================================================================== */

  async extendNote(noteId) {
    const note = this.notes.get(noteId);
    if (!note) return;

    const newExpires = (note.expiresAt || Date.now()) + EXTEND_LIFETIME;
    const newLikes = (note.likes || 0) + 1;

    // Optimistic local update
    note.expiresAt = newExpires;
    note.likes = newLikes;

    // Emit celebration particles
    for (let i = 0; i < 8; i++) {
      this.canvasEngine.spawnDecayParticle(note.x + NOTE_WIDTH / 2, note.y + NOTE_HEIGHT / 2);
    }

    this.showToast('Lifespan extended by +2 hours! 🔥', 'flame');

    if (isDemoMode) {
      this.saveLocalNotes();
    } else {
      try {
        const noteRef = doc(db, 'notes', noteId);
        await updateDoc(noteRef, {
          expiresAt: increment(EXTEND_LIFETIME),
          likes: increment(1)
        });
      } catch (err) {
        console.warn('Could not sync like to Firestore:', err);
      }
    }
  }

  /* ==========================================================================
     SYNC / DATA SUBSCRIPTION
     ========================================================================== */

  subscribeToNotes() {
    if (isDemoMode) {
      this.loadDemoNotes();
      return;
    }

    try {
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
        console.warn('Firestore snapshot error, falling back to demo notes:', error);
        this.loadDemoNotes();
      });
    } catch (err) {
      console.warn('Failed to subscribe to Firestore notes:', err);
      this.loadDemoNotes();
    }
  }

  loadDemoNotes() {
    const saved = localStorage.getItem('boundless_canvas_notes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.forEach(n => this.notes.set(n.id, n));
        return;
      } catch (e) {
        console.error('Failed to parse cached demo notes');
      }
    }

    // Seed default sample notes across the void
    const now = Date.now();
    const seedNotes = [
      {
        id: 'seed_1',
        x: -110,
        y: -90,
        text: 'Welcome to the digital void. Everything here drifts, decays, and survives through the memory of strangers.',
        color: '#FEF08A',
        createdAt: now - 3600000,
        expiresAt: now + DEFAULT_LIFETIME - 3600000,
        likes: 12
      },
      {
        id: 'seed_2',
        x: 280,
        y: -180,
        text: 'Double click anywhere to leave a thought. Zoom out to explore constellations of minds.',
        color: '#A7F3D0',
        createdAt: now - 7200000,
        expiresAt: now + DEFAULT_LIFETIME - 7200000,
        likes: 8
      },
      {
        id: 'seed_3',
        x: -380,
        y: 120,
        text: 'This thought is starting to fade into ash... click 🔥 to keep the fire burning for +2 hours!',
        color: '#FECDD3',
        createdAt: now - (DEFAULT_LIFETIME - 15 * 60 * 1000), // Only 15 mins left!
        expiresAt: now + 15 * 60 * 1000,
        likes: 24
      },
      {
        id: 'seed_4',
        x: 420,
        y: 260,
        text: '“We are all wanderers in an infinite dark, casting small lanterns into the quiet.”',
        color: '#DDD6FE',
        createdAt: now - 1800000,
        expiresAt: now + DEFAULT_LIFETIME - 1800000,
        likes: 19
      }
    ];

    seedNotes.forEach(n => this.notes.set(n.id, n));
    this.saveLocalNotes();
  }

  saveLocalNotes() {
    try {
      const arr = Array.from(this.notes.values());
      localStorage.setItem('boundless_canvas_notes', JSON.stringify(arr));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  /* ==========================================================================
     INTERACTIONS (DOUBLE CLICK & LIKE BUTTON HIT-TEST)
     ========================================================================== */

  bindCanvasInteractions() {
    const canvas = this.canvasEngine.canvas;

    // Double-click on canvas creates note
    canvas.addEventListener('dblclick', (e) => {
      // Check if double clicking on an existing note
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      const clickedNote = this.hitTestNote(worldPos.x, worldPos.y);

      if (!clickedNote) {
        this.showEditorAt(e.clientX, e.clientY, worldPos.x, worldPos.y);
      }
    });

    // Single click for like / flame button
    canvas.addEventListener('click', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      const hitLikeNote = this.hitTestLikeButton(worldPos.x, worldPos.y);

      if (hitLikeNote) {
        this.extendNote(hitLikeNote.id);
      }
    });

    // Cursor hover style update
    canvas.addEventListener('mousemove', (e) => {
      const worldPos = this.canvasEngine.screenToWorld(e.clientX, e.clientY);
      const hitLike = this.hitTestLikeButton(worldPos.x, worldPos.y);

      if (hitLike) {
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

  hitTestLikeButton(worldX, worldY) {
    const btnW = 60;
    const btnH = 26;
    for (const note of this.notes.values()) {
      const btnX = note.x + NOTE_WIDTH - btnW - 10;
      const btnY = note.y + NOTE_HEIGHT - btnH - 10;

      if (
        worldX >= btnX &&
        worldX <= btnX + btnW &&
        worldY >= btnY &&
        worldY <= btnY + btnH
      ) {
        return note;
      }
    }
    return null;
  }

  /* ==========================================================================
     RENDERING NOTES WITH DECAY & FRUSTUM CULLING
     ========================================================================== */

  renderNotes(ctx) {
    const now = Date.now();
    const zoom = this.canvasEngine.camera.zoom;
    let visibleCount = 0;

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

      // 4. Compute Screen Coordinates & Render
      this.drawSingleNote(ctx, note, ratio, remaining, zoom);
    }

    return visibleCount;
  }

  drawSingleNote(ctx, note, ratio, remaining, zoom) {
    const screenPos = this.canvasEngine.worldToScreen(note.x, note.y);
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

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 16 * zoom;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6 * zoom;

    // Rounded rectangle path
    ctx.beginPath();
    this.roundRect(ctx, screenPos.x, screenPos.y, screenW, screenH, cornerRadius);

    // Note Background
    const colorInfo = NOTE_COLORS.find(c => c.hex.toLowerCase() === (note.color || '').toLowerCase()) || NOTE_COLORS[0];
    ctx.fillStyle = note.color || '#FEF08A';

    // If decaying (< 0.25), darken edges with charred ash tone
    if (ratio < 0.25) {
      const charGrad = ctx.createLinearGradient(screenPos.x, screenPos.y, screenPos.x, screenPos.y + screenH);
      charGrad.addColorStop(0, note.color);
      charGrad.addColorStop(0.7, note.color);
      charGrad.addColorStop(1, '#1e1b18'); // Burnt bottom edge
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
    this.drawWrappedText(ctx, note.text, screenPos.x + padding, screenPos.y + padding, maxTextWidth, fontSize * 1.35, 4);

    // 6. Draw Footer: Lifespan Timer & Like/Fire Button
    const footerY = screenPos.y + screenH - 24 * zoom;

    // Time remaining string
    const timeLeftStr = this.formatTimeRemaining(remaining, ratio);
    ctx.font = `600 ${Math.max(8, 10 * zoom)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = ratio < 0.25 ? '#dc2626' : 'rgba(0, 0, 0, 0.55)';
    ctx.fillText(timeLeftStr, screenPos.x + padding, footerY + 3 * zoom);

    // Like / Flame Button Pill
    const btnW = 54 * zoom;
    const btnH = 22 * zoom;
    const btnX = screenPos.x + screenW - btnW - padding;
    const btnY = footerY;

    ctx.beginPath();
    this.roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Flame icon & count text
    ctx.fillStyle = '#ea580c';
    ctx.font = `${Math.max(9, 11 * zoom)}px "Inter", sans-serif`;
    ctx.fillText('🔥', btnX + 6 * zoom, btnY + 3 * zoom);

    ctx.fillStyle = colorInfo.textHex || '#0f172a';
    ctx.font = `700 ${Math.max(8, 10 * zoom)}px "JetBrains Mono", monospace`;
    ctx.fillText(`${note.likes || 0}`, btnX + 24 * zoom, btnY + 4 * zoom);

    ctx.restore();
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
