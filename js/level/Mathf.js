// Small stand-ins for UnityEngine.Mathf and Vector2. Same semantics where it matters:
// Mathf.Sign(0) is +1, Vector2.normalized of a near-zero vector is zero.
export const Mathf = {
  Abs: Math.abs,
  Sign: (v) => (v >= 0 ? 1 : -1),
  Max: Math.max,
  Clamp01: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
  MoveTowards(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
  },
};

export const V2 = {
  of: (x, y) => ({ x, y }),
  zero: () => ({ x: 0, y: 0 }),
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, s) => ({ x: a.x * s, y: a.y * s }),
  div: (a, s) => ({ x: a.x / s, y: a.y / s }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  mag: (a) => Math.hypot(a.x, a.y),
  sqrMag: (a) => a.x * a.x + a.y * a.y,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  normalized(a) {
    const m = Math.hypot(a.x, a.y);
    return m > 1e-5 ? { x: a.x / m, y: a.y / m } : { x: 0, y: 0 };
  },
  lerp(a, b, t) {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  },
  // Vector2.Angle: unsigned degrees.
  angle(a, b) {
    const d = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (d < 1e-10) return 0;
    const c = (a.x * b.x + a.y * b.y) / d;
    return (Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * 180) / Math.PI;
  },
};

// Unity Time.fixedDeltaTime, from ProjectSettings/TimeManager.asset: Fixed Timestep 0.02.
export const FIXED_DT = 0.02;
