import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaying, lastActiveAt, pressOutcome, keyBelongsToGame, TITLE_HOLD_MS, TITLE_MOVE_PX, PLAY_IDLE_MS, RESUME_IDLE_MS } from '../js/level/titlePress.js';

test('constants', () => {
  assert.equal(TITLE_HOLD_MS, 400);
  assert.equal(TITLE_MOVE_PX, 12);
  assert.equal(PLAY_IDLE_MS, 1500);
  assert.equal(RESUME_IDLE_MS, 3500);
});

test('pressOutcome follows the spec table', () => {
  const out = (o) => pressOutcome({ playing: false, heldMs: 60, movedPx: 0, touch: false, modifier: false, ...o });
  assert.equal(out({}), 'steam');
  assert.equal(out({ heldMs: 400 }), 'swing');
  assert.equal(out({ heldMs: 399 }), 'steam');
  assert.equal(out({ movedPx: 12 }), 'steam');
  assert.equal(out({ movedPx: 13 }), 'swing');
  assert.equal(out({ movedPx: 13, touch: true }), 'scroll');
  assert.equal(out({ playing: true }), 'swing');
  assert.equal(out({ playing: true, modifier: true }), 'steam');
});

test('isPlaying', () => {
  assert.equal(isPlaying({ humanMode: false, neutral: true, grounded: true, idleMs: 0 }), false);
  assert.equal(isPlaying({ humanMode: true, neutral: false, grounded: true, idleMs: 9999 }), true);
  assert.equal(isPlaying({ humanMode: true, neutral: true, grounded: false, idleMs: 9999 }), true);
  assert.equal(isPlaying({ humanMode: true, neutral: true, grounded: true, idleMs: 1499 }), true);
  assert.equal(isPlaying({ humanMode: true, neutral: true, grounded: true, idleMs: 1500 }), false);
});

test('keyBelongsToGame', () => {
  const key = (o) => keyBelongsToGame({ key: 'ArrowDown', engaged: false, heroVisible: true, onFocusedLink: false, ...o });
  assert.equal(key({}), false);
  assert.equal(key({ key: 'j' }), true);
  assert.equal(key({ key: 'k', heroVisible: false }), false, 'J and K wait for the hero too');
  assert.equal(key({ key: 'j', heroVisible: false, engaged: true }), false);
  assert.equal(key({ key: 'j', onFocusedLink: true }), true);
  assert.equal(key({ engaged: true }), true);
  assert.equal(key({ engaged: true, heroVisible: false }), false);
  assert.equal(key({ engaged: true, key: ' ', onFocusedLink: true }), false);
  assert.equal(key({ engaged: true, key: ' ' }), true);
  assert.equal(key({ engaged: true, key: 'Enter' }), false);
  assert.equal(key({ engaged: true, key: 'Tab' }), false);
  assert.equal(key({ engaged: true, key: 'w' }), true);
});

test('a focused video keeps Space and the arrows', () => {
  const key = (o) => keyBelongsToGame({ key: ' ', engaged: true, heroVisible: true, onFocusedLink: false, onVideo: true, ...o });
  assert.equal(key({}), false);
  for (const arrow of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) assert.equal(key({ key: arrow }), false, arrow);
  assert.equal(key({ key: 'j' }), true);
  assert.equal(key({ key: 'w' }), true);
  assert.equal(key({ onVideo: false }), true);
});

// Release, fly for 2 s, land, click a title. The clock runs from the landing, not from the release.
test('the titles stay aimed at for 1.5 s after a landing, however long the flight was', () => {
  const human = { humanMode: true, neutral: true };
  let at = 0;
  const step = (now, grounded) => { at = lastActiveAt({ ...human, grounded, was: at, now }); };
  const playingAt = (now, grounded) => isPlaying({ ...human, grounded, idleMs: now - at });
  for (let now = 0; now <= 2000; now += 20) step(now, false);
  for (let now = 2020; now <= 3500; now += 20) step(now, true);
  assert.equal(at, 2000);
  assert.equal(playingAt(3000, true), true, 'one second after landing');
  assert.equal(playingAt(3499, true), true);
  assert.equal(playingAt(3500, true), false);
});

test('lastActiveAt holds only for a neutral, landed human', () => {
  const next = (o) => lastActiveAt({ humanMode: true, neutral: true, grounded: true, was: 5, now: 9, ...o });
  assert.equal(next({}), 5);
  assert.equal(next({ grounded: false }), 9);
  assert.equal(next({ neutral: false }), 9);
  assert.equal(next({ humanMode: false }), 9);
});

test('InputHandler decides a title press the way the rule table says', async () => {
  const stub = { addEventListener() {} };
  globalThis.window = stub;
  globalThis.document = stub;
  const { InputHandler } = await import('../js/level/InputHandler.js');
  const make = (touch) => {
    const h = new InputHandler({ onEngage() {}, screenToWorld: () => ({ x: 0, y: 0 }), isPlaying: () => false });
    h._titlePress = { x: 0, y: 0, at: performance.now(), touch, timer: setTimeout(() => {}, 0) };
    return h;
  };

  const mouse = make(false);
  mouse._decideTitle(13);
  assert.equal(mouse.pointerHeld, true);
  assert.equal(mouse._swallowClick, true);
  assert.equal(mouse._titlePress, null);

  const touch = make(true);
  touch._decideTitle(13);
  assert.equal(touch.pointerHeld, false);
  assert.equal(touch._titlePress, null);

  const timer = make(false);
  timer._decideTitle(0, 400);
  assert.equal(timer.pointerHeld, true);
  assert.equal(timer._swallowClick, true);

  const still = make(false);
  still._decideTitle(0);
  assert.equal(still._titlePress !== null, true, 'a short still press stays a link');
});

test('InputHandler only takes a press that starts inside the hero', async () => {
  const on = {};
  const onDocument = {};
  globalThis.window = { addEventListener(type, fn) { on[type] = fn; } };
  globalThis.document = { addEventListener(type, fn) { onDocument[type] = fn; } };
  const { InputHandler } = await import('../js/level/InputHandler.js');
  const make = () => {
    let engaged = 0;
    const handler = new InputHandler({ onEngage() { engaged += 1; }, screenToWorld: () => ({ x: 0, y: 0 }), isPlaying: () => false });
    return { handler, engagedCount: () => engaged };
  };
  const press = (inHero, pointerType) => on.pointerdown({
    isPrimary: true, button: 0, clientX: 5, clientY: 5, pointerType,
    target: { closest: (selector) => (selector === '#hero' && inHero ? {} : null) },
  });
  const blocked = (listener) => {
    let prevented = false;
    listener({ preventDefault() { prevented = true; } });
    return prevented;
  };

  const outsideMouse = make();
  press(false, 'mouse');
  assert.equal(outsideMouse.handler.pointerHeld, false);
  assert.equal(outsideMouse.handler.engaged, false);
  assert.equal(outsideMouse.handler.pointer, null);
  assert.equal(outsideMouse.engagedCount(), 0);

  const outsideTouch = make();
  press(false, 'touch');
  assert.equal(outsideTouch.handler._pendingTouch, null, 'no hold timer');
  assert.equal(outsideTouch.engagedCount(), 0);
  assert.equal(blocked(onDocument.touchmove), false, 'scrolling stays with the page');
  assert.equal(blocked(on.contextmenu), false, 'the menu stays with the page');

  const insideMouse = make();
  press(true, 'mouse');
  assert.equal(insideMouse.handler.pointerHeld, true);
  assert.equal(insideMouse.handler.engaged, true);
  assert.equal(insideMouse.engagedCount(), 1);
  assert.equal(blocked(onDocument.touchmove), true);
  assert.equal(blocked(on.contextmenu), true);

  const insideTouch = make();
  press(true, 'touch');
  assert.notEqual(insideTouch.handler._pendingTouch, null);
  clearTimeout(insideTouch.handler._pendingTouch);
});

// One InputHandler on stubbed globals, with helpers that speak the browser's events.
async function harness({ isPlaying: playing = () => false } = {}) {
  const on = {};
  globalThis.window = { addEventListener(type, fn) { on[type] = fn; } };
  globalThis.document = { addEventListener() {} };
  const { InputHandler } = await import('../js/level/InputHandler.js');
  let engages = 0;
  const handler = new InputHandler({ onEngage() { engages += 1; }, screenToWorld: () => ({ x: 0, y: 0 }), isPlaying: playing });
  const titleEl = { closest: (sel) => (sel === '#hero' || sel === 'a.title' || sel === 'a, button' ? {} : null) };
  const heroEl = { closest: (sel) => (sel === '#hero' ? {} : null) };
  const press = (target, o = {}) => on.pointerdown({ isPrimary: true, button: 0, clientX: 5, clientY: 5, pointerType: 'mouse', target, ...o });
  const release = () => on.pointerup({ isPrimary: true });
  const click = (target, detail) => {
    let prevented = false;
    on.click({ target, detail, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { on, handler, titleEl, heroEl, press, release, click, engages: () => engages };
}

test('a press that ends as Steam or a swipe does not start the game', async () => {
  const steam = await harness();
  steam.press(steam.titleEl);
  assert.equal(steam.handler.engaged, false, 'still undecided');
  steam.release();
  assert.equal(steam.handler.engaged, false, 'it was a link');

  const held = await harness();
  held.press(held.titleEl);
  held.handler._decideTitle(0, 400);
  assert.equal(held.handler.engaged, true, 'a claimed title starts the game');

  const swipe = await harness();
  swipe.press(swipe.titleEl, { pointerType: 'touch' });
  swipe.on.pointermove({ isPrimary: true, clientX: 5, clientY: 60 });
  assert.equal(swipe.handler.engaged, false, 'a swipe on a title is a scroll');

  const swipeOff = await harness();
  swipeOff.press(swipeOff.heroEl, { pointerType: 'touch' });
  swipeOff.on.pointermove({ isPrimary: true, clientX: 5, clientY: 60 });
  swipeOff.release();
  assert.equal(swipeOff.handler.engaged, false, 'a swipe on the page is a scroll');

  const mouse = await harness();
  mouse.press(mouse.heroEl);
  assert.equal(mouse.handler.engaged, true, 'a press on the page is the game');
  mouse.release();

  const tap = await harness();
  tap.press(tap.heroEl, { pointerType: 'touch' });
  tap.release();
  assert.equal(tap.handler.engaged, true, 'a tap on the page is the game');
});

test('only input that is already the game\'s counts at spawn', async () => {
  const quick = await harness();
  assert.equal(quick.handler.committed, false);
  quick.press(quick.heroEl);
  assert.equal(quick.handler.committed, true, 'held');
  quick.release();
  assert.equal(quick.handler.pointerHeld, false);
  assert.equal(quick.handler.slingTicks, 30);
  assert.equal(quick.handler.committed, true, 'a quick click still has its slingshot to play');

  const key = await harness();
  key.handler.keys.add('j');
  assert.equal(key.handler.committed, true);

  const title = await harness();
  title.press(title.titleEl);
  assert.equal(title.handler.committed, false, 'it may still turn out to be a link');
  assert.equal(title.handler.neutral, false);
  title.release();

  const touch = await harness();
  touch.press(touch.heroEl, { pointerType: 'touch' });
  assert.equal(touch.handler.committed, false, 'it may still turn out to be a scroll');
  clearTimeout(touch.handler._pendingTouch);
});

test('the swallow flag never eats a keyboard Enter', async () => {
  const h = await harness({ isPlaying: () => true });
  h.press(h.titleEl);
  assert.equal(h.handler._swallowClick, true);
  h.release();
  assert.equal(h.click(h.titleEl, 0), false, 'detail 0 is the keyboard');
  assert.equal(h.handler._swallowClick, false);

  h.press(h.titleEl);
  h.release();
  assert.equal(h.click(h.titleEl, 1), true, 'a real click while playing is the game');
});

test('blur ends a press on a title', async () => {
  const h = await harness();
  h.press(h.titleEl);
  const { timer } = h.handler._titlePress;
  h.on.blur();
  assert.equal(h.handler._titlePress, null);
  assert.equal(h.handler.neutral, true);
  assert.equal(h.handler.pointer, null);
  clearTimeout(timer);
});

test('a disabled handler lets go and takes nothing more', async () => {
  const h = await harness();
  h.press(h.heroEl);
  h.handler.keys.add('j');
  h.handler.disable();
  assert.equal(h.handler.neutral, true);
  h.press(h.heroEl);
  assert.equal(h.handler.pointerHeld, false);
  let prevented = false;
  h.on.keydown({ key: 'j', target: { matches: () => false }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(h.handler.keys.size, 0);
});
