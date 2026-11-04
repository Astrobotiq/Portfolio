// Reimplementation of the Physics2D queries the C# uses, over axis-aligned rectangles.
// A rect is { xmin, ymin, xmax, ymax, oneWay, word, letter }, y up, in world units.
//
// Differences from Box2D that a Unity lead should know: no contact offset and no rotation.
// BoxCast only accepts axis directions, which is all KinematicPhysicsHandler asks for.
const CELL = 4;

export class Physics2DWorld {
  constructor(rects) {
    this.rects = rects;
    this.grid = new Map();
    this._stamp = 0;
    rects.forEach((r) => {
      r._seen = 0;
      const x0 = Math.floor(r.xmin / CELL), x1 = Math.floor(r.xmax / CELL);
      const y0 = Math.floor(r.ymin / CELL), y1 = Math.floor(r.ymax / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = x * 73856 + y;
          let c = this.grid.get(k);
          if (!c) this.grid.set(k, (c = []));
          c.push(r);
        }
      }
    });
  }

  _forEach(xmin, ymin, xmax, ymax, fn) {
    const stamp = ++this._stamp;
    const x0 = Math.floor(xmin / CELL), x1 = Math.floor(xmax / CELL);
    const y0 = Math.floor(ymin / CELL), y1 = Math.floor(ymax / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const c = this.grid.get(x * 73856 + y);
        if (!c) continue;
        for (let i = 0; i < c.length; i++) {
          const r = c[i];
          if (r._seen === stamp) continue;
          r._seen = stamp;
          fn(r);
        }
      }
    }
  }

  // Physics2D.BoxCast along an axis. Hits are { distance, rect }, distance 0 when already overlapping.
  BoxCast(cx, cy, w, h, dx, dy, dist, includeOneWay, out) {
    out.length = 0;
    const hw = w / 2, hh = h / 2;
    const xmin = cx - hw + Math.min(0, dx * dist), xmax = cx + hw + Math.max(0, dx * dist);
    const ymin = cy - hh + Math.min(0, dy * dist), ymax = cy + hh + Math.max(0, dy * dist);
    this._forEach(xmin, ymin, xmax, ymax, (r) => {
      if (r.oneWay && !includeOneWay) return;
      let d;
      if (dx !== 0) {
        if (!(r.ymin < cy + hh && r.ymax > cy - hh)) return;
        if (dx > 0) {
          d = r.xmin - (cx + hw);
          if (d < 0) { if (r.xmax > cx - hw) d = 0; else return; }
        } else {
          d = (cx - hw) - r.xmax;
          if (d < 0) { if (r.xmin < cx + hw) d = 0; else return; }
        }
      } else {
        if (!(r.xmin < cx + hw && r.xmax > cx - hw)) return;
        if (dy > 0) {
          d = r.ymin - (cy + hh);
          if (d < 0) { if (r.ymax > cy - hh) d = 0; else return; }
        } else {
          d = (cy - hh) - r.ymax;
          if (d < 0) { if (r.ymin < cy + hh) d = 0; else return; }
        }
      }
      if (d <= dist) out.push({ distance: d, rect: r });
    });
    return out.length;
  }

  // Physics2D.OverlapBox + Physics2D.Distance. Ground layer only, as in ResolvePenetrations.
  ResolveOverlaps(pos, w, h) {
    const hw = w / 2, hh = h / 2;
    this._forEach(pos.x - hw, pos.y - hh, pos.x + hw, pos.y + hh, (r) => {
      if (r.oneWay) return;
      const left = pos.x + hw - r.xmin, right = r.xmax - (pos.x - hw);
      const down = pos.y + hh - r.ymin, up = r.ymax - (pos.y - hh);
      if (left <= 0 || right <= 0 || down <= 0 || up <= 0) return;
      const m = Math.min(left, right, down, up);
      if (m === up) pos.y += up;
      else if (m === down) pos.y -= down;
      else if (m === left) pos.x -= left;
      else pos.x += right;
    });
    return pos;
  }

  // Physics2D.CircleCast against the ground layer, sub-stepped. Returns { normal, rect } or null.
  CircleCast(cx, cy, radius, dx, dy, dist) {
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = (dist * i) / steps;
      const hit = this._circleAt(cx + dx * t, cy + dy * t, radius);
      if (hit) return hit;
    }
    return null;
  }

  _circleAt(x, y, radius) {
    let best = null, bestD = Infinity;
    this._forEach(x - radius, y - radius, x + radius, y + radius, (r) => {
      if (r.oneWay) return;
      const qx = x < r.xmin ? r.xmin : x > r.xmax ? r.xmax : x;
      const qy = y < r.ymin ? r.ymin : y > r.ymax ? r.ymax : y;
      const ex = x - qx, ey = y - qy;
      const d = Math.hypot(ex, ey);
      if (d > radius || d >= bestD) return;
      bestD = d;
      let normal;
      if (d > 1e-6) normal = { x: ex / d, y: ey / d };
      else {
        const m = Math.min(x - r.xmin, r.xmax - x, y - r.ymin, r.ymax - y);
        normal = m === y - r.ymin ? { x: 0, y: -1 } : m === r.ymax - y ? { x: 0, y: 1 }
          : m === x - r.xmin ? { x: -1, y: 0 } : { x: 1, y: 0 };
      }
      best = { normal, rect: r };
    });
    return best;
  }

  // Physics2D.Raycast line of sight. `ignoreLetter` lets a ray end on the node's own letter.
  Raycast(ox, oy, dx, dy, dist, ignoreLetter) {
    const ex = ox + dx * dist, ey = oy + dy * dist;
    let blocked = false;
    this._forEach(Math.min(ox, ex), Math.min(oy, ey), Math.max(ox, ex), Math.max(oy, ey), (r) => {
      if (blocked || r.oneWay) return;
      if (ignoreLetter !== undefined && r.letter === ignoreLetter) return;
      // Slab test.
      let tmin = 0, tmax = dist;
      if (Math.abs(dx) < 1e-9) { if (ox < r.xmin || ox > r.xmax) return; }
      else {
        let a = (r.xmin - ox) / dx, b = (r.xmax - ox) / dx;
        if (a > b) { const c = a; a = b; b = c; }
        tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      }
      if (Math.abs(dy) < 1e-9) { if (oy < r.ymin || oy > r.ymax) return; }
      else {
        let a = (r.ymin - oy) / dy, b = (r.ymax - oy) / dy;
        if (a > b) { const c = a; a = b; b = c; }
        tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      }
      if (tmin <= tmax) blocked = true;
    });
    return blocked;
  }
}
