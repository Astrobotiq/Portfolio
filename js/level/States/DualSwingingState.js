// Port of States/DualSwingingState.cs. This is the only state that reads SwingGravity.
import { V2, FIXED_DT } from '../Mathf.js';
import { ActiveArm } from '../PlayerController.js';
import { AirborneState } from './AirborneState.js';
import { GroundedState } from './GroundedState.js';
import { SwingingState } from './SwingingState.js';

export class DualSwingingState {
  constructor(context) {
    this.context = context;
    this.stats = context.Stats;
    this.leftRopeLength = 0;
    this.rightRopeLength = 0;
    this.currentVelocity = { x: 0, y: 0 };
  }

  EnterState() {
    const c = this.context;
    if (!c.LeftAnchor || !c.RightAnchor) {
      c.TransitionToState(new AirborneState(c, c.Velocity));
      return;
    }
    this.leftRopeLength = V2.dist(c.PlayerRigidbody.position, c.LeftAnchor);
    this.rightRopeLength = V2.dist(c.PlayerRigidbody.position, c.RightAnchor);
    this.currentVelocity = { ...c.Velocity };
  }

  UpdateState() {
    this.CheckInputTransitions();
  }

  FixedUpdateState() {
    this.ApplyDualSpringPhysics();
  }

  ExitState() {}

  CheckInputTransitions() {
    const c = this.context;
    const leftHeld = c.Input.IsLeftTriggerHeld;
    const rightHeld = c.Input.IsRightTriggerHeld;

    if (!leftHeld && !rightHeld) {
      c.LeftAnchor = null;
      c.RightAnchor = null;
      c.TransitionToState(new AirborneState(c, this.currentVelocity));
      return;
    }
    if (!leftHeld) {
      c.LeftAnchor = null;
      c.TransitionToState(new SwingingState(c, ActiveArm.Right));
      return;
    }
    if (!rightHeld) {
      c.RightAnchor = null;
      c.TransitionToState(new SwingingState(c, ActiveArm.Left));
    }
  }

  ApplyDualSpringPhysics() {
    const c = this.context;
    this.currentVelocity.y -= this.stats.SwingGravity * FIXED_DT;

    const playerInputX = (c.Input.LeftStick.x + c.Input.RightStick.x) * 0.5;
    this.currentVelocity.x += playerInputX * this.stats.DualSwingForceMultiplier * FIXED_DT;

    this.currentVelocity = V2.add(this.currentVelocity, this.CalculateSpringForce(c.LeftAnchor, this.leftRopeLength));
    this.currentVelocity = V2.add(this.currentVelocity, this.CalculateSpringForce(c.RightAnchor, this.rightRopeLength));

    const playerPos = c.PlayerRigidbody.position;
    const nextPosition = V2.add(playerPos, V2.mul(this.currentVelocity, FIXED_DT));
    const movementDelta = V2.sub(nextPosition, playerPos);
    const dir = V2.normalized(movementDelta);

    const hit = c.World.CircleCast(playerPos.x, playerPos.y, Math.min(this.stats.DualSwingCollisionRadius, c.SwingCollisionRadius),
      dir.x, dir.y, V2.mag(movementDelta));

    if (hit) {
      const angle = V2.angle(hit.normal, { x: 0, y: 1 });
      c.LeftAnchor = null;
      c.RightAnchor = null;
      if (angle > this.stats.MaxWallAngle) c.TransitionToState(new AirborneState(c, this.currentVelocity));
      else c.TransitionToState(new GroundedState(c));
      return;
    }

    c.PlayerRigidbody.position = nextPosition;
    c.Velocity = { ...this.currentVelocity };
  }

  CalculateSpringForce(anchor, ropeLength) {
    const c = this.context;
    const direction = V2.sub(anchor, c.PlayerRigidbody.position);
    const distance = V2.mag(direction);

    // The rope only pulls when taut, as in the C#.
    if (distance > ropeLength) {
      const normalizedDir = V2.div(direction, distance);
      const displacement = distance - ropeLength;
      const springForce = displacement * this.stats.DualSpringStiffness;
      const relativeVelocity = V2.dot(this.currentVelocity, normalizedDir);
      const dampingForce = relativeVelocity * this.stats.DualSpringDamping;
      return V2.mul(normalizedDir, (springForce - dampingForce) * FIXED_DT);
    }
    return { x: 0, y: 0 };
  }
}
