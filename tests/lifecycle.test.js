import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLEEP_AFTER_MS, PLANNER_WATCHDOG_MS, skipVisible, atRest, resizeNeedsRelevel, clampToLevel, heroInPlay, pushCapped, guarded } from '../js/level/lifecycle.js';

test('Skip shows only while a run is under way, and never on the phone layout', () => {
  for (const mode of ['planning', 'bot', 'replanning']) {
    assert.equal(skipVisible({ mode, phone: false }), true, mode);
    assert.equal(skipVisible({ mode, phone: true }), false, mode);
  }
  for (const mode of ['idle', 'done', 'human']) assert.equal(skipVisible({ mode, phone: false }), false, mode);
});

test('the loop may sleep only with the run over and everything still', () => {
  const rest = (o) => atRest({ mode: 'done', wordsLeft: 0, grounded: true, paused: false, settled: true, neutral: true, speed: 0, ...o });
  assert.equal(SLEEP_AFTER_MS, 3000);
  assert.equal(rest({}), true);
  assert.equal(rest({ mode: 'human' }), true);
  assert.equal(rest({ mode: 'human', wordsLeft: 2 }), false, 'the bot has to be able to come back');
  assert.equal(rest({ mode: 'bot' }), false);
  assert.equal(rest({ mode: 'replanning' }), false);
  assert.equal(rest({ mode: 'planning' }), false);
  assert.equal(rest({ grounded: false }), false);
  assert.equal(rest({ paused: true }), false);
  assert.equal(rest({ settled: false }), false);
  assert.equal(rest({ neutral: false }), false);
  assert.equal(rest({ speed: 1 }), false);
});

test('a resize is a new level unless it is a phone URL bar', () => {
  const needs = (o) => resizeNeedsRelevel({ w: 1440, h: 900, phone: false, lastW: 1440, lastH: 900, lastPhone: false, ...o });
  assert.equal(needs({}), false);
  assert.equal(needs({ h: 860 }), true, 'desktop type scales with the height');
  assert.equal(needs({ w: 1300 }), true);
  const phone = { w: 375, lastW: 375, phone: true, lastPhone: true, lastH: 812 };
  assert.equal(needs({ ...phone, h: 760 }), false);
  assert.equal(needs({ ...phone, h: 600 }), true);
  assert.equal(needs({ ...phone, w: 812, h: 375 }), true);
  assert.equal(needs({ w: 1000, h: 1050, lastW: 1000, lastH: 950, phone: true, lastPhone: false }), true, 'crossing the layouts');
});

test('a character is kept inside the level', () => {
  const level = {
    left: 0.4, width: 40, top: 0,
    rects: [
      { word: 'name', ymax: -2 },
      { word: 'ground', ymax: -20 },
      { word: 'contact', ymax: -20 },
      { word: 'wall', ymax: 380 },
    ],
  };
  const size = { x: 0.6, y: 0.78 };
  assert.deepEqual(clampToLevel({ x: 10, y: -10 }, level, size), { x: 10, y: -10 });
  assert.deepEqual(clampToLevel({ x: -5, y: -10 }, level, size), { x: 0.7, y: -10 });
  assert.deepEqual(clampToLevel({ x: 99, y: -10 }, level, size), { x: 39.7, y: -10 });
  assert.deepEqual(clampToLevel({ x: 10, y: -500 }, level, size), { x: 10, y: -19.61 });
  assert.deepEqual(clampToLevel({ x: 10, y: 5 }, level, size), { x: 10, y: -0.39 });
});

test('the first run gets the agreed planner budget, and the replan keeps its own', () => {
  const worker = readFileSync(new URL('../js/level/planner-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /deadlineMs: kind === 'first' \? 4000 : 900/);
});

test('the hero owns input only with at least half of it on screen', () => {
  const inPlay = (top, height = 900) => heroInPlay({ top, bottom: top + height, viewportHeight: 900 });
  assert.equal(inPlay(0), true);
  assert.equal(inPlay(-450), true);
  assert.equal(inPlay(-451), false);
  assert.equal(inPlay(-899), false, 'one pixel showing is not enough');
  assert.equal(inPlay(-2000), false);
  assert.equal(inPlay(899), false, 'nor at the other end');
  // A stacked phone hero is taller than the window, so half of the window is what it can fill.
  const phone = (top) => heroInPlay({ top, bottom: top + 2000, viewportHeight: 800 });
  assert.equal(phone(0), true);
  assert.equal(phone(-1600), true);
  assert.equal(phone(-1601), false);
});

test('the log keeps its last 500 entries', () => {
  const list = [];
  for (let i = 0; i < 1200; i++) pushCapped(list, i, 500);
  assert.equal(list.length, 500);
  assert.equal(list[0], 700);
  assert.equal(list.at(-1), 1199);
});

test('a frame that throws reports once and does not rethrow', () => {
  const failures = [];
  const seen = [];
  const frame = guarded((now) => {
    seen.push(now);
    if (now === 2) throw new Error('boom');
  }, (err) => failures.push(err.message));
  frame(1);
  assert.deepEqual(failures, []);
  frame(2);
  assert.deepEqual(failures, ['boom']);
  frame(3);
  assert.deepEqual(seen, [1, 2], 'a dead loop does not run again');
  assert.deepEqual(failures, ['boom']);
});

test('the planner gets six seconds before it counts as stalled', () => {
  assert.equal(PLANNER_WATCHDOG_MS, 6000);
  const main = readFileSync(new URL('../js/level/main.js', import.meta.url), 'utf8');
  assert.match(main, /setTimeout\(fail, PLANNER_WATCHDOG_MS\)/);
  assert.match(main, /clearTimeout\(planWatchdog\)/);
});

test('a module that arrives after the fallback fired leaves the page in its plain form', () => {
  const main = readFileSync(new URL('../js/level/main.js', import.meta.url), 'utf8');
  const boot = main.slice(main.indexOf('async function boot()'));
  assert.match(boot, /^async function boot\(\) {\s*\/\/[^\n]*\n\s*if \(!document\.documentElement\.classList\.contains\('js'\)\) return;/);
});

test('the actor canvas is sized like its CSS box, without the scrollbar', () => {
  const view = readFileSync(new URL('../js/level/View.js', import.meta.url), 'utf8');
  assert.match(view, /this\.actor\.width = Math\.round\(document\.documentElement\.clientWidth \* this\.dpr\)/);
});

test('the character is drawn 3 times its collider on landscape and 1.6 on the phone', async () => {
  const { VISUAL_SCALE, PHONE_VISUAL_SCALE } = await import('../js/level/View.js');
  assert.equal(VISUAL_SCALE, 3);
  assert.equal(PHONE_VISUAL_SCALE, 1.6);
});
