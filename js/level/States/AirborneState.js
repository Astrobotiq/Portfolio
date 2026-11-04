// Port of States/AirborneState.cs.
// Not ported: dash and wall transitions (ProcessWallInteraction) and moving-surface jump boost.
import { Mathf } from '../Mathf.js';
import { FIXED_DT } from '../Mathf.js';
import { ActiveArm } from '../PlayerController.js';
import { GroundedState } from './GroundedState.js';
import { SlingshotState } from './SlingshotState.js';
import { SwingingState } from './SwingingState.js';
import { DualSwingingState } from './DualSwingingState.js';

export class AirborneState {
  constructor(context, inheritedVelocity, { isJumping = false, grappleLockout = 0, coyote = 0,
    bypassJumpGravity = false, bypassApexHangGravity = false, bypassEndEarlyGravity = false,
    endEarlyGravityMultiplier = 1 } = {}) {
    this._context = context;
    this._stats = context.Stats;
    this._currentVelocity = { x: inheritedVelocity.x, y: inheritedVelocity.y };
    this._isJumping = isJumping;
    this._grappleLockoutTimer = grappleLockout;
    this._coyoteTimer = coyote;
    this._bypassJumpGravity = bypassJumpGravity;
    this._bypassApexHangGravity = bypassApexHangGravity;
    this._bypassEndEarlyGravity = bypassEndEarlyGravity;
    this._endEarlyGravityMultiplier = Math.min(1, Math.max(0, endEarlyGravityMultiplier));
  }

  EnterState() {
    this._context.Velocity = { x: this._currentVelocity.x, y: this._currentVelocity.y };
  }

  UpdateState(dt) {
    this.DecrementTimers(dt);
    this.HandleCoyoteJump();
    this.HandleTransitions();
  }

  FixedUpdateState() {
    if (this._context.IsGrounded && this._currentVelocity.y <= 0.01) {
      this._context.TransitionToState(new GroundedState(this._context));
      return;
    }

    this.ApplyCustomGravity();
    this.ApplyAirMovement();
    this.HandleVerticalObstructions();

    this._context.Velocity = { x: this._currentVelocity.x, y: this._currentVelocity.y };
  }

  ExitState() {}

  DecrementTimers(dt) {
    if (this._coyoteTimer > 0) this._coyoteTimer -= dt;
    if (this._grappleLockoutTimer > 0) this._grappleLockoutTimer -= dt;
  }

  HandleCoyoteJump() {
    if (this._coyoteTimer > 0 && this._context.JumpBufferTimer > 0) {
      this._context.ConsumeJumpBuffer();
      this._coyoteTimer = 0;
      this._isJumping = true;
      this._currentVelocity = { x: this._currentVelocity.x, y: this._stats.JumpVelocity };
    }
  }

  HandleTransitions() {
    if (this._grappleLockoutTimer <= 0) this.ProcessGrappleInput();
  }

  ApplyCustomGravity() {
    let gravityMultiplier = 1;
    const v = this._currentVelocity;

    if (this._isJumping) {
      if (this._bypassJumpGravity) {
        if (v.y < 0) gravityMultiplier = this._stats.FallGravityMultiplier;
        else if (v.y > 0) gravityMultiplier = this._stats.JumpEndEarlyGravityMultiplier * this._endEarlyGravityMultiplier;
      } else {
        if (v.y < 0) gravityMultiplier = this._stats.FallGravityMultiplier;
        else if (!this._bypassEndEarlyGravity && v.y > 0 && !this._context.Input.IsJumpHeld) {
          gravityMultiplier = this._stats.JumpEndEarlyGravityMultiplier * this._endEarlyGravityMultiplier;
        } else if (!this._bypassApexHangGravity && Mathf.Abs(v.y) < this._stats.ApexThreshold) {
          gravityMultiplier = this._stats.ApexHangGravityMultiplier;
        }
      }
    }

    v.y += this._stats.Gravity * gravityMultiplier * FIXED_DT;
    v.y = Mathf.Max(v.y, this._stats.TerminalVelocity);
  }

  ApplyAirMovement() {
    const moveInput = this._context.Input.LeftStick.x;
    const targetX = moveInput * this._stats.MoveSpeed * this._stats.AirControlMultiplier;
    const accel = Mathf.Abs(moveInput) < 0.05 ? this._stats.AirDrag : this._stats.AirAcceleration;
    this._currentVelocity.x = Mathf.MoveTowards(this._currentVelocity.x, targetX, accel * FIXED_DT);
  }

  HandleVerticalObstructions() {
    if (this._currentVelocity.y > 0 && this._context.IsTouchingCeiling) this._currentVelocity.y = 0;
  }

  ProcessGrappleInput() {
    const c = this._context;
    if (c.Input.IsLeftTriggerHeld && !c.LeftAnchor) this.AttemptGrappleTransition(c.Input.LeftStick, ActiveArm.Left);
    else if (c.Input.IsRightTriggerHeld && !c.RightAnchor) this.AttemptGrappleTransition(c.Input.RightStick, ActiveArm.Right);
  }

  AttemptGrappleTransition(direction, arm) {
    const hitPoint = this._context.TryCastGrapple(direction);
    if (hitPoint) {
      if (arm === ActiveArm.Left) this._context.LeftAnchor = hitPoint;
      else this._context.RightAnchor = hitPoint;
      this.EvaluateFinalGrappleState();
    }
  }

  EvaluateFinalGrappleState() {
    const c = this._context;
    if (c.LeftAnchor && c.RightAnchor) {
      if (c.CheckNodeCoincidence() && c.CanSlingshot) c.TransitionToState(new SlingshotState(c));
      else c.TransitionToState(new DualSwingingState(c));
    } else if (c.LeftAnchor) {
      c.TransitionToState(new SwingingState(c, ActiveArm.Left));
    } else if (c.RightAnchor) {
      c.TransitionToState(new SwingingState(c, ActiveArm.Right));
    }
  }
}
