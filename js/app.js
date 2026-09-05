/**
 * ============================================================================
 * The Boundless Canvas — Main Application Entry Point
 * Coordinator, 60 FPS Render Loop, Deep Linking, HUD & Shortcuts
 * ============================================================================
 */

import { CanvasEngine } from './canvas.js';
import { NotesManager } from './notes.js';
import { PresenceManager } from './presence.js';

class BoundlessCanvasApp {
  constructor() {
    this.canvasElement = document.getElementById('canvas');
    this.topBar = document.getElementById('top-bar');
    this.coordX = document.getElementById('coord-x');
    this.coordY = document.getElementById('coord-y');
    this.coordZoom = document.getElementById('coord-zoom');
    this.onlineCountEl = document.getElementById('online-count');
    this.emptyHint = document.getElementById('empty-hint');
    this.toastContainer = document.getElementById('toast-container');
    this.helpModal = document.getElementById('help-modal');

    // Debounce timer for URL hash updates
    this.hashUpdateTimer = null;

    this.init();
  }

  init() {
    // 1. Initialize Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // 2. Initialize Canvas Engine
    this.engine = new CanvasEngine(this.canvasElement);

    // 3. Initialize Notes Manager
    this.notesManager = new NotesManager(this.engine, (msg, icon) => this.showToast(msg, icon));

    // 4. Initialize Presence Manager
    this.presenceManager = new PresenceManager(this.engine, (count) => {
      if (this.onlineCountEl) {
        this.onlineCountEl.textContent = count;
      }
    });

    // 5. Restore camera position from URL Deep Link
    this.parseUrlCoordinates();

    // 6. Hook Camera Changes to HUD and URL Hash
    this.engine.onCameraChange = (camera) => {
      this.updateHUDCoordinates(camera);
      this.debouncedUpdateUrlHash(camera);
    };

    // Initial HUD update
    this.updateHUDCoordinates(this.engine.camera);

    // 7. Bind Dock Buttons & Keyboard Shortcuts
    this.bindDockControls();
    this.bindKeyboardShortcuts();

    // 8. Start Main Render Loop
    this.startRenderLoop();
  }

  /* ==========================================================================
     RENDER LOOP (60 FPS)
     ========================================================================== */

  startRenderLoop() {
    const loop = () => {
      // Step physics and camera lerp
      this.engine.update();

      const ctx = this.engine.ctx;

      // 1. Clear & Render infinite background dot grid & origin marker
      this.engine.renderBackgroundGrid();

      // 2. Render Sticky Notes with frustum culling & decay effects
      const visibleNotesCount = this.notesManager.renderNotes(ctx);

      // 3. Render ash & ember particles
      this.engine.drawParticles();

      // 4. Render Ghost Cursors with lerped smoothing
      this.presenceManager.renderCursors(ctx);

      // 5. Toggle empty void hint if no notes are in the current viewport
      this.updateEmptyHint(visibleNotesCount);

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  updateEmptyHint(visibleCount) {
    if (!this.emptyHint) return;
    // If no notes are visible and not actively creating a note, show hint
    const isEditorOpen = this.notesManager.editorOverlay.style.display !== 'none';
    if (visibleCount === 0 && !isEditorOpen) {
      this.emptyHint.classList.add('visible');
    } else {
      this.emptyHint.classList.remove('visible');
    }
  }

  /* ==========================================================================
     HUD & COORDINATE READOUTS
     ========================================================================== */

  updateHUDCoordinates(camera) {
    if (this.coordX) this.coordX.textContent = Math.round(camera.x);
    if (this.coordY) this.coordY.textContent = Math.round(camera.y);
    if (this.coordZoom) this.coordZoom.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  /* ==========================================================================
     URL DEEP-LINKING
     ========================================================================== */

  parseUrlCoordinates() {
    try {
      const hash = window.location.hash.substring(1);
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const x = parseFloat(params.get('x'));
      const y = parseFloat(params.get('y'));
      const z = parseFloat(params.get('z'));

      if (!isNaN(x) && !isNaN(y)) {
        const zoom = !isNaN(z) ? z : 1.0;
        this.engine.setCameraPosition(x, y, zoom, true);
      }
    } catch (e) {
      console.warn('Could not parse URL coordinates:', e);
    }
  }

  debouncedUpdateUrlHash(camera) {
    clearTimeout(this.hashUpdateTimer);
    this.hashUpdateTimer = setTimeout(() => {
      const roundedX = Math.round(camera.x);
      const roundedY = Math.round(camera.y);
      const roundedZ = Math.round(camera.zoom * 100) / 100;
      history.replaceState(null, '', `#x=${roundedX}&y=${roundedY}&z=${roundedZ}`);
    }, 350);
  }

  /* ==========================================================================
     CONTROLS & SHORTCUTS
     ========================================================================== */

  bindDockControls() {
    // Pin Thought Button
    document.getElementById('btn-new-note')?.addEventListener('click', () => {
      this.openNoteEditorAtCameraCenter();
    });

    // Recenter Button
    document.getElementById('btn-recenter')?.addEventListener('click', () => {
      this.engine.setCameraPosition(0, 0, 1.0);
      this.showToast('Reset camera to origin (0, 0)', 'crosshair');
    });

    // Zoom Controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      this.engine.zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 1.25);
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      this.engine.zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 0.8);
    });

    // Share View Link
    document.getElementById('btn-share')?.addEventListener('click', () => {
      this.copyShareUrl();
    });

    // Why It Matters / Help Modal
    document.getElementById('btn-help')?.addEventListener('click', () => {
      this.toggleHelpModal(true);
    });

    document.getElementById('help-close')?.addEventListener('click', () => {
      this.toggleHelpModal(false);
    });

    this.helpModal?.addEventListener('click', (e) => {
      if (e.target === this.helpModal) {
        this.toggleHelpModal(false);
      }
    });

    // Modal Tab Switching
    document.querySelectorAll('.modal-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const targetTab = tabBtn.getAttribute('data-tab');
        this.switchModalTab(targetTab);
      });
    });
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isInputFocused = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

      if (e.key === 'Escape') {
        this.notesManager.hideEditor();
        this.toggleHelpModal(false);
        return;
      }

      if (isInputFocused) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.openNoteEditorAtCameraCenter();
      } else if (e.key === '0') {
        e.preventDefault();
        this.engine.setCameraPosition(0, 0, 1.0);
        this.showToast('Reset camera to origin (0, 0)', 'crosshair');
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        this.engine.zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 1.25);
      } else if (e.key === '-') {
        e.preventDefault();
        this.engine.zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 0.8);
      } else if (e.key === '?') {
        e.preventDefault();
        this.toggleHelpModal(true);
      }
    });
  }

  openNoteEditorAtCameraCenter() {
    const screenX = window.innerWidth / 2;
    const screenY = window.innerHeight / 2;
    const worldPos = this.engine.screenToWorld(screenX, screenY);
    this.notesManager.showEditorAt(screenX, screenY, worldPos.x, worldPos.y);
  }

  copyShareUrl() {
    const roundedX = Math.round(this.engine.camera.x);
    const roundedY = Math.round(this.engine.camera.y);
    const roundedZ = Math.round(this.engine.camera.zoom * 100) / 100;
    const shareUrl = `${window.location.origin}${window.location.pathname}#x=${roundedX}&y=${roundedY}&z=${roundedZ}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      this.showToast('Coordinate link copied to clipboard! 📋', 'link-2');
    }).catch(() => {
      this.showToast('Could not copy link automatically.', 'alert-triangle');
    });
  }

  toggleHelpModal(show) {
    if (this.helpModal) {
      if (show) {
        this.helpModal.classList.add('is-open');
        this.helpModal.setAttribute('aria-hidden', 'false');
        if (window.lucide) {
          window.lucide.createIcons();
        }
      } else {
        this.helpModal.classList.remove('is-open');
        this.helpModal.setAttribute('aria-hidden', 'true');
      }
    }
  }

  switchModalTab(tabName) {
    if (!tabName) return;

    document.querySelectorAll('.modal-tab').forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-pane').forEach((pane) => {
      const isActive = pane.id === `tab-pane-${tabName}`;
      pane.classList.toggle('active', isActive);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /* ==========================================================================
     TOAST NOTIFICATIONS
     ========================================================================== */

  showToast(message, iconName = 'sparkles') {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;

    this.toastContainer.appendChild(toast);

    if (window.lucide) {
      window.lucide.createIcons({ root: toast });
    }

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2800);
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new BoundlessCanvasApp();
});
