// Port of KinematicPhysicsHandler.cs. Same method names and the same order inside Move().
// Removed: moving surfaces (IMovingSurface), which the page has none of.
// Added for the web: LastHitX / LastHitY, so the page can react to which letter stopped the move.
import { Mathf, V2, FIXED_DT } from './Mathf.js';
import { SceneValues } from './PlayerStatsSO.js';

export class KinematicPhysicsHandler {
  constructor(world, body, colliderSize) {
    this.world = world;
    this._body = body; // { position: {x, y} }
    this.size = colliderSize; // BoxCollider2D.bounds.size
    this.skinWidth = SceneValues.skinWidth;
    this.groundedDistance = SceneValues.groundedDistance;
    this.boxShrinkOffset = SceneValues.boxShrinkOffset;
    this.movementThreshold = SceneValues.movementThreshold;
    this.IsGrounded = false;
    this.IsTouchingLeftWall = false;
    this.IsTouchingRightWall = false;
    this.IsTouchingCeiling = false;
    this.GroundRect = null;
    this.LastHitX = null;
    this.LastHitY = null;
    this._hitBuffer = [];
  }

  Move(deltaMovement) {
    const position = { x: this._body.position.x, y: this._body.position.y };

    this.ResolvePenetrations(position);

    this.LastHitX = null;
    this.LastHitY = null;

    let movement = this.ResolveHorizontalCollisions(position, deltaMovement);
    position.x += movement.x;

    movement = this.ResolveVerticalCollisions(position, movement);
    position.y += movement.y;

    this.UpdateSensors(position);

    this._body.position = position;

    return V2.div(movement, FIXED_DT);
  }

  ResolvePenetrations(position) {
    this.world.ResolveOverlaps(position, this.size.x, this.size.y);
  }

  ResolveHorizontalCollisions(position, movement) {
    if (Mathf.Abs(movement.x) < this.movementThreshold) return movement;

    const directionX = Mathf.Sign(movement.x);
    const distance = Mathf.Abs(movement.x) + this.skinWidth;
    const hitCount = this.world.BoxCast(position.x, position.y, this.size.x, this.size.y - this.boxShrinkOffset,
      directionX, 0, distance, false, this._hitBuffer);

    let minDistance = Infinity, hitRect = null;
    for (let i = 0; i < hitCount; i++) {
      if (this._hitBuffer[i].distance < minDistance) {
        minDistance = this._hitBuffer[i].distance;
        hitRect = this._hitBuffer[i].rect;
      }
    }

    if (hitRect) {
      this.LastHitX = hitRect;
      return { x: (minDistance - this.skinWidth) * directionX, y: movement.y };
    }
    return movement;
  }

  ResolveVerticalCollisions(position, movement) {
    if (Mathf.Abs(movement.y) < this.movementThreshold) return movement;

    const directionY = Mathf.Sign(movement.y);
    const distance = Mathf.Abs(movement.y) + this.skinWidth;
    const hitCount = this.world.BoxCast(position.x, position.y, this.size.x - this.boxShrinkOffset, this.size.y,
      0, directionY, distance, true, this._hitBuffer);

    let minDistance = Infinity, hitRect = null;
    for (let i = 0; i < hitCount; i++) {
      const hit = this._hitBuffer[i];
      if (hit.rect.oneWay) {
        if (directionY > 0) continue;
        if (hit.distance === 0) continue;
      }
      if (hit.distance < minDistance) {
        minDistance = hit.distance;
        hitRect = hit.rect;
      }
    }

    if (hitRect) {
      this.LastHitY = hitRect;
      return { x: movement.x, y: (minDistance - this.skinWidth) * directionY };
    }
    return movement;
  }

  UpdateSensors(position) {
    const { world, size, skinWidth, groundedDistance, boxShrinkOffset, _hitBuffer: buf } = this;
    const hx = size.y - boxShrinkOffset; // horizontalBoxSize.y
    const vx = size.x - boxShrinkOffset; // verticalBoxSize.x

    this.IsTouchingLeftWall = world.BoxCast(position.x, position.y, size.x, hx, -1, 0, skinWidth * 2, false, buf) > 0;
    this.IsTouchingRightWall = world.BoxCast(position.x, position.y, size.x, hx, 1, 0, skinWidth * 2, false, buf) > 0;

    const groundHitCount = world.BoxCast(position.x, position.y, vx, size.y, 0, -1, groundedDistance + skinWidth, true, buf);
    this.IsGrounded = false;
    this.GroundRect = null;
    for (let i = 0; i < groundHitCount; i++) {
      const hit = buf[i];
      if (hit.rect.oneWay && hit.distance === 0) continue;
      this.IsGrounded = true;
      this.GroundRect = hit.rect;
      break;
    }

    this.IsTouchingCeiling = world.BoxCast(position.x, position.y, vx, size.y, 0, 1, groundedDistance + skinWidth, false, buf) > 0;
  }
}
