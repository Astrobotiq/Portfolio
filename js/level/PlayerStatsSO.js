// Port of PlayerStatsSO.cs, with the values from SO/PlayerStats.asset (not the C# field defaults).
//
// World units stay Unity units: y is up, gravity is negative, positions are in units.
// Only Level.js and the view know about pixels. See pixelsPerUnit() in Level.js.
//
// Stats that exist in the asset but are NOT used by what this port runs are left out on purpose:
// walls, dash, ledge climb. Those states are not ported.
export const PlayerStatsSO = {
  MoveSpeed: 10,
  JumpHeight: 4,
  TimeToApex: 0.5,

  // SwingGravity is only read by DualSwingingState. The single-rope SwingingState integrates
  // Stats.Gravity (-32), not SwingGravity (25). SwingInitialBoost is not read anywhere in
  // the C#. The port keeps both of those facts.
  SwingGravity: 25,
  SwingForceMultiplier: 20,
  MaxSwingSpeed: 25, // Only gates stick force in ApplyArcadePendulum. Gravity can exceed it.
  SwingCollisionRadius: 0.5,
  MaxWallAngle: 45,

  TerminalVelocity: -40,
  AirControlMultiplier: 1,
  AirAcceleration: 40,
  AirDrag: 20,

  MaxSlingshotSpeed: 65,
  // Shorter than the 0.02 tick, so t clamps to 1 on the first launch tick: a one-tick snap.
  SlingshotLaunchDuration: 0.01,
  SlingshotGrappleLockout: 0.25,
  SlingshotAnticipationDuration: 0.1,
  SlingshotAnticipationSpeed: 10,

  DualSpringStiffness: 25,
  DualSpringDamping: 5,
  DualSwingForceMultiplier: 15,
  DualSwingCollisionRadius: 0.4,

  HitStopDuration: 0.2,
  NodeCoincidenceThreshold: 0.5,

  FallGravityMultiplier: 1.5,
  JumpEndEarlyGravityMultiplier: 3,
  ApexThreshold: 3.5,
  ApexHangGravityMultiplier: 0.5,

  CoyoteTimeDuration: 0.1,
  JumpBufferDuration: 0.1,

  SwingHopForwardSpeed: 8,
  SwingHopUpwardSpeed: 12,
  SwingHopDuration: 0.15,

  get Gravity() { return -(2 * this.JumpHeight) / (this.TimeToApex * this.TimeToApex); }, // -32
  get JumpVelocity() { return Math.abs(this.Gravity) * this.TimeToApex; }, // 16
};

// Serialized fields that live on other components in the C#.
export const SceneValues = {
  // KinematicPhysicsHandler fields
  skinWidth: 0.02,
  groundedDistance: 0.05,
  boxShrinkOffset: 0.05, // NewScene.unity. The C# field default is 0.1.
  movementThreshold: 0.001,
  // NodeDetector fields
  minimumDotProduct: 0.5,
  detectionRadius: 30, // RETUNED, see WebRetune.
};

// Every value that differs from the Unity project, and every behaviour that was added for the web.
export const WebRetune = {
  values: [
    { name: 'NodeDetector.detectionRadius', original: '10 in NewScene.unity (15 is the C# default)', web: 30,
      why: 'The page is about 48 x 30 units and hooks are word edges far above the floor.' },
    { name: 'BoxCollider2D size', original: '1 x 1 (NewScene.unity, Player)', web: '0.60 x 0.78',
      why: 'The character has to be about body-text height against the giant type.' },
    { name: 'SwingCollisionRadius', original: 0.5, web: 'min(0.5, collider half width)',
      why: 'Follows the smaller collider.' },
  ],
  inputs: [
    'The bot may hold jump in flight. That is the real IsJumpHeld branch in AirborneState: rising gravity stays 1x instead of JumpEndEarlyGravityMultiplier 3x. Used only when a plain launch cannot reach the word.',
  ],
  additions: [
    'Impact hit stop: a 0.2 s freeze on contact with a game title at 12 u/s or more. The C# only freezes at slingshot launch and dash start.',
    'Update() runs once per tick at 50 Hz, not once per frame, so a run is deterministic and can be forward-simulated.',
    'Physics2D casts are reimplemented over axis-aligned rectangles (no contact offset), so this is a port, not the same code.',
  ],
};

// Player box collider size in world units (see WebRetune: BoxCollider2D size).
export const COLLIDER = { x: 0.6, y: 0.78 };
