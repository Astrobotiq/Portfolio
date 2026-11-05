import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Level } from '../js/level/Level.js';
import { PlayerController } from '../js/level/PlayerController.js';
import { PlayerStatsSO, COLLIDER } from '../js/level/PlayerStatsSO.js';
import { ScriptInput } from '../js/level/BotInput.js';
import { AirborneState } from '../js/level/States/AirborneState.js';
import { Planner, runToEnd, TIERS } from '../js/level/Planner.js';

// Spec section 10 lists six; 1366x650, 1920x950 and 2560x1080 are real desktop windows too.
const SIZES = ['1024x768', '1280x720', '1366x650', '1366x768', '1440x900', '1920x950', '1920x1080', '2560x1080', '2560x1440'];

function replay(json, frames, spawn) {
  const level = new Level(json);
  const input = new ScriptInput();
  const ctx = new PlayerController(PlayerStatsSO, level, input, COLLIDER);
  ctx.PlayerRigidbody.position = { x: spawn.x, y: spawn.y };
  ctx.TransitionToState(new AirborneState(ctx, { x: 0, y: 0 }));
  for (const f of frames) {
    input.apply(f);
    ctx.Tick();
  }
  return { position: { ...ctx.PlayerRigidbody.position }, ticks: ctx.TickCount };
}

for (const size of SIZES) {
  const fixture = JSON.parse(readFileSync(new URL(`./fixtures/level-${size}.json`, import.meta.url), 'utf8'));
  let plan;
  const firstRun = () => (plan ??= runToEnd(new Planner(new Level(fixture), PlayerStatsSO, COLLIDER, { deadlineMs: 4000, sliceMs: 1e9 }).planFirstRun()));

  test(`${size}: same frames give the same result`, () => {
    const { frames, spawn, ticks } = firstRun();
    const a = replay(fixture, frames, spawn);
    const b = replay(fixture, frames, spawn);
    assert.deepEqual(a.position, b.position);
    assert.equal(a.ticks, ticks);
  });

  test(`${size}: route hits all three games and ends on the contact floor`, () => {
    const { impacts, landedOn, seconds } = firstRun();
    assert.deepEqual(new Set(impacts.map((i) => i.word)), new Set(['oro', 'goka', 'kiss']));
    assert.equal(landedOn, 'contact');
    assert.ok(impacts[0].tick <= 125, `first impact at tick ${impacts[0].tick}`);
    assert.ok(seconds <= 11.5, `run takes ${seconds} s`);
  });

  test(`${size}: the third hit lands within 8 s of the spawn`, () => {
    const { impacts, miss } = firstRun();
    assert.equal(impacts.length, 3);
    assert.ok(impacts[2].tick <= 400, `third impact at tick ${impacts[2].tick}`);
    assert.equal(miss, null, 'the tight tiers plan no miss');
  });
}

test('the tight tiers come first, and the old ones stay behind them as fallbacks', () => {
  assert.deepEqual(TIERS.slice(0, 2).map((t) => t.miss), [false, false]);
  assert.ok(TIERS[0].maxTick < TIERS[1].maxTick);
  assert.deepEqual(TIERS.slice(2).map((t) => t.maxTick), [530, 560, 560, 800]);
  assert.deepEqual(TIERS.map((t) => t.share), [...TIERS.map((t) => t.share)].sort((a, b) => a - b), 'the deadline shares only grow');
});
