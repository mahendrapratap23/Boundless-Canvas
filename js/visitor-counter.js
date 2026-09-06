/**
 * ============================================================================
 * The Boundless Canvas — Authentic Realtime Visitor Counter
 * Firebase RTDB atomic sync & live broadcast
 * Starts from 0, tracks authentic visitors per session
 * ============================================================================
 */

import {
  rtdb,
  ref,
  onValue,
  runTransaction
} from './firebase-config.js';

export class VisitorCounter {
  constructor(options = {}) {
    this.badgeEl = options.badgeElement || document.getElementById('visited-badge');
    this.countEl = options.countElement || document.getElementById('visited-count');
    this.currentCount = 0;
    this.hasAnimatedInitial = false;

    this.init();
  }

  init() {
    this.registerAuthenticVisit();
    this.listenToVisitCount();
  }

  /**
   * Register a single authentic visit per browser session.
   * Prevents artificially inflating the count upon rapid page reloads
   * while accurately counting every genuine user visit.
   */
  registerAuthenticVisit() {
    const sessionKey = 'boundless_canvas_session_visited';

    // Already registered for this browser session
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }

    try {
      const visitsRef = ref(rtdb, 'stats/totalVisits');

      runTransaction(visitsRef, (currentValue) => {
        // Start count from 0 if null, then increment by 1
        const count = typeof currentValue === 'number' ? currentValue : 0;
        return count + 1;
      }).then((result) => {
        if (result.committed) {
          sessionStorage.setItem(sessionKey, 'true');
        }
      }).catch((err) => {
        console.warn('Could not register visitor count to RTDB:', err);
      });
    } catch (err) {
      console.warn('Firebase RTDB transaction error:', err);
    }
  }

  /**
   * Listen to live updates from Firebase RTDB.
   * If another user visits from anywhere in the world, the counter updates live.
   */
  listenToVisitCount() {
    try {
      const visitsRef = ref(rtdb, 'stats/totalVisits');

      onValue(visitsRef, (snapshot) => {
        const val = snapshot.val();
        const targetCount = typeof val === 'number' ? val : 0;
        this.animateCountTo(targetCount);
      }, (err) => {
        console.warn('Visitor counter listener error:', err);
        this.updateDisplay(this.currentCount);
      });
    } catch (err) {
      console.warn('Visitor counter init error:', err);
      this.updateDisplay(0);
    }
  }

  /**
   * Smooth number animation with subtle glow bump
   */
  animateCountTo(targetCount) {
    if (!this.countEl) return;

    const startCount = this.currentCount;
    const diff = targetCount - startCount;

    if (diff === 0 && this.hasAnimatedInitial) {
      this.updateDisplay(targetCount);
      return;
    }

    // Trigger pulse bump animation on subsequent updates
    if (this.hasAnimatedInitial && diff > 0 && this.badgeEl) {
      this.badgeEl.classList.remove('count-bump');
      void this.badgeEl.offsetWidth; // Force CSS reflow
      this.badgeEl.classList.add('count-bump');
    }

    this.hasAnimatedInitial = true;

    // Smooth count animation
    const duration = Math.min(800, Math.max(300, Math.abs(diff) * 60));
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startCount + diff * ease);

      this.updateDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.currentCount = targetCount;
        this.updateDisplay(targetCount);
      }
    };

    requestAnimationFrame(step);
  }

  updateDisplay(count) {
    this.currentCount = count;
    if (this.countEl) {
      this.countEl.textContent = count.toLocaleString();
    }
    if (this.badgeEl) {
      const formatted = count.toLocaleString();
      const visitWord = count === 1 ? 'visit' : 'visits';
      this.badgeEl.setAttribute(
        'title',
        `Authentic Visitor Count: ${formatted} ${visitWord} recorded live in the void`
      );
    }
  }
}
