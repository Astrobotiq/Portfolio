// Wires the DOM, the port and the view together. World scale: see pixelsPerUnit in LevelBuilder.js.
import { FIXED_DT } from './Mathf.js';
import { PlayerStatsSO, COLLIDER } from './PlayerStatsSO.js';
import { PlayerController } from './PlayerController.js';
import { AirborneState } from './States/AirborneState.js';
import { GroundedState } from './States/GroundedState.js';
import { ScriptInput, ZERO_FRAME } from './BotInput.js';
import { InputHandler } from './InputHandler.js';
import { Page } from './Page.js';
import { View } from './View.js';
import { buildLevel } from './LevelBuilder.js';

const params = new URLSearchParams(location.search);
const RESUME_AFTER_MS = 3500; // A visitor who stops playing gets the rest of the run back.
const DEBUG = params.get('debug') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPAWN_AT = 0.5;

// Spec section 3: the stacked phone layout has no run, the character only falls and can be played.
const isPhoneLayout = () => matchMedia('(max-aspect-ratio: 1/1)').matches;

const sinceLoad = () => performance.now() / 1000;

const log = [];
const note = (kind, data = {}) => log.push({ t: +sinceLoad().toFixed(3), kind, ...data });

let page, view, level, ctx, human, plan, frames = null, frameBase = 0;
let mode = 'idle'; // idle | planning | bot | replanning | done | human
let wordsLeft = ['oro', 'goka', 'kiss'];
let acc = 0, lastNow = 0, asleep = true;
let prevPos = { x: 0, y: 0 }, lastThrow = 0;
let replanWhenGrounded = false;
const perf = { frames: [], work: [] };

function makeController(input, pos) {
  const c = new PlayerController(PlayerStatsSO, level, input, COLLIDER);
  c.PlayerRigidbody.position = { ...pos };
  c.TransitionToState(new AirborneState(c, { x: 0, y: 0 }));
  return c;
}

function buildAll() {
  level = buildLevel(page, COLLIDER, isPhoneLayout());
  page.bindLevel(level);
  page.layoutCols();
  view.resize(level, page.hero, COLLIDER);
}

// --- Events from the simulation drive every page reaction ---

function handleEvents(c, { quiet = false } = {}) {
  for (const e of c.Events) {
    if (e.t === 'contact') {
      if (!quiet) page.onContact(e);
      if (e.dir.y < 0 && !quiet) view.noteLanding(e.speed);
      if (e.speed >= 12 && (level.isGameTitle(e.word) || e.word === 'name')) page.dent(e);
      if (!quiet) note('contact', { word: e.word, speed: +e.speed.toFixed(1) });
    } else if (e.t === 'impact') {
      if (!quiet) { page.flood(e); note('impact', { word: e.word, speed: +e.speed.toFixed(1), tick: e.tick }); }
      wordsLeft = wordsLeft.filter((w) => w !== e.word);
      if (!quiet) page.setDay(3 - wordsLeft.length);
      if (!quiet && mode === 'human' && !wordsLeft.length) view.fadeTrail();
    } else if (e.t === 'launch' && !quiet) {
      note('launch', { tick: e.tick });
    }
  }
  c.Events.length = 0;
}

// --- One physics tick ---

let lastHumanAt = 0;
// Holding, moving or airborne counts. Standing still for 1.5 s hands the titles back to the links.
function isPlaying() {
  if (mode !== 'human' || !ctx) return false;
  if (!human.neutral) return true;
  return !(ctx.CurrentState instanceof GroundedState && performance.now() - lastHumanAt > 1500);
}

function resumeIfIdle() {
  if (mode !== 'human' || !human.neutral) { lastHumanAt = performance.now(); return; }
  if (!wordsLeft.length || ctx.IsPaused || !(ctx.CurrentState instanceof GroundedState)) return;
  if (performance.now() - lastHumanAt < RESUME_AFTER_MS) return;
  note('resume', { words: wordsLeft.length });
  ctx.Input = new ScriptInput();
  startReplan();
}

function tick() {
  if (mode === 'bot' && frames) {
    const i = ctx.TickCount - frameBase;
    if (i < frames.length) ctx.Input.apply(frames[i]);
    else {
      ctx.Input.apply(ZERO_FRAME);
      if (ctx.CurrentState instanceof GroundedState) finishRun();
    }
  } else if (mode === 'human') {
    human.Sample(ctx);
  } else {
    ctx.Input.apply(ZERO_FRAME);
  }
  prevPos = { ...ctx.PlayerRigidbody.position };
  ctx.Tick();
  stampTick(ctx);
  handleEvents(ctx);
  resumeIfIdle();

  if (replanWhenGrounded && ctx.CurrentState instanceof GroundedState && !ctx.IsPaused) {
    replanWhenGrounded = false;
    startReplan();
  }
}

function anchorsOf(c) {
  const out = [];
  if (c.RightAnchor) out.push(c.RightAnchor);
  if (c.LeftAnchor && c.LeftAnchor !== c.RightAnchor) out.push(c.LeftAnchor);
  return out;
}

// Stamps go down at physics ticks, hit stop included, so they pile up during a freeze.
function stampTick(c) {
  const p = c.PlayerRigidbody.position;
  const v = c.IsPaused ? { x: 0, y: 0 } : c.Velocity;
  view.stamp(p.x, p.y, v.x, v.y, anchorsOf(c));
}

function finishRun() {
  mode = 'done';
  frames = null;
  wordsLeft = [];
  page.revealAll();
  view.fadeTrail();
  note('runEnd', { on: ctx.PhysicsHandler.GroundRect?.word });
}

// Ends the run where it stands. The character keeps falling and lands on its own.
function skipRun() {
  planSeq++;
  planPending = false;
  plan = null;
  frames = null;
  replanWhenGrounded = false;
  wordsLeft = [];
  if (ctx) {
    if (mode === 'human') ctx.Input = new ScriptInput();
    mode = 'done';
  } // Otherwise it is still planning: with no plan, spawnIfReady drops the character and finishes.
  page.revealAll();
  view.fadeTrail();
  note('skip');
  wake();
}

// --- Hand over at current velocity. No reset, no restart: the same controller, a new input. ---

function takeControl() {
  if (!ctx || mode === 'human') { wake(); return; }
  note('handover', { vx: +ctx.Velocity.x.toFixed(3), vy: +ctx.Velocity.y.toFixed(3), state: ctx.CurrentState.constructor.name });
  mode = 'human';
  frames = null;
  planSeq++;
  planPending = false;
  replanWhenGrounded = false;
  ctx.Input = human;
  wake();
}

// --- Scroll or flick throws the character ---

function throwCharacter(vx, vy) {
  if (!ctx || REDUCED) return;
  const nowS = performance.now();
  if (nowS - lastThrow < 160) return;
  lastThrow = nowS;
  const cap = PlayerStatsSO.MaxSlingshotSpeed;
  const c = ctx;
  const v = { x: Math.max(-cap, Math.min(cap, c.Velocity.x + vx)), y: Math.max(-cap, Math.min(cap, c.Velocity.y + vy)) };
  c.LeftAnchor = null;
  c.RightAnchor = null;
  if (c.IsPaused) c._velocityCache = v;
  // Same call LaunchPad-style surfaces make in the game: straight into AirborneState.
  c.TransitionToState(new AirborneState(c, v, { grappleLockout: 0.1 }));
  note('throw', { vx: +v.x.toFixed(2), vy: +v.y.toFixed(2) });
  if (mode === 'bot' || mode === 'replanning') {
    frames = null;
    planSeq++;
    planPending = false;
    mode = 'bot';
    replanWhenGrounded = true;
  }
  wake();
}

function bindScroll() {
  let lastY = window.scrollY, lastT = performance.now();
  let lastWheel = 0;
  window.addEventListener('wheel', (e) => {
    // One throw per gesture, never during a held rope, never on a pinch or Ctrl-zoom.
    const nowW = performance.now();
    const sameGesture = nowW - lastWheel < 220;
    lastWheel = nowW;
    if (sameGesture || e.ctrlKey || !human.neutral) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (Math.abs(dy) + Math.abs(dx) < 4) return;
    const up = Math.min(46, Math.abs(dy) * 0.16 + 6);
    const towardCentre = ctx ? Math.sign(level.width / 2 - ctx.PlayerRigidbody.position.x) : 1;
    throwCharacter(dx * 0.12 + towardCentre * up * 0.3, up);
  }, { passive: true });

  window.addEventListener('scroll', () => {
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    const dy = window.scrollY - lastY;
    lastY = window.scrollY;
    lastT = now;
    if (!level) return;
    const pxPerS = Math.abs(dy) / (dt / 1000);
    if (pxPerS < 240) { wake(); return; }
    const up = Math.min(46, (pxPerS / level.ppu) * 0.3);
    const towardCentre = ctx ? Math.sign(level.width / 2 - ctx.PlayerRigidbody.position.x) : 1;
    throwCharacter(towardCentre * up * 0.3, up);
  }, { passive: true });
}

// --- Planning runs in a worker, so that it cannot cost a frame ---

let worker = null, planSeq = 0, planPending = false;

function askPlanner(msg) {
  if (!worker) {
    worker = new Worker(new URL('./planner-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => { planPending = false; page.revealAll(); };
  }
  const id = ++planSeq;
  planPending = true;
  return new Promise((resolve) => {
    const listener = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', listener);
      if (id === planSeq) planPending = false;
      resolve(id === planSeq ? e.data.result : undefined);
    };
    worker.addEventListener('message', listener);
    worker.postMessage({ id, level: level.toJSON(), collider: COLLIDER, ...msg });
  });
}

function startPlan() {
  mode = 'planning';
  if (isPhoneLayout()) {
    plan = null;
    wordsLeft = [];
    page.revealAll();
    note('phone');
    return;
  }
  askPlanner({ kind: 'first' }).then((result) => {
    if (result === undefined) return;
    plan = result;
    note('planned', plan ? { ms: plan.ms, sims: plan.sims, ticks: plan.ticks, seconds: plan.seconds, miss: plan.miss, impacts: plan.impacts, on: plan.landedOn } : { failed: true });
    if (!plan) console.warn('Planner found no full route for this layout; dropping the character without a route.');
  });
}

function startReplan() {
  mode = 'replanning';
  askPlanner({ kind: 'here', pos: ctx.PlayerRigidbody.position, words: wordsLeft, tickCount: ctx.TickCount }).then((result) => {
    if (result === undefined || mode !== 'replanning') return;
    if (result) {
      frames = result.frames;
      frameBase = ctx.TickCount;
      mode = 'bot';
      note('replanned', { ms: result.ms, sims: result.sims });
    } else {
      mode = 'done';
      wordsLeft = [];
      page.revealAll();
      note('replanFailed');
    }
    wake();
  });
  wake();
}

function spawnIfReady() {
  if (mode !== 'planning' || planPending || sinceLoad() < SPAWN_AT) return;
  const spawn = plan ? plan.spawn : level.spawns[0] || { x: (level.left + level.width) / 2, y: level.top - 1 };
  ctx = makeController(new ScriptInput(), spawn);
  frames = plan ? plan.frames : null;
  frameBase = 0;
  mode = plan ? 'bot' : 'done';
  if (!plan) {
    wordsLeft = [];
    page.revealAll();
  }
  note('spawn', { x: +spawn.x.toFixed(2), y: +spawn.y.toFixed(2) });
}

// --- Frame loop ---

function wake() {
  if (asleep && !REDUCED) {
    asleep = false;
    lastNow = performance.now();
    requestAnimationFrame(frame);
  }
}

function frame(now) {
  document.documentElement.classList.toggle('playing', isPlaying());
  const t0 = performance.now();
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  perf.frames.push(now - lastNow);
  lastNow = now;

  spawnIfReady();

  if (ctx) {
    acc += dt;
    let guard = 0;
    while (acc >= FIXED_DT && guard++ < 8) {
      tick();
      acc -= FIXED_DT;
    }
    if (guard >= 8) acc = 0;
  }

  if (ctx) render(dt);
  else page.update(dt, false);

  perf.work.push(performance.now() - t0);
  if (perf.frames.length > 4000) { perf.frames.splice(0, 2000); perf.work.splice(0, 2000); }

  requestAnimationFrame(frame);
}

function currentRenderState(dt) {
  const p = ctx.PlayerRigidbody.position;
  const a = Math.min(1, acc / FIXED_DT);
  const x = prevPos.x + (p.x - prevPos.x) * a;
  const y = prevPos.y + (p.y - prevPos.y) * a;
  const frozen = ctx.IsPaused;
  const anchors = anchorsOf(ctx);
  page.update(dt, frozen);
  const charPx = { x: x * level.ppu, y: -y * level.ppu };
  page.setTug(anchors.map((n) => n.letter), charPx, frozen);
  const ground = ctx.CurrentState instanceof GroundedState ? ctx.PhysicsHandler.GroundRect : null;
  const ride = ground && ground.letter >= 0 ? page.letterOffset(ground.letter) : { x: 0, y: 0 };
  const v = frozen ? { x: 0, y: 0 } : ctx.Velocity;
  return {
    x, y, vx: v.x, vy: v.y, frozen, ride,
    anchors: anchors.map((n) => {
      const off = page.letterOffset(n.letter);
      return { x: n.x, y: n.y, ox: off.x, oy: off.y };
    }),
  };
}

function render(dt) {
  view.draw(currentRenderState(dt), dt);
}

// --- The long exposure: the same run, run to the end without drawing a frame ---

async function runStill() {
  const result = isPhoneLayout() ? null : await askPlanner({ kind: 'first' });
  if (result === undefined) return;
  plan = result;
  note('stillPlanned', plan ? { ms: plan.ms, sims: plan.sims, ticks: plan.ticks, miss: plan.miss, impacts: plan.impacts } : { failed: true });
  page.revealAll();
  if (!plan) { wordsLeft = []; return; }

  ctx = makeController(new ScriptInput(), plan.spawn);
  view.clearTrail();
  page.clearReactions();
  wordsLeft = ['oro', 'goka', 'kiss'];
  for (const f of plan.frames) {
    ctx.Input.apply(f);
    ctx.Tick();
    stampTick(ctx);
    handleEvents(ctx, { quiet: true });
  }
  prevPos = { ...ctx.PlayerRigidbody.position };
  acc = 0;
  mode = 'done';
  view.landAge = 1;
  page.update(0, false);
  view.draw(currentRenderState(0), 0);
  note('stillDone', { on: ctx.PhysicsHandler.GroundRect?.word });
}

// --- Resize: rebuild the level from the new letter rectangles. Nothing is keyframed. ---

let resizeTimer = 0;
let lastW = 0, lastH = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = document.documentElement.clientWidth, h = window.innerHeight;
    // A phone's collapsing URL bar changes only the height by a little: not a new level.
    if (w === lastW && Math.abs(h - lastH) < 120) return;
    lastW = w; lastH = h;
    relevel();
  }, 140);
}

function relevel() {
  const old = level;
  const oldCtx = ctx;
  const wasMode = mode;
  page.clearReactions();
  buildAll();
  note('relevel', { w: lastW, h: lastH, rects: level.rects.length, nodes: level.nodes.length, spawns: level.spawns.length });

  if (REDUCED || wasMode === 'done') {
    runStill();
    return;
  }
  view.clearTrail();
  if (!oldCtx) { startPlan(); wake(); return; }

  // Mid-run: keep the character, at its proportional place, and carry on through the new level.
  const px = oldCtx.PlayerRigidbody.position;
  const sx = level.width / old.width;
  const pos = { x: Math.min(level.width - 0.5, Math.max(0.5, px.x * sx)), y: (px.y * old.ppu) / level.ppu };
  const vel = { ...oldCtx.Velocity };
  const c = new PlayerController(PlayerStatsSO, level, wasMode === 'human' ? human : new ScriptInput(), COLLIDER);
  c.PlayerRigidbody.position = pos;
  c.TickCount = oldCtx.TickCount;
  c.TransitionToState(new AirborneState(c, vel));
  ctx = c;
  prevPos = { ...pos };
  frames = null;
  if (wasMode !== 'human') {
    mode = 'bot';
    replanWhenGrounded = true;
  }
  wake();
}

// --- Boot ---

async function boot() {
  window.__booted = true;
  note('boot');
  // Measure only once Anton is really in, and never wait long for it.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('100px Anton', 'Eren Köselerli'), document.fonts.ready]),
      new Promise((res) => setTimeout(res, 1200)),
    ]);
  } catch { /* The fallback font still makes a playable level. */ }
  note('fontsReady', { anton: document.fonts.check('100px Anton') });

  page = new Page();
  view = new View(isPhoneLayout);
  page.onDay = () => view.syncColors();
  lastW = document.documentElement.clientWidth;
  lastH = window.innerHeight;
  buildAll();

  human = new InputHandler({
    onEngage: takeControl,
    isPlaying,
    screenToWorld: (x, y) => ({ x: x / level.ppu, y: -(y + window.scrollY) / level.ppu }),
  });
  bindScroll();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', () => { if (asleep && ctx && !REDUCED) { view.draw(currentRenderState(0), 0); } }, { passive: true });

  if (DEBUG) {
    window.__site = {
      get ctx() { return ctx; }, get level() { return level; }, get plan() { return plan; }, get mode() { return mode; },
      get wordsLeft() { return wordsLeft; },
      log, perf, page, view, relevel, skipRun,
    };
  }

  if (REDUCED) {
    runStill();
    return;
  }
  startPlan();
  wake();
}

boot();
