import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reelAutoplays, Reel } from '../js/level/Reel.js';

function stubs({ autoplay = true } = {}) {
  const calls = [];
  const on = {};
  const attrs = {};
  const classes = new Set();
  const video = {
    paused: true,
    addEventListener(type, fn) { on[type] = fn; },
    play() { calls.push('play'); this.paused = false; on.play?.(); return Promise.resolve(); },
    pause() { calls.push('pause'); this.paused = true; on.pause?.(); },
  };
  const button = {
    setAttribute(name, value) { attrs[name] = value; },
    addEventListener(type, fn) { on[`button-${type}`] = fn; },
    classList: { toggle(name, state) { if (state) classes.add(name); else classes.delete(name); } },
  };
  const reel = new Reel(video, button, 'Slingshot gameplay: a swing', { autoplay: () => autoplay });
  return { reel, video, calls, attrs, classes, click: () => on['button-click']() };
}

test('it autoplays only where nobody asked it not to', () => {
  const rule = (o) => reelAutoplays({ reduced: false, saveData: false, phone: false, ...o });
  assert.equal(rule({}), true);
  assert.equal(rule({ reduced: true }), false);
  assert.equal(rule({ saveData: true }), false);
  assert.equal(rule({ phone: true }), false);
});

test('it plays at half in view and pauses out of view', () => {
  const { reel, calls } = stubs();
  reel.seen(0.2);
  assert.deepEqual(calls, [], 'under half does not start it');
  reel.seen(0.5);
  assert.deepEqual(calls, ['play']);
  reel.seen(0.3);
  assert.deepEqual(calls, ['play'], 'under half does not stop it either');
  reel.seen(0);
  assert.deepEqual(calls, ['play', 'pause']);
  reel.seen(0.8);
  assert.deepEqual(calls, ['play', 'pause', 'play']);
});

test('a click pauses for good, until the next click', () => {
  const { reel, calls, click } = stubs();
  reel.seen(1);
  click();
  assert.deepEqual(calls, ['play', 'pause']);
  reel.seen(0);
  reel.seen(1);
  assert.equal(calls.at(-1), 'pause', 'coming back into view does not override the click');
  assert.equal(calls.filter((c) => c === 'play').length, 1);
  click();
  assert.equal(calls.at(-1), 'play');
});

test('without autoplay nothing starts it but a click, and each viewing asks again', () => {
  const { reel, calls, click } = stubs({ autoplay: false });
  reel.seen(1);
  assert.deepEqual(calls, []);
  click();
  assert.deepEqual(calls, ['play']);
  reel.seen(0);
  assert.deepEqual(calls, ['play', 'pause']);
  reel.seen(1);
  assert.deepEqual(calls, ['play', 'pause'], 'it stays paused until the next tap');
});

test('the label and the mark say what a press would do', () => {
  const { reel, attrs, classes } = stubs();
  assert.equal(attrs['aria-label'], 'Play video. Slingshot gameplay: a swing');
  assert.equal(classes.has('moving'), false);
  reel.seen(1);
  assert.equal(attrs['aria-label'], 'Pause video. Slingshot gameplay: a swing');
  assert.equal(classes.has('moving'), true);
  reel.seen(0);
  assert.equal(attrs['aria-label'], 'Play video. Slingshot gameplay: a swing');
  assert.equal(classes.has('moving'), false);
});
