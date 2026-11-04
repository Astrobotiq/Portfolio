import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Level } from '../js/level/Level.js';
import { PlayerController } from '../js/level/PlayerController.js';
import { PlayerStatsSO, COLLIDER } from '../js/level/PlayerStatsSO.js';
import { ScriptInput } from '../js/level/BotInput.js';
import { AirborneState } from '../js/level/States/AirborneState.js';
import { Planner, runToEnd } from '../js/level/Planner.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/level-1440x900.json', import.meta.url), 'utf8'));

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

const planner = new Planner(new Level(fixture), PlayerStatsSO, COLLIDER, { deadlineMs: 10000, sliceMs: 1e9 });
const plan = runToEnd(planner.planFirstRun());

test('same frames give the same result', () => {
  const a = replay(fixture, plan.frames, plan.spawn);
  const b = replay(fixture, plan.frames, plan.spawn);
  assert.deepEqual(a.position, b.position);
  assert.equal(a.ticks, plan.ticks);
});

test('route hits all three games and ends on the contact floor', () => {
  assert.deepEqual(new Set(plan.impacts.map((i) => i.word)), new Set(['oro', 'goka', 'kiss']));
  assert.equal(plan.landedOn, 'contact');
  assert.ok(plan.impacts[0].tick <= 125);
  assert.ok(plan.seconds <= 11.5);
});
