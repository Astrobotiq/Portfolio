// Port of NodeDetector.cs. In the game nodes are scene objects. Here they are points on the
// real edges of the role and game-title letters, built by Level.js from the DOM rectangles.
//
// Difference: the C# buffer holds 10 colliders from OverlapCircle. This scans all nodes in range,
// because a word has many nodes and the buffer would otherwise pick arbitrary ones.
import { V2 } from './Mathf.js';
import { SceneValues } from './PlayerStatsSO.js';

export class NodeDetector {
  constructor(world, nodes) {
    this.world = world;
    this.nodes = nodes;
    this.detectionRadius = SceneValues.detectionRadius;
    this.minimumDotProduct = SceneValues.minimumDotProduct;
  }

  // Returns the node or null, in place of the C# bool + out parameter.
  TryFindBestNode(aimDirection, origin) {
    if (V2.sqrMag(aimDirection) < 0.01) return null;

    const normalizedAim = V2.normalized(aimDirection);
    let highestDot = -1;
    let best = null;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const ex = node.x - origin.x, ey = node.y - origin.y;
      const distanceToNode = Math.hypot(ex, ey);
      if (distanceToNode > this.detectionRadius || distanceToNode < 1e-5) continue;
      const dirX = ex / distanceToNode, dirY = ey / distanceToNode;
      const dotProduct = normalizedAim.x * dirX + normalizedAim.y * dirY;

      if (dotProduct >= this.minimumDotProduct && dotProduct > highestDot) {
        // Obstacle check. The node sits on its letter's edge, so the ray ignores that one letter.
        if (!this.world.Raycast(origin.x, origin.y, dirX, dirY, distanceToNode, node.letter)) {
          highestDot = dotProduct;
          best = node;
        }
      }
    }
    return best;
  }
}
