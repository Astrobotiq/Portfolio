// The level: rectangles and hook nodes in world units. No DOM in this file, so the planner can
// run it headless. LevelBuilder.js makes one of these from the real letter rectangles.
import { Physics2DWorld } from './Physics2D.js';
import { SceneValues } from './PlayerStatsSO.js';

export const GAME_TITLES = ['oro', 'goka', 'kiss'];

export class Level {
  constructor({ rects, nodes, spawns, smallText, width, left = 0, top, ppu, wordBounds }) {
    this.rects = rects;
    this.nodes = nodes;
    this.spawns = spawns;
    this.smallText = smallText;
    this.width = width;
    this.left = left;
    this.top = top;
    this.ppu = ppu;
    this.wordBounds = wordBounds;
    this.detectionRadius = SceneValues.detectionRadius;
    this.world = new Physics2DWorld(rects);
    this.nodesByWord = {};
    for (const n of nodes) (this.nodesByWord[n.word] ||= []).push(n);
  }

  isGameTitle(word) { return GAME_TITLES.includes(word); }

  toJSON() {
    return { rects: this.rects.map(({ _seen, ...r }) => r), nodes: this.nodes, spawns: this.spawns,
      smallText: this.smallText, width: this.width, left: this.left, top: this.top, ppu: this.ppu, wordBounds: this.wordBounds };
  }
}
