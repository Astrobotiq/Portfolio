// Forward simulation runs off the main thread, so it can never cost the page a frame.
import { Level } from './Level.js';
import { PlayerStatsSO } from './PlayerStatsSO.js';
import { PlayerController } from './PlayerController.js';
import { GroundedState } from './States/GroundedState.js';
import { ScriptInput } from './BotInput.js';
import { Planner, runToEnd } from './Planner.js';

self.onmessage = (e) => {
  const { id, kind, level: levelData, collider, pos, words, tickCount } = e.data;
  const level = new Level(levelData);
  const planner = new Planner(level, PlayerStatsSO, collider, { deadlineMs: kind === 'first' ? 2000 : 900, sliceMs: 1e9 });
  let result = null;
  if (kind === 'first') {
    result = runToEnd(planner.planFirstRun());
  } else {
    // Replans only start from a landed, resting character, so the state is this simple.
    const ctx = new PlayerController(PlayerStatsSO, level, new ScriptInput(), collider);
    ctx.PlayerRigidbody.position = { ...pos };
    ctx.TickCount = tickCount;
    ctx.TransitionToState(new GroundedState(ctx));
    ctx.PhysicsHandler.UpdateSensors(ctx.PlayerRigidbody.position);
    result = runToEnd(planner.planFromHere(ctx, words));
  }
  self.postMessage({ id, result, sims: planner.sims });
};
