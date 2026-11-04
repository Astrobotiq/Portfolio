// Implements IInputReader. The bot and the human go through the same interface; PlayerController
// cannot tell them apart. A frame is what a controller would report for one tick.
export const ZERO_FRAME = Object.freeze({ lx: 0, ly: 0, rx: 0, ry: 0, lt: false, rt: false, jp: false, jh: false });

export class ScriptInput {
  constructor() { this.apply(ZERO_FRAME); }
  apply(f) {
    this.LeftStick = { x: f.lx, y: f.ly };
    this.RightStick = { x: f.rx, y: f.ry };
    this.IsLeftTriggerHeld = f.lt;
    this.IsRightTriggerHeld = f.rt;
    this.IsJumpPressed = f.jp;
    this.IsJumpHeld = f.jh;
  }
}
