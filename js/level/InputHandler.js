// Human side of IInputReader. Same fields as ScriptInput, so handing over is one assignment.
//
// Keyboard: arrows or WASD move and aim, Space jumps, J hooks, K is the second trigger.
//   J and K on one node is a slingshot, exactly as both triggers on one node is in the game.
// Mouse: hold to hook toward the pointer, release to let go at swing velocity.
//   A quick click holds both triggers until SlingshotState launches.
// Touch: hold to hook toward your finger, release to launch. A swipe stays a normal scroll.
const TOUCH_HOLD_MS = 110;
const TOUCH_HOLD_IDLE_MS = 400; // Before playing, a touch is probably a tap or a scroll.
const TITLE_HOLD_MS = 400;     // A press on a title longer than this is a swing, not a click.
const TITLE_MOVE_PX = 12;
const TAP_MS = 170;

export class InputHandler {
  constructor({ onEngage, screenToWorld, isPlaying }) {
    this.isPlaying = isPlaying;
    this._titlePress = null;
    this._swallowClick = false;
    this.onEngage = onEngage; // Called on the first deliberate input.
    this.screenToWorld = screenToWorld;
    this.keys = new Set();
    this.pointer = null; // { x, y } in client px while engaged
    this.pointerHeld = false;
    this.slingTicks = 0;
    this._jumpEdge = false;
    this._downAt = 0;
    this._pendingTouch = null;
    this.LeftStick = { x: 0, y: 0 };
    this.RightStick = { x: 0, y: 0 };
    this.IsLeftTriggerHeld = false;
    this.IsRightTriggerHeld = false;
    this.IsJumpPressed = false;
    this.IsJumpHeld = false;
    this._bind();
  }

  _bind() {
    const isLink = (t) => t.closest && t.closest('a, button');

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mapped = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', ' ', 'j', 'k'].includes(k);
      if (!mapped) return;
      if (k === ' ' && isLink(e.target) && e.target.matches(':focus-visible')) return;
      if (!e.repeat) {
        if (k === ' ') this._jumpEdge = true;
        this.keys.add(k);
        this.onEngage();
      }
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this._release(); });

    const titleOf = (t) => t.closest && t.closest('a.title');

    window.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      this._swallowClick = false;
      const title = titleOf(e.target);
      if (isLink(e.target) && (!title || e.ctrlKey || e.metaKey || e.shiftKey)) return;
      const playing = this.isPlaying();
      this.pointer = { x: e.clientX, y: e.clientY };
      this._downAt = performance.now();
      if (title && !playing) {
        // Could be either. A short still press stays a link; a hold or a drag becomes a swing.
        this._titlePress = {
          x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch',
          timer: setTimeout(() => this._claimTitle(), TITLE_HOLD_MS),
        };
        return;
      }
      // While playing, the titles are only something to aim at.
      if (title) this._swallowClick = true;
      if (e.pointerType === 'touch') {
        this._pendingTouch = setTimeout(() => {
          this._pendingTouch = null;
          this.pointerHeld = true;
          this.onEngage();
        }, playing ? TOUCH_HOLD_MS : TOUCH_HOLD_IDLE_MS);
      } else {
        this.pointerHeld = true;
        this.onEngage();
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (!e.isPrimary) return;
      const press = this._titlePress;
      if (press) {
        this.pointer = { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TITLE_MOVE_PX) {
          if (press.touch) this._cancelTitle(); // A swipe stays a scroll.
          else this._claimTitle();
        }
        return;
      }
      if (this.pointerHeld) this.pointer = { x: e.clientX, y: e.clientY };
      else if (this._pendingTouch && this.pointer && Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 10) {
        clearTimeout(this._pendingTouch);
        this._pendingTouch = null;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      if (this._titlePress) { this._cancelTitle(); return; } // The click goes through: Steam.
      const quick = performance.now() - this._downAt < TAP_MS;
      if (this._pendingTouch) {
        // A tap that ended before the hold fired.
        clearTimeout(this._pendingTouch);
        this._pendingTouch = null;
        this.onEngage();
        this.slingTicks = 30;
        return;
      }
      if (this.pointerHeld) {
        this.pointerHeld = false;
        if (quick) this.slingTicks = 30;
        else this.pointer = null;
      }
    });
    window.addEventListener('pointercancel', () => {
      this._cancelTitle();
      if (this._pendingTouch) { clearTimeout(this._pendingTouch); this._pendingTouch = null; }
      this._release();
    });

    window.addEventListener('click', (e) => {
      if (this._swallowClick && titleOf(e.target)) e.preventDefault();
      this._swallowClick = false;
    }, true);
    window.addEventListener('dragstart', (e) => { if (isLink(e.target)) e.preventDefault(); });

    // Once a hold has hooked, the finger belongs to the hook. Until then, scrolling is untouched.
    document.addEventListener('touchmove', (e) => { if (this.pointerHeld) e.preventDefault(); }, { passive: false });
    window.addEventListener('contextmenu', (e) => { if (this.pointerHeld) e.preventDefault(); });
  }

  _claimTitle() {
    if (!this._titlePress) return;
    clearTimeout(this._titlePress.timer);
    this._titlePress = null;
    this._swallowClick = true;
    this.pointerHeld = true;
    this.onEngage();
  }

  _cancelTitle() {
    if (!this._titlePress) return;
    clearTimeout(this._titlePress.timer);
    this._titlePress = null;
    this.pointer = null;
  }

  _release() {
    this.pointerHeld = false;
    this.pointer = null;
  }

  // Called once per tick while the human is driving.
  Sample(ctx) {
    const has = (a, b) => this.keys.has(a) || this.keys.has(b);
    const sx = (has('ArrowRight', 'd') ? 1 : 0) - (has('ArrowLeft', 'a') ? 1 : 0);
    const sy = (has('ArrowUp', 'w') ? 1 : 0) - (has('ArrowDown', 's') ? 1 : 0);
    const stick = { x: sx, y: sy };

    // Aim: the pointer if there is one, then the stick, then up and forward.
    let aim;
    if (this.pointer) {
      const w = this.screenToWorld(this.pointer.x, this.pointer.y);
      const p = ctx.PlayerRigidbody.position;
      const dx = w.x - p.x, dy = w.y - p.y;
      const m = Math.hypot(dx, dy) || 1;
      aim = { x: dx / m, y: dy / m };
    } else if (sx || sy) {
      const m = Math.hypot(sx, sy);
      aim = { x: sx / m, y: sy / m };
    } else {
      const f = ctx.Velocity.x < -0.1 ? -1 : 1;
      aim = { x: 0.5 * f, y: 0.866 };
    }

    const sling = this.slingTicks > 0;
    if (sling) {
      this.slingTicks = ctx.CanSlingshot || ctx.CurrentState.constructor.name === 'SlingshotState' ? this.slingTicks - 1 : 0;
      if (this.slingTicks === 0) this.pointer = this.pointerHeld ? this.pointer : null;
    }
    const rt = this.pointerHeld || this.keys.has('j') || sling;
    const lt = this.keys.has('k') || sling;

    // While swinging on the right arm, its stick's x pumps the swing, as in the C#.
    this.RightStick = rt ? (ctx.RightAnchor && !this.pointer ? stick : aim) : stick;
    this.LeftStick = lt ? (ctx.LeftAnchor && !this.pointer ? stick : aim) : stick;
    this.IsRightTriggerHeld = rt;
    this.IsLeftTriggerHeld = lt;
    this.IsJumpPressed = this._jumpEdge;
    this.IsJumpHeld = this.keys.has(' ');
    this._jumpEdge = false;
  }

  get neutral() {
    return !this.pointerHeld && this.keys.size === 0 && this.slingTicks === 0 && !this._pendingTouch && !this._titlePress;
  }
}
