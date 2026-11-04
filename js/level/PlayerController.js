// Port of PlayerController.cs, plus HitStopManager.cs folded into Tick().
//
// Differences from the C#, on purpose:
// - Tick() runs FixedUpdate then Update once per 0.02 s. In Unity, Update runs per frame. Fixing
//   it at 50 Hz makes a run deterministic, so the same run can be forward-simulated at load.
// - Time keeps running during hit stop (the C# manager uses unscaled time too), so TickCount and
//   the trail stamps keep advancing while the character is frozen.
// - The contact block in FixedUpdate is web-only: it reports which letter stopped the character,
//   and asks for a hit stop on a game-title impact. The C# only freezes at launch and dash start.
import { V2, FIXED_DT } from './Mathf.js';
import { KinematicPhysicsHandler } from './KinematicPhysicsHandler.js';
import { NodeDetector } from './NodeDetector.js';

export const ActiveArm = { None: 0, Left: 1, Right: 2, Both: 3 };

export const IMPACT_SPEED = 12; // u/s. Web-only threshold for a title impact.

export class PlayerController {
  constructor(Stats, level, Input, colliderSize) {
    this.Stats = Stats;
    this.Level = level;
    this.World = level.world;
    this.Input = Input;
    this.ColliderSize = colliderSize;
    this.PlayerRigidbody = { position: { x: 0, y: 0 } };
    this.PhysicsHandler = new KinematicPhysicsHandler(this.World, this.PlayerRigidbody, colliderSize);
    this.nodeDetector = new NodeDetector(this.World, level.nodes);
    this.SwingCollisionRadius = Math.min(Stats.SwingCollisionRadius, colliderSize.x / 2);

    this.Velocity = { x: 0, y: 0 };
    this.CurrentState = null;
    this.LeftAnchor = null;
    this.RightAnchor = null;
    this.CanSlingshot = true;
    this.ActiveSpeedMultiplier = 1;
    this.JumpBufferTimer = 0;

    this._isPaused = false;
    this._velocityCache = { x: 0, y: 0 };
    this._hitStopTimer = 0;
    this._isHitStopActive = false;

    this.TickCount = 0;
    this.Events = [];
    this._lastImpact = {};
  }

  get IsGrounded() { return this.PhysicsHandler.IsGrounded; }
  get IsTouchingCeiling() { return this.PhysicsHandler.IsTouchingCeiling; }
  get IsPaused() { return this._isPaused; }

  Emit(e) {
    e.tick = this.TickCount;
    this.Events.push(e);
  }

  Tick() {
    this.FixedUpdate();
    this.Update(FIXED_DT);
    this.HitStopUpdate(FIXED_DT);
    this.TickCount++;
  }

  Update(dt) {
    if (this._isPaused) return;

    if (this.Input.IsJumpPressed) this.JumpBufferTimer = this.Stats.JumpBufferDuration;
    else if (this.JumpBufferTimer > 0) this.JumpBufferTimer -= dt;

    if (this.CurrentState) this.CurrentState.UpdateState(dt);
  }

  FixedUpdate() {
    if (this._isPaused) return;

    if (this.CurrentState) this.CurrentState.FixedUpdateState();

    const requested = this.Velocity;
    this.Velocity = this.PhysicsHandler.Move(V2.mul(requested, FIXED_DT));
    this.ReportContacts(requested);
  }

  // Web-only. See the note at the top of the file.
  ReportContacts(requested) {
    const h = this.PhysicsHandler;
    const pos = this.PlayerRigidbody.position;
    const size = this.ColliderSize;
    if (h.LastHitY && Math.abs(requested.y) > 2) {
      const dy = Math.sign(requested.y);
      this.Contact(h.LastHitY, Math.abs(requested.y), { x: 0, y: dy }, { x: pos.x, y: pos.y + (dy * size.y) / 2 });
    } else if (h.LastHitX && Math.abs(requested.x) > 2) {
      const dx = Math.sign(requested.x);
      this.Contact(h.LastHitX, Math.abs(requested.x), { x: dx, y: 0 }, { x: pos.x + (dx * size.x) / 2, y: pos.y });
    }
  }

  Contact(rect, speed, dir, point) {
    this.Emit({ t: 'contact', word: rect.word, letter: rect.letter, speed, dir, point });
    // A rope keeps pressing into the word after the freeze, so one word counts once per second.
    if (speed >= IMPACT_SPEED && this.Level.isGameTitle(rect.word)
      && this.TickCount - (this._lastImpact[rect.word] ?? -1000) > 50) {
      this._lastImpact[rect.word] = this.TickCount;
      this.Emit({ t: 'impact', word: rect.word, letter: rect.letter, speed, dir, point });
      this.RequestHitStop(this.Stats.HitStopDuration);
    }
  }

  TransitionToState(newState) {
    if (this.CurrentState) this.CurrentState.ExitState();
    this.CurrentState = newState;
    if (this.CurrentState) this.CurrentState.EnterState();
  }

  // --- Grapple and core actions ---

  TryCastGrapple(direction) {
    return this.nodeDetector.TryFindBestNode(direction, this.PlayerRigidbody.position);
  }

  CheckNodeCoincidence() {
    if (!this.LeftAnchor || !this.RightAnchor) return false;
    return V2.dist(this.LeftAnchor, this.RightAnchor) < this.Stats.NodeCoincidenceThreshold;
  }

  NotifyImpact(velocity) {
    this.Emit({ t: 'launchFreeze', dir: velocity });
    this.RequestHitStop(this.Stats.HitStopDuration);
  }

  NotifySlingshotLaunch() {
    this.Emit({ t: 'launch' });
  }

  ResetSlingshot() { this.CanSlingshot = true; }
  UseSlingshot() { this.CanSlingshot = false; }
  ConsumeJumpBuffer() { this.JumpBufferTimer = 0; }

  // --- HitStopManager + IFramePausable ---

  RequestHitStop(duration) {
    this._hitStopTimer = duration;
    if (!this._isHitStopActive) {
      this._isHitStopActive = true;
      this.OnPauseStarted();
    }
  }

  HitStopUpdate(dt) {
    if (!this._isHitStopActive) return;
    this._hitStopTimer -= dt;
    if (this._hitStopTimer <= 1e-9) {
      this._isHitStopActive = false;
      this.OnPauseEnded();
    }
  }

  OnPauseStarted() {
    this._isPaused = true;
    this._velocityCache = this.Velocity;
    this.Velocity = { x: 0, y: 0 };
  }

  OnPauseEnded() {
    this._isPaused = false;
    this.Velocity = this._velocityCache;
  }

  // --- Forward simulation support (web-only) ---

  Clone(input) {
    const c = new PlayerController(this.Stats, this.Level, input, this.ColliderSize);
    c.PlayerRigidbody.position = { ...this.PlayerRigidbody.position };
    Object.assign(c.PhysicsHandler, {
      IsGrounded: this.PhysicsHandler.IsGrounded,
      IsTouchingLeftWall: this.PhysicsHandler.IsTouchingLeftWall,
      IsTouchingRightWall: this.PhysicsHandler.IsTouchingRightWall,
      IsTouchingCeiling: this.PhysicsHandler.IsTouchingCeiling,
      GroundRect: this.PhysicsHandler.GroundRect,
    });
    c.Velocity = { ...this.Velocity };
    c.LeftAnchor = this.LeftAnchor;
    c.RightAnchor = this.RightAnchor;
    c.CanSlingshot = this.CanSlingshot;
    c.JumpBufferTimer = this.JumpBufferTimer;
    c._isPaused = this._isPaused;
    c._velocityCache = { ...this._velocityCache };
    c._hitStopTimer = this._hitStopTimer;
    c._isHitStopActive = this._isHitStopActive;
    c.TickCount = this.TickCount;
    c._lastImpact = { ...this._lastImpact };
    c.CurrentState = cloneState(this.CurrentState, c);
    return c;
  }
}

function cloneState(state, context) {
  const n = Object.create(Object.getPrototypeOf(state));
  for (const k of Object.keys(state)) {
    const v = state[k];
    if (k === '_context' || k === 'context') n[k] = context;
    else if (k === '_anchorPoint' || k === 'midpoint' || k === '_stats' || k === 'stats') n[k] = v;
    else if (v && typeof v === 'object' && 'x' in v && 'y' in v) n[k] = { x: v.x, y: v.y };
    else n[k] = v;
  }
  return n;
}
