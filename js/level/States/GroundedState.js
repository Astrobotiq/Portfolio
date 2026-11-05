// Port of States/GroundedState.cs. Not ported: dash, wall climb, moving-surface jump boost.
import { ActiveArm } from '../PlayerController.js';
import { AirborneState } from './AirborneState.js';
import { SwingingState } from './SwingingState.js';

export class GroundedState {
  constructor(context) {
    this.context = context;
    this.stats = context.Stats;
  }

  EnterState() {
    this.context.Velocity = { x: this.context.Velocity.x, y: 0 };
    this.context.LeftAnchor = null;
    this.context.RightAnchor = null;
    this.context.ResetSlingshot();
  }

  UpdateState() {
    this.CheckGrappleInput();
    if (this.context.CurrentState === this) this.CheckAirborneTransitions();
  }

  FixedUpdateState() {
    const targetVelocityX = this.context.Input.LeftStick.x * this.stats.MoveSpeed;
    this.context.Velocity = { x: targetVelocityX, y: this.context.Velocity.y };
  }

  ExitState() {}

  CheckGrappleInput() {
    const c = this.context;
    if (c.Input.IsRightTriggerHeld && !c.RightAnchor) {
      const hitPoint = c.TryCastGrapple(c.Input.RightStick);
      if (hitPoint) {
        c.RightAnchor = hitPoint;
        c.TransitionToState(new SwingingState(c, ActiveArm.Right, true));
      }
    }
  }

  CheckAirborneTransitions() {
    const c = this.context;
    if (c.JumpBufferTimer > 0) {
      c.ConsumeJumpBuffer();
      c.TransitionToState(new AirborneState(c, { x: c.Velocity.x, y: this.stats.JumpVelocity }, { isJumping: true }));
    } else if (!c.IsGrounded) {
      c.TransitionToState(new AirborneState(c, c.Velocity, { isJumping: true, coyote: this.stats.CoyoteTimeDuration }));
    }
  }
}
