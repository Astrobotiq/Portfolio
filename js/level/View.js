// Draws the character and the trail. Everything here reads simulation state; nothing feeds back.
//
// Silhouette: Slingshot's character (round head, crown, cloak) as one solid shape in --coral, outlined
// in --surface so that it reads on the night, on the pale type and on the footage.
// Squash comes only from velocity: stretch along the velocity vector while moving, and a landing
// squash scaled by the speed lost at the contact, played through CurvePresetsUtility.GetSpring.
export const VISUAL_SCALE = 3;
export const PHONE_VISUAL_SCALE = 1.6;

// Normalised to height 1, width about 0.8, centred on the collider. Feet at y = +0.5.
function makeSilhouette() {
  const p = new Path2D();
  // Crown: three spikes.
  p.moveTo(-0.2, -0.3);
  p.lineTo(-0.24, -0.5);
  p.lineTo(-0.09, -0.39);
  p.lineTo(0.0, -0.53);
  p.lineTo(0.09, -0.39);
  p.lineTo(0.24, -0.5);
  p.lineTo(0.2, -0.3);
  p.closePath();
  // Head.
  p.moveTo(0.27, -0.12);
  p.arc(0, -0.12, 0.27, 0, Math.PI * 2);
  // Cloak.
  p.moveTo(-0.12, 0.02);
  p.lineTo(-0.4, 0.46);
  p.quadraticCurveTo(-0.4, 0.5, -0.34, 0.5);
  p.lineTo(0.34, 0.5);
  p.quadraticCurveTo(0.4, 0.5, 0.4, 0.46);
  p.lineTo(0.12, 0.02);
  p.closePath();
  return p;
}

// CurvePresetsUtility.GetSpring, sampled linearly between its keys. 0 to 1 with overshoot.
const SPRING_KEYS = [[0, 0], [0.4, 1.2], [0.6, 0.9], [0.8, 1.05], [0.9, 0.98], [1, 1]];
function springCurve(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  for (let i = 1; i < SPRING_KEYS.length; i++) {
    const [t1, v1] = SPRING_KEYS[i];
    if (t <= t1) {
      const [t0, v0] = SPRING_KEYS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  }
  return 1;
}

export class View {
  constructor(isPhoneLayout) {
    this.isPhoneLayout = isPhoneLayout;
    this.sil = makeSilhouette();
    this.trail = document.getElementById('trail');
    this.tctx = this.trail.getContext('2d');
    this.actor = document.createElement('canvas');
    this.actor.id = 'actor';
    this.actor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.actor);
    this.actx = this.actor.getContext('2d');
    this.dpr = 1;
    this.height = 23;
    this.landAge = 1;
    this.landAmount = 0;
    this.pupil = { x: 0, y: 0 };
    this.blinkAt = 2;
    this.blinkT = -1;
    this.clock = 0;
    this.originX = 0;
  }

  resize(level, hero, colliderSize) {
    this.ppu = level.ppu;
    this.colliderPx = colliderSize.y * level.ppu;
    this.height = this.colliderPx * (this.isPhoneLayout() ? PHONE_VISUAL_SCALE : VISUAL_SCALE); // Drawn bigger than its collider, feet on the same spot.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = hero.getBoundingClientRect();
    this.originX = r.left;
    // Keep the trail off every line of text: it only exists over the band of games.
    const slots = [...document.querySelectorAll('.slot')].map((s) => s.getBoundingClientRect());
    const top = Math.min(...slots.map((s) => s.top)) - r.top;
    const bottom = Math.max(...slots.map((s) => s.bottom)) - r.top;
    this.trail.style.clipPath = `inset(${top}px 0 ${r.height - bottom}px 0)`;
    this.syncColors();
    this.trail.width = Math.round(r.width * this.dpr);
    this.trail.height = Math.round(r.height * this.dpr);
    this.tctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Its CSS box stops at a classic scrollbar, and innerWidth does not.
    this.actor.width = Math.round(document.documentElement.clientWidth * this.dpr);
    this.actor.height = Math.round(window.innerHeight * this.dpr);
  }

  syncColors() {
    const cs = getComputedStyle(document.documentElement);
    this.surface = cs.getPropertyValue('--surface').trim();
    this.fg = cs.getPropertyValue('--fg').trim();
    this.coral = cs.getPropertyValue('--coral').trim();
    this.teal = cs.getPropertyValue('--teal').trim();
  }

  clearTrail() {
    this.tctx.save();
    this.tctx.setTransform(1, 0, 0, 1, 0, 0);
    this.tctx.clearRect(0, 0, this.trail.width, this.trail.height);
    this.tctx.restore();
    this.prevStamp = null;
  }

  // The actor canvas is fixed to the window, so with the hero off screen nothing may stay on it.
  clearActor() {
    this.actx.setTransform(1, 0, 0, 1, 0, 0);
    this.actx.clearRect(0, 0, this.actor.width, this.actor.height);
  }

  // Stretch from velocity. Returns the matrix pieces shared by stamps and the live character.
  _stretch(vx, vy) {
    const speed = Math.hypot(vx, vy);
    const k = Math.min(1, speed / 65);
    return { angle: Math.atan2(-vy, vx), st: 1 + 1.15 * k * k + 0.25 * k, speed };
  }

  _body(ctx, x, y, vx, vy, q) {
    const { angle, st, speed } = this._stretch(vx, vy);
    const h = this.height;
    ctx.save();
    ctx.translate(x, y + (this.colliderPx - h) / 2);
    if (speed > 0.5) {
      ctx.rotate(angle);
      ctx.scale(st, 1 / Math.sqrt(st));
      ctx.rotate(-angle);
    }
    if (q) {
      // Landing squash, around the feet.
      ctx.translate(0, h / 2);
      ctx.scale(1 + q * 0.75, 1 - q);
      ctx.translate(0, -h / 2);
    }
    ctx.scale(h, h);
    return ctx;
  }

  // The poster's picture, drawn live: a coral ribbon, and strings from it up to the teal hook.
  // Nothing is drawn while standing still, so time in one place cannot pile up into a blob.
  stamp(x, y, vx, vy, anchors) {
    const ctx = this.tctx;
    const px = x * this.ppu - this.originX, py = -y * this.ppu;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.5) { this.prevStamp = { px, py }; return; }
    if (anchors && anchors.length) {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.28;
      for (const a of anchors) {
        const ax = a.x * this.ppu - this.originX, ay = -a.y * this.ppu;
        const string = ctx.createLinearGradient(px, py, ax, ay);
        string.addColorStop(0, this.fg);
        string.addColorStop(1, this.teal);
        ctx.strokeStyle = string;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ax, ay);
        ctx.stroke();
      }
    }
    if (this.prevStamp) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.coral;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(this.prevStamp.px, this.prevStamp.py);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.prevStamp = { px, py };
  }

  // The scribble was only ever the working-out. Once the page is whole, it goes.
  fadeTrail() {
    if (this.trail.classList.contains('gone')) return;
    this.trail.classList.add('gone');
    setTimeout(() => {
      this.clearTrail();
      this.trail.classList.remove('gone');
    }, 1300);
  }

  noteLanding(speed) {
    this.landAmount = Math.min(0.62, (speed / 40) * 0.62);
    this.landAge = 0;
  }

  // Live frame. pos and vel are world units; rideOffset is the letter under the feet.
  draw(state, dt) {
    const ctx = this.actx;
    const sy = window.scrollY;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const x = state.x * this.ppu + state.ride.x;
    const y = -state.y * this.ppu - sy + state.ride.y;

    ctx.lineCap = 'round';
    for (const a of state.anchors) {
      const w = state.anchors.length > 1 ? 3 : 2.4;
      for (const [style, width] of [[this.surface, w + 2.5], [this.fg, w]]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(a.x * this.ppu + a.ox, -a.y * this.ppu - sy + a.oy);
        ctx.stroke();
      }
    }

    if (!state.frozen) this.landAge += dt / 0.34;
    const q = this.landAge < 1 ? this.landAmount * (1 - springCurve(this.landAge)) : 0;

    this._body(ctx, x, y, state.vx, state.vy, q);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = this.surface;
    ctx.stroke(this.sil);
    ctx.fillStyle = this.coral;
    ctx.fill(this.sil);
    this._eyes(ctx, state, dt);
    ctx.restore();
  }

  // Numbers are PlayerEyesController's: max offset 0.1, sensitivity 0.01,
  // smoothing 10/s, blink every 2 to 6 s.
  _eyes(ctx, state, dt) {
    this.clock += dt;
    const clampM = Math.min(1, 0.1 / (Math.hypot(state.vx, state.vy) * 0.01 + 1e-6));
    const tx = state.vx * 0.01 * clampM, ty = -state.vy * 0.01 * clampM;
    const s = Math.min(1, dt * 10);
    this.pupil.x += (tx - this.pupil.x) * s;
    this.pupil.y += (ty - this.pupil.y) * s;
    if (this.clock > this.blinkAt) {
      this.blinkT = 0;
      this.blinkAt = this.clock + 2 + Math.random() * 4;
    }
    let open = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      open = Math.abs(this.blinkT / 0.2 - 1);
      if (this.blinkT > 0.4) { this.blinkT = -1; open = 1; }
    }
    for (const ex of [-0.1, 0.1]) {
      ctx.fillStyle = this.fg;
      ctx.beginPath();
      ctx.ellipse(ex, -0.13, 0.085, 0.105 * Math.max(0.08, open), 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.4) {
        ctx.fillStyle = this.surface;
        ctx.beginPath();
        ctx.arc(ex + this.pupil.x * 0.45, -0.13 + this.pupil.y * 0.45, 0.042, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
