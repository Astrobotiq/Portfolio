// Port of States/SlingshotState.cs.
//
// SlingshotLaunchDuration (0.01) is shorter than the 0.02 tick, so on the first launch tick
// t clamps to 1, velocity snaps to MaxSlingshotSpeed and the state exits. That one-tick snap is
// the real behaviour, not a simplification. The hit stop is requested when the pullback ends,
// before the launch, exactly where the C# calls NotifyImpact.
import { Mathf, V2, FIXED_DT } from '../Mathf.js';
import { AirborneState } from './AirborneState.js';

const SlingshotPhase = { Anticipation: 0, Launch: 1 };

export class SlingshotState {
  constructor(context) {
    this.context = context;
    this.stats = context.Stats;
    this.midpoint = null;
    this.initialLaunchVelocity = { x: 0, y: 0 };
    this.cachedLaunchDirection = { x: 0, y: 0 };
    this.currentPhase = SlingshotPhase.Anticipation;
    this.stateTimer = 0;
  }

  EnterState() {
    const c = this.context;
    c.UseSlingshot();

    if (!c.LeftAnchor || !c.RightAnchor) {
      c.TransitionToState(new AirborneState(c, c.Velocity));
      return;
    }

    this.midpoint = V2.div(V2.add(c.LeftAnchor, c.RightAnchor), 2);
    this.cachedLaunchDirection = V2.normalized(V2.sub(this.midpoint, c.PlayerRigidbody.position));
    this.currentPhase = SlingshotPhase.Anticipation;
    this.stateTimer = 0;
    c.Emit({ t: 'pullback', node: c.RightAnchor.letter });
  }

  UpdateState() {
    this.CheckInputTransitions();
  }

  FixedUpdateState() {
    this.stateTimer += FIXED_DT;
    if (this.currentPhase === SlingshotPhase.Anticipation) this.ApplyAnticipationPhysics();
    else this.ApplyLaunchPhysics();
  }

  ExitState() {}

  CheckInputTransitions() {
    const c = this.context;
    if (!c.Input.IsLeftTriggerHeld && !c.Input.IsRightTriggerHeld) {
      c.LeftAnchor = null;
      c.RightAnchor = null;
      c.TransitionToState(new AirborneState(c, c.Velocity, { isJumping: true, grappleLockout: this.stats.SlingshotGrappleLockout }));
    }
  }

  ApplyAnticipationPhysics() {
    const c = this.context;
    c.Velocity = V2.mul(this.cachedLaunchDirection, -this.stats.SlingshotAnticipationSpeed);

    if (this.stateTimer >= this.stats.SlingshotAnticipationDuration) {
      this.currentPhase = SlingshotPhase.Launch;
      this.stateTimer = 0;
      c.NotifySlingshotLaunch();
      this.initialLaunchVelocity = { x: 0, y: 0 };
      c.Velocity = { x: 0, y: 0 };
      c.NotifyImpact(this.cachedLaunchDirection);
    }
  }

  ApplyLaunchPhysics() {
    const c = this.context;
    const t = Mathf.Clamp01(this.stateTimer / this.stats.SlingshotLaunchDuration);
    const easeOutT = 1 - (1 - t) * (1 - t);
    const targetVelocity = V2.mul(this.cachedLaunchDirection, this.stats.MaxSlingshotSpeed);
    c.Velocity = V2.lerp(this.initialLaunchVelocity, targetVelocity, easeOutT);

    const currentDirectionToMidpoint = V2.sub(this.midpoint, c.PlayerRigidbody.position);
    const hasPassedMidpoint = V2.dot(this.cachedLaunchDirection, currentDirectionToMidpoint) < 0;

    if (t >= 1 || hasPassedMidpoint) {
      c.LeftAnchor = null;
      c.RightAnchor = null;
      c.TransitionToState(new AirborneState(c, c.Velocity, { isJumping: true, grappleLockout: this.stats.SlingshotGrappleLockout }));
    }
  }
}
