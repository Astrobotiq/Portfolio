// Works out the first run by forward-simulating the real PlayerController against the level.
// Nothing here is keyframed: every candidate is a list of per-tick inputs, tried on a clone of the
// real state machine. The result is the frames that the live bot then feeds through IInputReader.
//
// A recruiter may only stay a few seconds, so the first choice is three clean hits on a tight budget.
// Where that does not fit the layout, the fallbacks allow one planned miss: for the second game, a
// launch aimed at the word that really does fall short in simulation and has a real recovery.
import { PlayerController } from './PlayerController.js';
import { ScriptInput, ZERO_FRAME } from './BotInput.js';
import { AirborneState } from './States/AirborneState.js';
import { GroundedState } from './States/GroundedState.js';
import { SwingingState } from './States/SwingingState.js';
import { FIXED_DT, V2 } from './Mathf.js';

export const IMPACT_GAP_TICKS = 80; // One flooded word at a time: 1.6 s between impacts.
const TICKS_PER_S = 1 / FIXED_DT;
const JUMP_HELD = Object.freeze({ ...ZERO_FRAME, jh: true });

// Widening searches. Three hits as early as they can come is what we want first; each later tier
// gives up a little. The spawn waits for the answer, so the tight tiers get little of the deadline.
// The last tier can run past 12 s, and the result says so.
export const TIERS = [
  { miss: false, maxTick: 420, top: 14, hits: 6, share: 0.08 },
  { miss: false, maxTick: 440, top: 14, hits: 6, share: 0.3 },
  { miss: true, maxTick: 530, top: 10, hits: 4, share: 0.5 },
  { miss: true, maxTick: 560, top: 14, hits: 6, share: 0.7 },
  { miss: false, maxTick: 560, top: 14, hits: 6, share: 0.85 },
  { miss: false, maxTick: 800, top: 20, hits: 8, share: 1.0, overBudget: true },
];

class Sim {
  // Input history is a shared chain: a clone keeps a pointer to its parent's frames, not a copy.
  // Tens of thousands of clones are made, so this is most of what keeps planning fast.
  constructor(ctx, parentFrames = null, parentLen = 0, events = [], pts = []) {
    this.ctx = ctx;
    this.chain = { parent: parentFrames, parentLen, items: [] };
    this.frameCount = (parentFrames ? parentFrames.base + parentLen : 0);
    this.chain.base = this.frameCount;
    this.events = events;
    this.pts = pts;
  }

  clone() {
    return new Sim(this.ctx.Clone(new ScriptInput()), this.chain, this.chain.items.length, this.events.slice(), this.pts.slice());
  }

  get frames() {
    const segments = [];
    let node = this.chain, len = node.items.length;
    while (node) {
      segments.push(len === node.items.length ? node.items : node.items.slice(0, len));
      len = node.parentLen;
      node = node.parent;
    }
    return segments.reverse().flat();
  }

  tick(frame) {
    this.ctx.Input.apply(frame);
    this.chain.items.push(frame);
    this.frameCount++;
    this.ctx.Tick();
    if (this.ctx.Events.length) {
      for (const e of this.ctx.Events) this.events.push(e);
      this.ctx.Events.length = 0;
    }
    if (this.frameCount % 4 === 0) this.pts.push(this.ctx.PlayerRigidbody.position);
  }

  get pos() { return this.ctx.PlayerRigidbody.position; }
  get grounded() { return this.ctx.CurrentState instanceof GroundedState; }
  get tickCount() { return this.ctx.TickCount; }

  lastEvent(t, since = 0) {
    for (let i = this.events.length - 1; i >= since; i--) if (this.events[i].t === t) return this.events[i];
    return null;
  }
}

function aimFrame(sim, node, both) {
  const d = V2.normalized(V2.sub(node, sim.pos));
  return both
    ? { ...ZERO_FRAME, lx: d.x, ly: d.y, rx: d.x, ry: d.y, lt: true, rt: true }
    : { ...ZERO_FRAME, rx: d.x, ry: d.y, rt: true };
}

// Both triggers on one node, held until SlingshotState launches on its own. False if it did not fire.
function doSling(sim, node) {
  const mark = sim.events.length;
  for (let i = 0; i < 40; i++) {
    sim.tick(aimFrame(sim, node, true));
    const a = sim.ctx.RightAnchor;
    if (a && a.word !== node.word) return false;
    if (sim.lastEvent('launch', mark) && sim.ctx.CurrentState instanceof AirborneState) return true;
  }
  return false;
}

// One trigger held for `hold` ticks, stick x = pump, then released.
function doSwing(sim, node, pump, hold) {
  let hooked = false;
  for (let i = 0; i < 16 && !hooked; i++) {
    sim.tick(aimFrame(sim, node, false));
    hooked = sim.ctx.CurrentState instanceof SwingingState && sim.ctx.RightAnchor === node;
    if (sim.ctx.RightAnchor && sim.ctx.RightAnchor !== node) return false;
  }
  if (!hooked) return false;
  const f = { ...ZERO_FRAME, rx: pump, ry: 0, rt: true };
  const mark = sim.events.length;
  for (let i = 0; i < hold; i++) {
    sim.tick(f);
    if (!(sim.ctx.CurrentState instanceof SwingingState)) return true;
    if (sim.lastEvent('impact', mark)) return true; // Let go on impact; the freeze has started.
  }
  sim.tick(ZERO_FRAME);
  return true;
}

// Fly with no input until landing, an impact, or the limit. Returns 'grounded' | 'impact' | 'timeout'.
function fly(sim, limit, since, frame = ZERO_FRAME) {
  for (let i = 0; i < limit; i++) {
    sim.tick(frame);
    if (sim.lastEvent('impact', since)) return 'impact';
    if (sim.grounded) return 'grounded';
  }
  return 'timeout';
}

function pathScore(sim, fromIdx, level, visited) {
  let len = 0, fresh = 0, inText = 0;
  const seen = new Set();
  for (let i = Math.max(1, fromIdx); i < sim.pts.length; i++) {
    const p = sim.pts[i], q = sim.pts[i - 1];
    len += V2.dist(p, q);
    const k = Math.floor(p.x / 2) * 1000 + Math.floor(p.y / 2);
    if (!visited.has(k) && !seen.has(k)) { seen.add(k); fresh++; }
    for (const t of level.smallText) {
      if (p.x > t.xmin && p.x < t.xmax && p.y > t.ymin && p.y < t.ymax) { inText++; break; }
    }
  }
  return len * 0.3 + fresh * 1.2 - inText * 2.5;
}

export class Planner {
  constructor(level, stats, colliderSize, { deadlineMs = 2000, sliceMs = 10, now = () => performance.now() } = {}) {
    this.level = level;
    this.stats = stats;
    this.colliderSize = colliderSize;
    this.deadlineMs = deadlineMs;
    this.sliceMs = sliceMs;
    this.now = now;
    this.sims = 0;
    this.missResult = null;
  }

  *_maybeYield() {
    if (this.now() - this._sliceStart > this.sliceMs) {
      yield;
      this._sliceStart = this.now();
    }
  }

  newSpawn(spawn) {
    const ctx = new PlayerController(this.stats, this.level, new ScriptInput(), this.colliderSize);
    ctx.PlayerRigidbody.position = { x: spawn.x, y: spawn.y };
    ctx.TransitionToState(new AirborneState(ctx, { x: 0, y: 0 }));
    return new Sim(ctx);
  }

  // Every launch at `word` from around here. Returns { hits, misses }. Holding jump in flight is
  // a real input: AirborneState then skips JumpEndEarlyGravityMultiplier, so a launch reaches
  // about 66 units instead of 22. It is only tried when a plain launch cannot reach the word.
  *impactOptions(S, word, minImpactTick, { walks = [0, 14, -14, 30, -30, 50, -50] } = {}) {
    const hits = [], misses = [];
    const nodes = (this.level.nodesByWord[word] || []).filter((n) => n.edge === 'bottom');
    const radius = this.level.detectionRadius;
    for (const hold of [false, true]) {
      if (hold && hits.length) break;
      const flyFrame = hold ? JUMP_HELD : ZERO_FRAME;
      for (const w of walks) {
        const base = S.clone();
        if (w !== 0) {
          const f = { ...ZERO_FRAME, lx: Math.sign(w) };
          for (let i = 0; i < Math.abs(w); i++) base.tick(f);
          base.tick(ZERO_FRAME);
          if (!base.grounded) continue;
        }
        for (const node of nodes) {
          if (V2.dist(node, base.pos) > radius) continue;
          yield* this._maybeYield();
          this.sims++;
          const c = base.clone();
          const mark = c.events.length;
          if (!doSling(c, node)) continue;
          const result = fly(c, 110, mark, flyFrame);
          const impact = c.lastEvent('impact', mark);
          if (impact && impact.word === word) {
            hits.push({ sim: c, impact, node, early: minImpactTick - impact.tick, walk: w, hold });
          } else if (!impact && result !== 'timeout' && !hold) {
            const b = this.level.wordBounds[word];
            let closest = Infinity;
            for (const p of c.pts.slice(Math.max(0, c.pts.length - 40))) {
              const dx = Math.max(b.xmin - p.x, 0, p.x - b.xmax);
              const dy = Math.max(b.ymin - p.y, 0, p.y - b.ymax);
              closest = Math.min(closest, Math.hypot(dx, dy));
            }
            misses.push({ node, walk: w, closest, base });
          }
        }
      }
    }
    hits.sort((p, q) => (q.impact.speed - p.impact.speed) * 0.4 - (p.impact.tick - q.impact.tick) * 0.1);
    misses.sort((p, q) => p.closest - q.closest);
    return { hits, misses };
  }

  // Launch again with a wait in front, so that the impact lands at or after minImpactTick.
  _withWait(S, opt, minImpactTick) {
    const wait = Math.max(0, minImpactTick - opt.impact.tick);
    if (wait === 0) return opt;
    const c = S.clone();
    if (opt.walk) {
      const f = { ...ZERO_FRAME, lx: Math.sign(opt.walk) };
      for (let i = 0; i < Math.abs(opt.walk); i++) c.tick(f);
      c.tick(ZERO_FRAME);
    }
    for (let i = 0; i < wait; i++) c.tick(ZERO_FRAME);
    const mark = c.events.length;
    if (!doSling(c, opt.node)) return null;
    fly(c, 110, mark, opt.hold ? JUMP_HELD : ZERO_FRAME);
    const impact = c.lastEvent('impact', mark);
    return impact && impact.word === opt.impact.word ? { ...opt, sim: c, impact } : null;
  }

  // After an impact: fall, or chain up to two swings on role and title nodes, until landing.
  // Slingshots only recharge on the ground, as in the C#, so crossing the page takes rope.
  *transitOptions(S, { visited, final = false, top = 6, towardX = null, latest = Infinity }) {
    const byCell = new Map();
    const nodes = [];
    for (const w of ['role', 'oro', 'goka', 'kiss']) {
      const list = (this.level.nodesByWord[w] || []).filter((n) => n.edge === 'bottom');
      for (let i = 0; i < list.length; i += 2) nodes.push(list[i]);
    }
    const base = S.clone();
    while (base.ctx.IsPaused) base.tick(ZERO_FRAME);
    const baseMark = base.events.length;
    const ptsFrom = base.pts.length;

    const consider = (c) => {
      if (!c.grounded || c.lastEvent('impact', baseMark) || c.tickCount > latest) return;
      const r = c.ctx.PhysicsHandler.GroundRect;
      if (!r) return;
      if (final ? r.word !== 'contact' : (r.word !== 'ground' && r.word !== 'contact')) return;
      let score = pathScore(c, ptsFrom, this.level, visited);
      if (towardX !== null && !final) score -= Math.abs(c.pos.x - towardX) * 1.0;
      if (final && r.letter === -2) score += 8; // The run should end on the CV button if it can.
      score -= (c.tickCount - base.tickCount) * (final ? 0.3 : 0.09); // Time is the budget: 12 s for the run.
      const cell = Math.floor(c.pos.x / 1.5);
      const had = byCell.get(cell);
      if (!had || had.score < score) byCell.set(cell, { sim: c, score });
    };

    { // Straight fall.
      const c = base.clone();
      fly(c, 160, baseMark);
      consider(c);
    }

    const released = [];
    const delays = base.grounded ? [0] : [2, 12, 22];
    for (const delay of delays) {
      const d = base.clone();
      for (let i = 0; i < delay; i++) d.tick(ZERO_FRAME);
      if (d.grounded && delay > 0) continue;
      for (const node of nodes) {
        if (V2.dist(node, d.pos) > 28) continue;
        for (const pump of [1, -1]) {
          for (const hold of [24, 44, 70]) {
            yield* this._maybeYield();
            this.sims++;
            const c = d.clone();
            if (!doSwing(c, node, pump, hold)) continue;
            if (c.lastEvent('impact', baseMark)) continue;
            if (!c.grounded) released.push(c.clone());
            if (!c.grounded) fly(c, 150, baseMark);
            consider(c);
          }
        }
      }
    }

    // Second rope: only for releases that are moving fast, on nodes ahead of the motion.
    released.sort((p, q) => V2.mag(q.ctx.Velocity) - V2.mag(p.ctx.Velocity));
    const step = Math.max(1, Math.floor(released.length / 24));
    for (let i = 0; i < released.length && i < step * 24; i += step) {
      const r = released[i];
      for (let k = 0; k < 6 && !r.grounded; k++) r.tick(ZERO_FRAME);
      if (r.grounded) continue;
      const v = r.ctx.Velocity;
      for (const node of nodes) {
        const to = V2.sub(node, r.pos);
        if (V2.mag(to) > 28 || to.x * v.x < 0) continue;
        const pump = v.x >= 0 ? 1 : -1;
        for (const hold of [30, 60]) {
          yield* this._maybeYield();
          this.sims++;
          const c = r.clone();
          if (!doSwing(c, node, pump, hold)) continue;
          if (c.lastEvent('impact', baseMark)) continue;
          if (!c.grounded) fly(c, 150, baseMark);
          consider(c);
        }
      }
    }

    return [...byCell.values()].sort((p, q) => q.score - p.score).slice(0, top);
  }

  // Launches that fall short of `word`, and a real recovery from there.
  *missAndRecover(S, word, misses, minImpactTick) {
    for (const m of misses.slice(0, 10)) {
      if (m.closest > 7 || this.now() - this._t0 > this.deadlineMs * this.tier.share) continue;
      const flight = m.base.clone();
      const mark = flight.events.length;
      if (!doSling(flight, m.node)) continue;
      const missFrame = flight.frameCount;
      // Recovery one: while still in the air, hook the word and swing into it. Late hooks come
      // first, so that the fall is visible and the miss reads as a miss.
      const nodes = (this.level.nodesByWord[word] || []).filter((n) => n.edge === 'bottom');
      let best = null;
      for (const delay of [38, 32, 26, 20, 14]) {
        const d = flight.clone();
        for (let i = 0; i < delay && !d.grounded; i++) d.tick(ZERO_FRAME);
        if (d.grounded) continue;
        for (const node of nodes) {
          if (V2.dist(node, d.pos) > 28) continue;
          for (const pump of [1, -1]) {
            yield* this._maybeYield();
            this.sims++;
            const c = d.clone();
            if (!doSwing(c, node, pump, 70)) continue;
            if (!c.lastEvent('impact', mark) && !c.grounded) fly(c, 60, mark);
            const impact = c.lastEvent('impact', mark);
            if (impact && impact.word === word && impact.tick >= minImpactTick && (!best || impact.speed > best.impact.speed)) {
              best = { sim: c, impact, miss: { word, closest: m.closest, kind: 'swing-recovery', missFrame, hookDelay: delay } };
            }
          }
        }
        if (best && best.impact.speed >= 18) break;
      }
      if (best) return best;
      // Recovery two: land, launch again.
      const g = flight.clone();
      const res = fly(g, 120, mark);
      if (res === 'grounded' && !g.lastEvent('impact', mark)) {
        const again = yield* this.impactOptions(g, word, minImpactTick, { walks: [0, 12, -12] });
        for (const h of again.hits) {
          const timed = h.early > 0 ? this._withWait(g, h, minImpactTick) : h;
          if (timed) return { sim: timed.sim, impact: timed.impact, miss: { word, closest: m.closest, kind: 'second-launch', missFrame } };
        }
      }
    }
    return null;
  }

  // Latest tick a landing can happen and still leave time for the beats after it.
  _latest(words, idx, maxTick) {
    if (idx >= words.length) return maxTick;
    return maxTick - 150 - (words.length - idx - 1) * 150;
  }

  // Solves the remaining beats from a state just after an impact.
  *solve(S, words, idx, lastImpactTick, maxTick, visited, wantMiss) {
    if (this.now() - this._t0 > this.deadlineMs * this.tier.share) return null;
    const final = idx >= words.length;
    const towardX = final ? this._centre('contact') : this._exposedX(words[idx]);
    const latest = this._latest(words, idx, maxTick);
    const all = yield* this.transitOptions(S, { visited, final, top: 40, towardX, latest });
    const options = final ? all.slice(0, 3)
      : all.filter((o) => this._canLaunch(o.sim.pos, words[idx])).slice(0, this.tier.top);
    if (final && wantMiss) return null; // This tier promised a miss and did not get one.
    for (const o of options) {
      if (final) return o.sim;
      const r = yield* this.launchBeat(o.sim, words, idx, lastImpactTick, maxTick, visited, wantMiss);
      if (r) return r;
    }
    if (final) {
      // No direct landing on the contact line: land on the name, then hop and swing up to it.
      const landings = yield* this.transitOptions(S, { visited, final: false, top: 4, towardX, latest: maxTick - 60 });
      for (const l of landings) {
        if (l.sim.ctx.PhysicsHandler.GroundRect?.word === 'contact') return l.sim;
        const again = yield* this.transitOptions(l.sim, { visited, final: true, top: 2, towardX, latest: maxTick });
        if (again.length) return again[0].sim;
      }
    }
    return null;
  }

  // Cheap test before a real search: can this spot see a node of the word at all?
  _canLaunch(pos, word) {
    const radius = this.level.detectionRadius;
    for (const n of this.level.nodesByWord[word] || []) {
      if (n.edge !== 'bottom') continue;
      const dx = n.x - pos.x, dy = n.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      if (!this.level.world.Raycast(pos.x, pos.y, dx / d, dy / d, d, n.letter)) return true;
    }
    return false;
  }

  _centre(word) {
    const r = this.level.rects.find((x) => x.word === word);
    return r ? (r.xmin + r.xmax) / 2 : null;
  }

  // Middle of the underside of `word` that nothing else covers from below.
  _exposedX(word) {
    const b = this.level.wordBounds[word];
    if (!b) return null;
    const hits = [];
    for (let x = b.xmin; x < b.xmax; x += 0.5) {
      const covered = this.level.rects.some((r) => !r.oneWay && r.word !== word && r.word !== 'name' && r.word !== 'floor'
        && r.word !== 'wall' && r.word !== 'ground' && r.word !== 'contact' && r.ymax < b.ymin && r.xmin <= x && r.xmax >= x);
      if (!covered) hits.push(x);
    }
    return hits.length ? hits[Math.floor(hits.length / 2)] : (b.xmin + b.xmax) / 2;
  }

  *launchBeat(S, words, idx, lastImpactTick, maxTick, visited, wantMiss) {
    if (this.now() - this._t0 > this.deadlineMs * this.tier.share) return null;
    const word = words[idx];
    const minImpactTick = lastImpactTick + IMPACT_GAP_TICKS;
    const { hits, misses } = yield* this.impactOptions(S, word, minImpactTick);
    if (wantMiss && idx >= this.missIndex) {
      const rec = yield* this.missAndRecover(S, word, misses, minImpactTick);
      if (rec && rec.impact.tick <= this._latest(words, idx + 1, maxTick)) {
        this.missResult = rec.miss;
        const r = yield* this.solve(rec.sim, words, idx + 1, rec.impact.tick, maxTick, visited, false);
        if (r) return r;
        this.missResult = null;
      }
    }
    for (const h of hits.slice(0, this.tier.hits)) {
      const timed = h.early > 0 ? this._withWait(S, h, minImpactTick) : h;
      if (!timed || timed.impact.tick > this._latest(words, idx + 1, maxTick)) continue;
      const r = yield* this.solve(timed.sim, words, idx + 1, timed.impact.tick, maxTick, visited, wantMiss);
      if (r) return r;
    }
    return null;
  }

  // Full first run from a spawn. Ticks are counted from spawn.
  *planFirstRun({ firstImpactLimit = 110 } = {}) {
    this._t0 = this._sliceStart = this.now();
    const words = ['oro', 'goka', 'kiss'];
    this.missIndex = 1;
    for (const tier of TIERS) {
      this.tier = tier;
      this.missResult = null;
      for (const spawn of this.level.spawns) {
        const visited = new Set();
        const s = this.newSpawn(spawn);
        if (fly(s, 200, 0) !== 'grounded') continue;
        if (!['ground', 'contact'].includes(s.ctx.PhysicsHandler.GroundRect?.word)) continue;
        const { hits } = yield* this.impactOptions(s, 'oro', 0, { walks: [0, 10, -10] });
        const limit = tier.overBudget ? firstImpactLimit * 2 : firstImpactLimit;
        for (const h of hits.filter((x) => x.impact.tick <= limit).slice(0, tier.hits)) {
          const r = yield* this.solve(h.sim, words, 1, h.impact.tick, tier.maxTick, visited, tier.miss);
          if (r) return { ...this._result(r, spawn), tier: TIERS.indexOf(tier), overBudget: !!tier.overBudget };
        }
        if (this.now() - this._t0 > this.deadlineMs * tier.share) break;
      }
    }
    return null;
  }

  // After a throw: finish the remaining words and the contact line.
  *planFromHere(ctx, words) {
    this._t0 = this._sliceStart = this.now();
    this.missIndex = -1;
    this.tier = { top: 10, hits: 6, share: 1 };
    const S = new Sim(ctx.Clone(new ScriptInput()));
    const visited = new Set();
    const maxTick = ctx.TickCount + 1500;
    // Launch from here if it can. If not, swing somewhere that can. If the order of the words is
    // the problem, take them in the other order.
    let r = null;
    for (const order of [words, [...words].reverse()]) {
      if (order.length) r = yield* this.launchBeat(S, order, 0, ctx.TickCount - IMPACT_GAP_TICKS, maxTick, visited, false);
      if (!r) r = yield* this.solve(S, order, 0, ctx.TickCount - IMPACT_GAP_TICKS, maxTick, visited, false);
      if (r) break;
    }
    return r ? this._result(r, null) : null;
  }

  _result(sim, spawn) {
    return {
      spawn,
      frames: sim.frames,
      ticks: sim.frameCount,
      impacts: sim.events.filter((e) => e.t === 'impact').map((e) => ({ word: e.word, tick: e.tick, speed: e.speed })),
      launches: sim.events.filter((e) => e.t === 'launch').length,
      miss: this.missResult,
      sims: this.sims,
      ms: Math.round(this.now() - this._t0),
      landedOn: sim.ctx.PhysicsHandler.GroundRect?.word || null,
      seconds: sim.frameCount / TICKS_PER_S,
    };
  }
}

export function runToEnd(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}
