import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaying, pressOutcome, keyBelongsToGame, TITLE_HOLD_MS, TITLE_MOVE_PX, PLAY_IDLE_MS, RESUME_IDLE_MS } from '../js/level/titlePress.js';

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
  assert.equal(key({ key: 'k', heroVisible: false }), true);
  assert.equal(key({ key: 'j', onFocusedLink: true }), true);
  assert.equal(key({ engaged: true }), true);
  assert.equal(key({ engaged: true, heroVisible: false }), false);
  assert.equal(key({ engaged: true, key: ' ', onFocusedLink: true }), false);
  assert.equal(key({ engaged: true, key: ' ' }), true);
  assert.equal(key({ engaged: true, key: 'Enter' }), false);
  assert.equal(key({ engaged: true, key: 'Tab' }), false);
  assert.equal(key({ engaged: true, key: 'w' }), true);
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
