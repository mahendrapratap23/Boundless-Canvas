/**
 * ============================================================================
 * The Boundless Canvas — Infinite Camera & Rendering Engine
 * Coordinate transformations, pan/zoom inertia, frustum culling, dot grid
 * ============================================================================
 */

export class CanvasEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });

    // Camera state (actual position) and target (for smooth lerping)
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1
    };

    this.targetCamera = {
      x: 0,
      y: 0,
      zoom: 1
    };

    // Zoom constraints
    this.MIN_ZOOM = 0.1;
    this.MAX_ZOOM = 3.0;

    // Viewport dimensions
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for performance

    // Panning & inertia physics state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragStartCam = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.lastPointer = { x: 0, y: 0, time: 0 };
    this.friction = 0.90;
    this.lerpSpeed = 0.22;

    // Keyboard state
    this.isSpacePressed = false;

    // Touch gesture state
    this.touchDistance = null;
    this.touchCenter = null;

    // Ash & ember particle pool for decaying notes
    this.particles = [];
    this.maxParticles = 120;

    // Callbacks
    this.onCameraChange = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    this.bindEvents();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // Normalize context scaling for High-DPI screens
    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);
  }

  /* ==========================================================================
     COORDINATE CONVERSIONS
     ========================================================================== */

  /**
   * Converts screen pixel coordinates to world coordinates.
   */
  screenToWorld(screenX, screenY) {
    return {
      x: this.camera.x + (screenX - this.width / 2) / this.camera.zoom,
      y: this.camera.y + (screenY - this.height / 2) / this.camera.zoom
    };
  }

  /**
   * Converts world coordinates to screen pixel coordinates.
   */
  worldToScreen(worldX, worldY) {
    return {
      x: this.width / 2 + (worldX - this.camera.x) * this.camera.zoom,
      y: this.height / 2 + (worldY - this.camera.y) * this.camera.zoom
    };
  }

  /**
   * Returns current world viewport bounds [minX, maxX, minY, maxY]
   */
  getViewportWorldBounds() {
    const halfW = (this.width / 2) / this.camera.zoom;
    const halfH = (this.height / 2) / this.camera.zoom;
    return {
      minX: this.camera.x - halfW,
      maxX: this.camera.x + halfW,
      minY: this.camera.y - halfH,
      maxY: this.camera.y + halfH
    };
  }

  /**
   * Frustum Culling Check: Checks if a world rect intersects screen viewport.
   */
  isInViewport(worldX, worldY, width, height, padding = 40) {
    const bounds = this.getViewportWorldBounds();
    return (
      worldX + width >= bounds.minX - padding &&
      worldX <= bounds.maxX + padding &&
      worldY + height >= bounds.minY - padding &&
      worldY <= bounds.maxY + padding
    );
  }

  /* ==========================================================================
     CAMERA MANIPULATION
     ========================================================================== */

  setCameraPosition(x, y, zoom = this.camera.zoom, instant = false) {
    const clampedZoom = Math.min(Math.max(zoom, this.MIN_ZOOM), this.MAX_ZOOM);
    this.targetCamera.x = x;
    this.targetCamera.y = y;
    this.targetCamera.zoom = clampedZoom;

    if (instant) {
      this.camera.x = x;
      this.camera.y = y;
      this.camera.zoom = clampedZoom;
      this.velocity = { x: 0, y: 0 };
    }
  }

  zoomAtPoint(screenX, screenY, deltaFactor) {
    const prevZoom = this.targetCamera.zoom;
    const nextZoom = Math.min(Math.max(prevZoom * deltaFactor, this.MIN_ZOOM), this.MAX_ZOOM);

    if (Math.abs(nextZoom - prevZoom) < 0.0001) return;

    // Anchor point in world coordinates before zoom
    const worldPoint = {
      x: this.targetCamera.x + (screenX - this.width / 2) / prevZoom,
      y: this.targetCamera.y + (screenY - this.height / 2) / prevZoom
    };

    // Calculate new camera center so world point remains under mouse
    this.targetCamera.zoom = nextZoom;
    this.targetCamera.x = worldPoint.x - (screenX - this.width / 2) / nextZoom;
    this.targetCamera.y = worldPoint.y - (screenY - this.height / 2) / nextZoom;
  }

  /* ==========================================================================
     INPUT & NAVIGATION EVENT HANDLERS
     ========================================================================== */

  bindEvents() {
    // Wheel / Trackpad pinch & zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      // If ctrlKey is pressed, it's a pinch-to-zoom on trackpads
      const isPinch = e.ctrlKey;
      let factor;
      
      if (isPinch) {
        factor = Math.exp(-e.deltaY * 0.015);
      } else {
        // Normal mouse wheel: moderate zoom steps
        factor = e.deltaY < 0 ? 1.12 : 0.89;
      }

      this.zoomAtPoint(e.clientX, e.clientY, factor);
    }, { passive: false });

    // Pointer Down (Pan or Note interaction)
    window.addEventListener('pointerdown', (e) => {
      // Don't initiate canvas pan if user clicks on a HUD button or modal
      if (e.target.closest('.glass-panel') || e.target.closest('.modal-backdrop') || e.target.closest('.toast-container')) {
        return;
      }

      // Allow panning if Space is down, Middle Mouse is down, or Left Mouse on empty canvas
      if (this.isSpacePressed || e.button === 1 || e.button === 0) {
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragStartCam = { x: this.targetCamera.x, y: this.targetCamera.y };
        this.lastPointer = { x: e.clientX, y: e.clientY, time: performance.now() };
        this.velocity = { x: 0, y: 0 };
        this.canvas.classList.add('panning');
      }
    });

    // Pointer Move
    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;

      const now = performance.now();
      const dt = Math.max(1, now - this.lastPointer.time);
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;

      // Update velocity in world units/ms for inertial throw
      this.velocity = {
        x: (-dx / this.camera.zoom) / dt,
        y: (-dy / this.camera.zoom) / dt
      };

      this.lastPointer = { x: e.clientX, y: e.clientY, time: now };

      // Calculate shift from start
      const totalDx = (e.clientX - this.dragStart.x) / this.camera.zoom;
      const totalDy = (e.clientY - this.dragStart.y) / this.camera.zoom;

      this.targetCamera.x = this.dragStartCam.x - totalDx;
      this.targetCamera.y = this.dragStartCam.y - totalDy;
    });

    // Pointer Up
    window.addEventListener('pointerup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.classList.remove('panning');
      }
    });

    // Keydown / Keyup for Space panning shortcut
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isSpacePressed && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
        this.isSpacePressed = true;
        this.canvas.classList.add('space-pressed');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.canvas.classList.remove('space-pressed');
      }
    });

    // Touch events for mobile/tablet pinch zoom
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this.touchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.touchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.touchDistance && this.touchCenter) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / this.touchDistance;
        this.touchDistance = dist;
        this.zoomAtPoint(this.touchCenter.x, this.touchCenter.y, factor);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      this.touchDistance = null;
      this.touchCenter = null;
    });
  }

  /* ==========================================================================
     PHYSICS & TICK UPDATE
     ========================================================================== */

  update() {
    // Apply inertia velocity when not actively dragging
    if (!this.isDragging) {
      if (Math.abs(this.velocity.x) > 0.001 || Math.abs(this.velocity.y) > 0.001) {
        this.targetCamera.x += this.velocity.x * 16;
        this.targetCamera.y += this.velocity.y * 16;
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
      } else {
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
    }

    // Smooth Lerp toward targetCamera
    const dx = this.targetCamera.x - this.camera.x;
    const dy = this.targetCamera.y - this.camera.y;
    const dz = this.targetCamera.zoom - this.camera.zoom;

    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.0005) {
      this.camera.x += dx * this.lerpSpeed;
      this.camera.y += dy * this.lerpSpeed;
      this.camera.zoom += dz * this.lerpSpeed;

      if (this.onCameraChange) {
        this.onCameraChange(this.camera);
      }
    }

    // Update ash/ember particles
    this.updateParticles();
  }

  /* ==========================================================================
     PARTICLE ENGINE (FOR DECAYING NOTES ASH / EMBERS)
     ========================================================================== */

  spawnDecayParticle(worldX, worldY) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      x: worldX + (Math.random() - 0.5) * 40,
      y: worldY + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.6 - Math.random() * 0.8,
      size: 1.5 + Math.random() * 2,
      opacity: 0.8 + Math.random() * 0.2,
      decay: 0.012 + Math.random() * 0.015,
      color: Math.random() > 0.4 ? '#f97316' : '#94a3b8' // Amber ember or gray ash
    });
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.opacity -= p.decay;
      if (p.opacity <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const screenPos = this.worldToScreen(p.x, p.y);
      if (screenPos.x < 0 || screenPos.x > this.width || screenPos.y < 0 || screenPos.y > this.height) {
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, p.size * Math.max(0.5, this.camera.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  /* ==========================================================================
     GRID & ORIGIN RENDERING
     ========================================================================== */

  renderBackgroundGrid() {
    const ctx = this.ctx;
    const { width, height } = this;
    const zoom = this.camera.zoom;

    // Deep void solid background
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, width, height);

    // Adaptive grid spacing
    const baseGridSize = 50;
    const scaledGridSize = baseGridSize * zoom;

    // Calculate grid phase/offset relative to screen center
    const offsetX = (width / 2 - this.camera.x * zoom) % scaledGridSize;
    const offsetY = (height / 2 - this.camera.y * zoom) % scaledGridSize;

    // Dot grid opacity fades gracefully when zoomed out
    const dotAlpha = Math.min(0.28, Math.max(0.04, 0.22 * zoom));
    ctx.fillStyle = `rgba(148, 163, 184, ${dotAlpha})`;

    const dotRadius = Math.max(1, 1.3 * Math.min(zoom, 1.5));

    // Render dot matrix
    ctx.beginPath();
    for (let x = offsetX; x < width; x += scaledGridSize) {
      for (let y = offsetY; y < height; y += scaledGridSize) {
        ctx.moveTo(x + dotRadius, y);
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Render Origin Marker (0,0) with glowing coordinates anchor
    const originScreen = this.worldToScreen(0, 0);
    if (
      originScreen.x >= -100 && originScreen.x <= width + 100 &&
      originScreen.y >= -100 && originScreen.y <= height + 100
    ) {
      this.drawOriginMarker(originScreen.x, originScreen.y);
    }
  }

  drawOriginMarker(screenX, screenY) {
    const ctx = this.ctx;
    const size = 12 * Math.min(1.5, Math.max(0.6, this.camera.zoom));

    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 1.5;

    // Crosshair at (0,0)
    ctx.beginPath();
    ctx.moveTo(screenX - size, screenY);
    ctx.lineTo(screenX + size, screenY);
    ctx.moveTo(screenX, screenY - size);
    ctx.lineTo(screenX, screenY + size);
    ctx.stroke();

    // Subtle origin circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, size * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.6)';
    ctx.stroke();

    // "Origin (0,0)" label
    if (this.camera.zoom > 0.4) {
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.textAlign = 'left';
      ctx.fillText('(0, 0)', screenX + size + 6, screenY + 3);
    }
    ctx.restore();
  }
}
