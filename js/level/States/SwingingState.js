// Port of States/SwingingState.cs. Not ported: FullRotationNode tracking (no such nodes on the page).
//
// Note for the comparison: ApplyArcadePendulum integrates Stats.Gravity (-32), not SwingGravity (25),
// and MaxSwingSpeed only gates stick force. Both are what the C# does, so both are kept.
import { Mathf, V2, FIXED_DT } from '../Mathf.js';
import { ActiveArm } from '../PlayerController.js';
import { AirborneState } from './AirborneState.js';
import { GroundedState } from './GroundedState.js';
import { SlingshotState } from './SlingshotState.js';
import { DualSwingingState } from './DualSwingingState.js';

export class SwingingState {
  constructor(context, swingingArm, wasGrounded = false) {
    this._context = context;
    this._stats = context.Stats;
    this._swingingArm = swingingArm;
    this._wasGrounded = wasGrounded;
    this._anchorPoint = null;
    this._ropeLength = 0;
    this._currentVelocity = { x: 0, y: 0 };
    this._isHopping = false;
    this._hopTimer = 0;
  }

  EnterState() {
    if (!this.TrySetAnchorPoint()) {
      this._context.TransitionToState(new AirborneState(this._context, this._context.Velocity));
      return;
    }
    if (this._wasGrounded) this.StartHopPhase();
    else this.InitializePendulum();
  }

  UpdateState() {
    this.CheckInputTransitions();
  }

  FixedUpdateState() {
    if (this._isHopping) this.ApplyHopPhysics();
    else this.ApplyArcadePendulum();
  }

  ExitState() {}

  // --- Hop phase ---

  StartHopPhase() {
    this._isHopping = true;
    this._hopTimer = this._stats.SwingHopDuration;
    const directionToAnchor = V2.normalized(V2.sub(this._anchorPoint, this._context.PlayerRigidbody.position));
    const dirX = Mathf.Sign(directionToAnchor.x);
    this._currentVelocity = { x: dirX * this._stats.SwingHopForwardSpeed, y: this._stats.SwingHopUpwardSpeed };
    this._context.Velocity = { ...this._currentVelocity };
  }

  ApplyHopPhysics() {
    this._hopTimer -= FIXED_DT;
    this._currentVelocity.y += this._stats.Gravity * FIXED_DT;
    this._context.Velocity = { ...this._currentVelocity };
    if (this._hopTimer <= 0) {
      this._isHopping = false;
      this.InitializePendulum();
    }
  }

  // --- Pendulum ---

  InitializePendulum() {
    this._ropeLength = V2.dist(this._context.PlayerRigidbody.position, this._anchorPoint);
    this._currentVelocity = { ...this._context.Velocity };
  }

  ApplyArcadePendulum() {
    const c = this._context;
    const playerInputX = this._swingingArm === ActiveArm.Left ? c.Input.LeftStick.x : c.Input.RightStick.x;

    this._currentVelocity.y += this._stats.Gravity * FIXED_DT;

    const playerPos = c.PlayerRigidbody.position;
    const directionToAnchor = V2.normalized(V2.sub(this._anchorPoint, playerPos));
    const tangent = { x: directionToAnchor.y, y: -directionToAnchor.x };

    let speedAlongTangent = V2.dot(this._currentVelocity, tangent);
    const inputForce = playerInputX * this._stats.SwingForceMultiplier * FIXED_DT;
    const currentMaxSpeed = this._stats.MaxSwingSpeed * c.ActiveSpeedMultiplier;

    if (Mathf.Abs(speedAlongTangent + inputForce) < currentMaxSpeed) speedAlongTangent += inputForce;

    this._currentVelocity = V2.mul(tangent, speedAlongTangent);

    const nextPosition = V2.sub(this._anchorPoint, V2.mul(directionToAnchor, this._ropeLength));
    const movementDelta = V2.sub(nextPosition, playerPos);

    if (this.CheckSweepCollision(playerPos, movementDelta)) return;

    c.PlayerRigidbody.position = nextPosition;
    c.Velocity = { ...this._currentVelocity };
  }

  // --- Helpers ---

  TrySetAnchorPoint() {
    const c = this._context;
    if (this._swingingArm === ActiveArm.Left && c.LeftAnchor) { this._anchorPoint = c.LeftAnchor; return true; }
    if (this._swingingArm === ActiveArm.Right && c.RightAnchor) { this._anchorPoint = c.RightAnchor; return true; }
    return false;
  }

  CheckInputTransitions() {
    const c = this._context;
    const activeTriggerHeld = this._swingingArm === ActiveArm.Left ? c.Input.IsLeftTriggerHeld : c.Input.IsRightTriggerHeld;

    if (!activeTriggerHeld) {
      this.ReleaseAnchor();
      c.TransitionToState(new AirborneState(c, this._currentVelocity, { isJumping: true, bypassJumpGravity: true }));
      return;
    }
    this.CheckOppositeGrappleCast();
  }

  CheckOppositeGrappleCast() {
    const c = this._context;
    const oppositeTriggerHeld = this._swingingArm === ActiveArm.Left ? c.Input.IsRightTriggerHeld : c.Input.IsLeftTriggerHeld;
    if (!oppositeTriggerHeld) return;

    const aimStick = this._swingingArm === ActiveArm.Left ? c.Input.RightStick : c.Input.LeftStick;
    const hitPoint = c.TryCastGrapple(aimStick);
    if (hitPoint) {
      if (this._swingingArm === ActiveArm.Left) c.RightAnchor = hitPoint;
      else c.LeftAnchor = hitPoint;
      this.EvaluateDualGrappleTransition();
    }
  }

  EvaluateDualGrappleTransition() {
    const c = this._context;
    if (c.CanSlingshot && c.CheckNodeCoincidence()) c.TransitionToState(new SlingshotState(c));
    else c.TransitionToState(new DualSwingingState(c));
  }

  ReleaseAnchor() {
    if (this._swingingArm === ActiveArm.Left) this._context.LeftAnchor = null;
    if (this._swingingArm === ActiveArm.Right) this._context.RightAnchor = null;
  }

  BreakGrapple() {
    this._context.LeftAnchor = null;
    this._context.RightAnchor = null;
    this._context.TransitionToState(new AirborneState(this._context, this._currentVelocity));
  }

  CheckSweepCollision(playerPos, movementDelta) {
    const c = this._context;
    const dir = V2.normalized(movementDelta);
    const hit = c.World.CircleCast(playerPos.x, playerPos.y, c.SwingCollisionRadius, dir.x, dir.y, V2.mag(movementDelta));

    if (hit) {
      const angle = V2.angle(hit.normal, { x: 0, y: 1 });
      if (angle > this._stats.MaxWallAngle) this.BreakGrapple();
      else {
        c.LeftAnchor = null;
        c.RightAnchor = null;
        c.TransitionToState(new GroundedState(c));
      }
      return true;
    }
    return false;
  }
}
