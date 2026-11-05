// Wires the DOM, the port and the view together. World scale: see pixelsPerUnit in LevelBuilder.js.
import { FIXED_DT } from './Mathf.js';
import { PlayerStatsSO, COLLIDER } from './PlayerStatsSO.js';
import { PlayerController } from './PlayerController.js';
import { AirborneState } from './States/AirborneState.js';
import { GroundedState } from './States/GroundedState.js';
import { ScriptInput, ZERO_FRAME } from './BotInput.js';
import { InputHandler } from './InputHandler.js';
import { Page } from './Page.js';
import { startReel } from './Reel.js';
import { View } from './View.js';
import { buildLevel, clearGlyphCache } from './LevelBuilder.js';
import { isPlaying as playingRule, lastActiveAt, RESUME_IDLE_MS } from './titlePress.js';
import { SLEEP_AFTER_MS, PLANNER_WATCHDOG_MS, skipVisible, atRest, resizeNeedsRelevel, clampToLevel, heroInPlay, pushCapped, guarded } from './lifecycle.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPAWN_AT = 0.5;
const GESTURE_GAP_MS = 220;
const LOG_LIMIT = 500;

// Spec section 3: the stacked phone layout has no run, the character only falls and can be played.
// Each game opens as it comes into view instead.
const phoneQuery = matchMedia('(max-aspect-ratio: 1/1)');
const isPhoneLayout = () => phoneQuery.matches;

const sinceLoad = () => performance.now() / 1000;

const log = [];
const note = (kind, data = {}) => pushCapped(log, { t: +sinceLoad().toFixed(3), kind, ...data }, LOG_LIMIT);

let page, view, level, ctx, human, plan, frames = null, frameBase = 0;
let mode = 'idle'; // idle | planning | bot | replanning | done | human
let wordsLeft = ['oro', 'goka', 'kiss'];
let acc = 0, lastNow = 0, asleep = true;
let prevPos = { x: 0, y: 0 }, lastThrow = 0;
let replanWhenGrounded = false;
let heroVisible = true, quietSince = 0, skipButton = null, dead = false;
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

function handleEvents(c) {
  for (const e of c.Events) {
    if (e.t === 'contact') {
      page.onContact(e);
      if (e.dir.y < 0) view.noteLanding(e.speed);
      if (e.speed >= 12 && (level.isGameTitle(e.word) || e.word === 'name')) page.dent(e);
      note('contact', { word: e.word, speed: +e.speed.toFixed(1) });
    } else if (e.t === 'impact') {
      page.flood(e);
      note('impact', { word: e.word, speed: +e.speed.toFixed(1), tick: e.tick });
      wordsLeft = wordsLeft.filter((w) => w !== e.word);
      page.setDay(3 - wordsLeft.length);
      if (mode === 'human' && !wordsLeft.length) view.fadeTrail();
    } else if (e.t === 'launch') {
      note('launch', { tick: e.tick });
    }
  }
  c.Events.length = 0;
}

// --- One physics tick ---

let lastHumanAt = 0;
// Holding, moving or airborne counts. Standing still for 1.5 s hands the titles back to the links.
function isPlaying() {
  if (!ctx) return false;
  return playingRule({
    humanMode: mode === 'human',
    neutral: human.neutral,
    grounded: ctx.CurrentState instanceof GroundedState,
    idleMs: performance.now() - lastHumanAt,
  });
}

function resumeIfIdle() {
  const now = performance.now();
  const grounded = ctx.CurrentState instanceof GroundedState;
  lastHumanAt = lastActiveAt({ humanMode: mode === 'human', neutral: human.neutral, grounded, was: lastHumanAt, now });
  if (mode !== 'human' || !human.neutral || !grounded) return;
  if (!wordsLeft.length || ctx.IsPaused) return;
  if (now - lastHumanAt < RESUME_IDLE_MS) return;
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
  // The trail is the working-out of a run. The bot's last stretch still draws; after that, nothing.
  if (mode === 'bot' || wordsLeft.length) stampTick(ctx);
  handleEvents(ctx);
  resumeIfIdle();

  if (replanWhenGrounded && ctx.CurrentState instanceof GroundedState && !ctx.IsPaused) {
    replanWhenGrounded = false;
    if (wordsLeft.length) startReplan();
    else finishRun();
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

// No run is going to finish: everything opens, and whatever is in the air comes down by itself.
// The phone layout opens by what is in view, not by a run.
function abandonRun() {
  cancelPlan();
  wordsLeft = [];
  if (!isPhoneLayout()) page.revealAll();
}

function watchGamesOnPhone() {
  const games = document.querySelectorAll('.game');
  let opened = 0;
  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    if (!isPhoneLayout()) return;
    for (const entry of entries) {
      const id = entry.target.dataset.word;
      if (entry.intersectionRatio < 0.5 || seen.has(id)) continue;
      seen.add(id);
      page.revealFromTitle(id);
      page.setDay(++opened);
    }
  }, { threshold: 0.5 });
  games.forEach((game) => observer.observe(game));
}

function syncSkip() {
  const hide = !skipVisible({ mode, phone: isPhoneLayout() });
  if (skipButton.hidden !== hide) skipButton.hidden = hide;
}

// Ends the run where it stands. The character keeps falling and lands on its own. If it has not
// spawned yet, spawnIfReady drops it with no plan.
function skipRun() {
  abandonRun();
  if (ctx && mode === 'human') ctx.Input = new ScriptInput();
  mode = 'done';
  view.fadeTrail();
  syncSkip();
  note('skip');
  wake();
}

// --- Hand over at current velocity. No reset, no restart: the same controller, a new input. ---

function takeControl() {
  if (!ctx || mode === 'human') { wake(); return; }
  note('handover', { vx: +ctx.Velocity.x.toFixed(3), vy: +ctx.Velocity.y.toFixed(3), state: ctx.CurrentState.constructor.name });
  mode = 'human';
  cancelPlan();
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
    cancelPlan();
    mode = 'bot';
    replanWhenGrounded = true;
  }
  wake();
}

function bindScroll() {
  let lastY = window.scrollY, lastT = performance.now();
  // One throw per gesture, for whichever of the two events sees it first: a wheel turn fires both.
  // A gap of GESTURE_GAP_MS ends a gesture. Never during a held rope, or on a pinch or Ctrl-zoom.
  let lastEvent = 0, spent = false;
  const seeGesture = (now) => {
    if (now - lastEvent >= GESTURE_GAP_MS) spent = false;
    lastEvent = now;
    if (!human.neutral) spent = true;
  };

  window.addEventListener('wheel', (e) => {
    seeGesture(performance.now());
    if (e.ctrlKey) spent = true;
    if (spent || !isHeroInPlay()) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (Math.abs(dy) + Math.abs(dx) < 4) return;
    spent = true;
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
    seeGesture(now);
    if (!heroVisible) return;
    // The character is on a canvas fixed to the window, so a sleeping loop has to redraw it.
    wake();
    if (!isHeroInPlay()) return;
    const pxPerS = Math.abs(dy) / (dt / 1000);
    if (spent || pxPerS < 240) return;
    spent = true;
    const up = Math.min(46, (pxPerS / level.ppu) * 0.3);
    const towardCentre = ctx ? Math.sign(level.width / 2 - ctx.PlayerRigidbody.position.x) : 1;
    throwCharacter(towardCentre * up * 0.3, up);
  }, { passive: true });
}

// --- Planning runs in a worker, so that it cannot cost a frame ---

let worker = null, planSeq = 0, planPending = false, planWatchdog = 0;

// A search nobody wants would hold up the next one for its whole budget, so it goes with its
// worker. The promise of a cancelled plan never settles.
function cancelPlan() {
  if (planPending && worker) {
    worker.terminate();
    worker = null;
  }
  clearTimeout(planWatchdog);
  planSeq++;
  planPending = false;
  plan = null;
  frames = null;
  replanWhenGrounded = false;
}

// Settles with the planner's answer, which is null when it found no route. A worker that fails
// to load, throws or says nothing for too long counts as no route.
function askPlanner(msg) {
  const id = ++planSeq;
  planPending = true;
  return new Promise((resolve) => {
    const settle = (result) => {
      if (id !== planSeq) return;
      clearTimeout(planWatchdog);
      planPending = false;
      resolve(result);
    };
    const fail = () => {
      if (worker) worker.terminate();
      worker = null;
      note('plannerError');
      console.warn('The planner worker failed; opening everything and dropping the character.');
      page.revealAll();
      settle(null);
    };
    try {
      if (!worker) worker = new Worker(new URL('./planner-worker.js', import.meta.url), { type: 'module' });
    } catch {
      fail();
      return;
    }
    worker.onerror = fail;
    worker.onmessage = (e) => { if (e.data.id === id) settle(e.data.result); };
    worker.postMessage({ id, level: level.toJSON(), collider: COLLIDER, ...msg });
    planWatchdog = setTimeout(fail, PLANNER_WATCHDOG_MS);
  });
}

function startPlan() {
  mode = 'planning';
  if (isPhoneLayout()) {
    abandonRun();
    note('phone');
    return;
  }
  askPlanner({ kind: 'first' }).then((result) => {
    plan = result;
    note('planned', plan ? { ms: plan.ms, sims: plan.sims, ticks: plan.ticks, seconds: plan.seconds, miss: plan.miss, impacts: plan.impacts, on: plan.landedOn } : { failed: true });
    if (!plan) console.warn('Planner found no full route for this layout; dropping the character without a route.');
  });
}

function startReplan() {
  mode = 'replanning';
  const askedAt = performance.now();
  askPlanner({ kind: 'here', pos: ctx.PlayerRigidbody.position, words: wordsLeft, tickCount: ctx.TickCount }).then((result) => {
    if (mode !== 'replanning') return;
    if (result) {
      frames = result.frames;
      frameBase = ctx.TickCount;
      mode = 'bot';
      note('replanned', { ms: result.ms, sims: result.sims });
    } else {
      mode = 'done';
      abandonRun();
      const { x, y } = ctx.PlayerRigidbody.position;
      note('replanFailed', { x: +x.toFixed(2), y: +y.toFixed(2), on: ctx.PhysicsHandler.GroundRect?.word, ms: Math.round(performance.now() - askedAt) });
    }
    wake();
  });
  wake();
}

function spawnIfReady() {
  if (ctx || planPending || sinceLoad() < SPAWN_AT) return;
  if (mode !== 'planning' && mode !== 'done') return;
  const spawn = plan ? plan.spawn : level.spawns[0] || { x: (level.left + level.width) / 2, y: level.top - 1 };
  ctx = makeController(new ScriptInput(), spawn);
  frames = plan ? plan.frames : null;
  frameBase = 0;
  mode = plan ? 'bot' : 'done';
  if (!plan) abandonRun();
  note('spawn', { x: +spawn.x.toFixed(2), y: +spawn.y.toFixed(2) });
  // A press made before there was anyone to control. Left alone, its slingshot never drains.
  if (human.committed) takeControl();
}

// --- Frame loop ---

function wake() {
  quietSince = performance.now();
  if (!asleep || dead || REDUCED || !heroVisible) return;
  asleep = false;
  lastNow = quietSince;
  requestAnimationFrame(frame);
}

// Whether keys and throws are the game's. The loop itself runs while any of the hero shows.
function isHeroInPlay() {
  if (dead) return false;
  const { top, bottom } = page.hero.getBoundingClientRect();
  return heroInPlay({ top, bottom, viewportHeight: window.innerHeight });
}

// Off screen nothing ticks and the loop sleeps, so the run waits exactly where it was.
function watchHero() {
  new IntersectionObserver((entries) => {
    heroVisible = entries.at(-1).isIntersecting;
    note('heroVisible', { visible: heroVisible });
    if (heroVisible) {
      wake();
    } else {
      acc = 0;
      view.clearActor();
    }
  }).observe(page.hero);
}

function canSleep(now) {
  if (!ctx) return false;
  const rest = atRest({
    mode,
    wordsLeft: wordsLeft.length,
    grounded: ctx.CurrentState instanceof GroundedState,
    paused: ctx.IsPaused,
    settled: page.settled,
    neutral: human.neutral,
    speed: Math.hypot(ctx.Velocity.x, ctx.Velocity.y),
  });
  if (!rest) quietSince = now;
  // Only with the eyes open, because the last frame drawn stays on screen.
  return rest && now - quietSince >= SLEEP_AFTER_MS && view.blinkT < 0;
}

// Nothing more will be drawn, so the page goes back to its plain form with all of its work showing.
function failFrame(err) {
  console.error(err);
  dead = true;
  asleep = true;
  const root = document.documentElement;
  root.classList.remove('js', 'playing');
  note('frameError', { message: String(err && err.message) });
  human.disable();
  cancelPlan();
  try {
    view.clearActor();
  } catch {
    // It was the view that broke, then.
  }
}

const frame = guarded((now) => {
  if (!heroVisible) {
    acc = 0;
    asleep = true;
    return;
  }
  document.documentElement.classList.toggle('playing', isPlaying());
  // A frame woken between two vsyncs can carry a timestamp from just before the wake.
  const elapsed = Math.max(0, now - lastNow);
  const t0 = performance.now();
  const dt = Math.min(0.1, elapsed / 1000);
  perf.frames.push(elapsed);
  lastNow = now;

  spawnIfReady();
  syncSkip();

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

  if (canSleep(now)) {
    asleep = true;
    note('sleep');
    return;
  }
  requestAnimationFrame(frame);
}, failFrame);

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

// --- Reduced motion: the last frame, on the first frame. No run, so no planning to wait for. ---

function drawStill() {
  page.update(0, false);
  view.draw(currentRenderState(0), 0);
}

function showLastFrame() {
  mode = 'done';
  wordsLeft = [];
  page.revealAll();
  const cv = page.contact.querySelector('.cv').getBoundingClientRect();
  // Below everything: the clamp stands it on the floor.
  const spot = clampToLevel({ x: (cv.left + cv.width / 2) / level.ppu, y: -Infinity }, level, COLLIDER);
  ctx = makeController(new ScriptInput(), spot);
  for (let i = 0; i < 50 && !(ctx.CurrentState instanceof GroundedState); i++) ctx.Tick();
  ctx.Events.length = 0;
  prevPos = { ...ctx.PlayerRigidbody.position };
  acc = 0;
  view.landAge = 1;
  drawStill();
  note('lastFrame', { on: ctx.PhysicsHandler.GroundRect?.word });
}

// --- Resize: rebuild the level from the new letter rectangles. Nothing is keyframed. ---

let resizeTimer = 0;
let lastW = 0, lastH = 0, lastPhone = false;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = document.documentElement.clientWidth, h = window.innerHeight, phone = isPhoneLayout();
    if (!resizeNeedsRelevel({ w, h, phone, lastW, lastH, lastPhone })) return;
    lastW = w; lastH = h; lastPhone = phone;
    relevel();
  }, 140);
}

function relevel() {
  const old = level;
  const oldCtx = ctx;
  page.clearReactions();
  buildAll();
  note('relevel', { w: lastW, h: lastH, rects: level.rects.length, nodes: level.nodes.length, spawns: level.spawns.length });

  if (REDUCED) {
    showLastFrame();
    return;
  }
  view.clearTrail();
  const phone = isPhoneLayout();
  const running = mode === 'bot' || mode === 'replanning';
  // Any answer still on its way is about the old level.
  cancelPlan();
  if (phone) {
    // The stacked layout has no run. Coming back to the desktop layout does not bring one back:
    // what opened stays open and the mode stays done.
    wordsLeft = [];
    if (running) mode = 'done';
    note('phone');
  } else if (!wordsLeft.length) {
    // Back from the stacked layout with games it never scrolled to.
    page.revealAll();
  }
  if (!oldCtx) {
    // Still waiting to spawn. With no words left, spawnIfReady drops the character with no plan.
    if (mode === 'planning' && wordsLeft.length) startPlan();
    wake();
    return;
  }

  // Keep the character, at its proportional place, and carry on through the new level.
  const px = oldCtx.PlayerRigidbody.position;
  const pos = clampToLevel({ x: px.x * (level.width / old.width), y: (px.y * old.ppu) / level.ppu }, level, COLLIDER);
  const vel = oldCtx.IsPaused ? { ...oldCtx._velocityCache } : { ...oldCtx.Velocity };
  const c = new PlayerController(PlayerStatsSO, level, mode === 'human' ? human : new ScriptInput(), COLLIDER);
  c.PlayerRigidbody.position = pos;
  c.TickCount = oldCtx.TickCount;
  c.TransitionToState(new AirborneState(c, vel));
  ctx = c;
  prevPos = { ...pos };
  if (running && !phone) {
    mode = 'bot';
    replanWhenGrounded = true;
  }
  wake();
}

const loadedFaces = () => [...document.fonts].filter((f) => f.status === 'loaded').length;
let measuredFaces = 0;

// A font that arrives after the level was measured moves every letter under the character. The
// browser can deliver this event long after the load it reports, so only a new face counts: a
// font that came in during the wait at boot was already measured.
function onLateFont() {
  const faces = loadedFaces();
  if (faces === measuredFaces) return;
  measuredFaces = faces;
  note('lateFont', { anton: document.fonts.check('100px Anton') });
  clearGlyphCache();
  page.remeasure();
  relevel();
}

// --- Boot ---

async function boot() {
  // Too late: the fallback already gave the page its plain form, and a run would start on top of it.
  if (!document.documentElement.classList.contains('js')) return;
  window.__booted = true;
  note('boot');
  startReel({ video: document.querySelector('.sling video'), reduced: REDUCED, isPhoneLayout });
  // Measure only once Anton is really in, and never wait long for it.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('100px Anton', 'Eren Köselerli'), document.fonts.ready]),
      new Promise((res) => setTimeout(res, 1200)),
    ]);
  } catch { /* The fallback font still makes a playable level. */ }
  note('fontsReady', { anton: document.fonts.check('100px Anton') });

  page = new Page();
  skipButton = document.querySelector('.skip');
  view = new View(isPhoneLayout);
  page.onDay = () => view.syncColors();
  lastW = document.documentElement.clientWidth;
  lastH = window.innerHeight;
  lastPhone = isPhoneLayout();
  measuredFaces = loadedFaces();
  buildAll();
  document.fonts.addEventListener('loadingdone', onLateFont);
  window.addEventListener('resize', onResize);

  if (DEBUG) {
    window.__site = {
      get ctx() { return ctx; }, get level() { return level; }, get plan() { return plan; }, get mode() { return mode; },
      get wordsLeft() { return wordsLeft; }, get asleep() { return asleep; },
      log, perf, page, view, relevel, skipRun, isHeroInPlay,
      get heroVisible() { return heroVisible; },
    };
  }

  if (REDUCED) {
    // The character is on a canvas fixed to the window, so it has to follow the page by hand.
    window.addEventListener('scroll', drawStill, { passive: true });
    showLastFrame();
    return;
  }

  human = new InputHandler({
    onEngage: takeControl,
    isPlaying,
    isHeroVisible: isHeroInPlay,
    screenToWorld: (x, y) => ({ x: x / level.ppu, y: -(y + window.scrollY) / level.ppu }),
  });
  bindScroll();
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('keydown', wake);
  skipButton.addEventListener('click', skipRun);
  watchHero();
  watchGamesOnPhone();

  startPlan();
  wake();
}

// A boot that breaks halfway must not leave the work hidden: the page falls back to its plain form.
boot().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove('js');
});
