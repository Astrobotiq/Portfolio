// Turns the real DOM into a Level. Each letter of the giant type becomes a row of column
// rectangles traced from its actual glyph, positioned from its actual client rect, so that the
// character stands on the shape you can see. Pixels end here: the rest of the code is in units.
import { Level } from './Level.js';

// World scale, in CSS pixels per Unity unit. About 30 at 1440 x 900.
// Portrait screens scale by width, so a phone and a tablet are the same level at different sizes.
export function pixelsPerUnit(w, h) {
  if (h >= w) return Math.max(24, Math.min(44, w / 13));
  return Math.max(20, Math.min(44, Math.sqrt(w * h) / 38));
}

const COLUMNS = 9;
const MAX_NAME_BRIDGE = 2; // Units.
const glyphCache = new Map();
let rasterCtx = null;

// Top and bottom of the ink per column, in em above the baseline, from a real raster of the glyph.
function glyphColumns(ch, font) {
  const key = font + '|' + ch;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const S = 160;
  if (!rasterCtx) rasterCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const c = rasterCtx.canvas;
  c.width = 2 * S; c.height = 2 * S;
  rasterCtx.font = `${S}px ${font}`;
  rasterCtx.textBaseline = 'alphabetic';
  rasterCtx.fillStyle = '#000';
  const adv = rasterCtx.measureText(ch).width;
  const base = Math.round(1.4 * S);
  rasterCtx.fillText(ch, 0, base);
  const data = rasterCtx.getImageData(0, 0, c.width, c.height).data;
  const cols = [];
  for (let i = 0; i < COLUMNS; i++) {
    const x0 = Math.floor((adv * i) / COLUMNS), x1 = Math.max(x0 + 1, Math.floor((adv * (i + 1)) / COLUMNS));
    let top = -1, bot = -1;
    for (let y = 0; y < c.height; y++) {
      let ink = false;
      for (let x = x0; x < x1; x++) if (data[(y * c.width + x) * 4 + 3] > 128) { ink = true; break; }
      if (ink) { if (top < 0) top = y; bot = y + 1; }
    }
    cols.push(top < 0 ? null : { top: (base - top) / S, bot: (base - bot) / S });
  }
  glyphCache.set(key, cols);
  return cols;
}

function baselineOf(el) {
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  el.appendChild(probe);
  const y = probe.getBoundingClientRect().bottom;
  probe.remove();
  return y;
}

export function buildLevel(page, colliderSize, phone = false) {
  const w = document.documentElement.clientWidth;
  const h = window.innerHeight;
  const ppu = pixelsPerUnit(w, h);
  const sy = window.scrollY;
  const X = (px) => px / ppu;
  const Y = (px) => -(px + sy) / ppu;

  const rects = [], nodes = [], wordBounds = {};
  let letterIndex = 0;

  for (const word of page.words) {
    const cs = getComputedStyle(word.el);
    const fs = parseFloat(cs.fontSize);
    const font = cs.fontFamily;
    const baseline = baselineOf(word.el);
    const b = wordBounds[word.id] || { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };

    word.letters.forEach((letter) => {
      letter.index = letterIndex++;
      const r = letter.el.getBoundingClientRect();
      const colW = r.width / COLUMNS;
      letter.rest = { left: r.left, top: r.top + sy, width: r.width, height: r.height, fs, baseline: baseline + sy };
      let inkTop = -Infinity, inkBot = Infinity, inkMin = Infinity, inkMax = -Infinity;

      // Flatten a nearly flat top: the C# has no step-up, so a curved O would snag every step.
      const flat = (0.2 * ppu) / fs;
      const cols = glyphColumns(letter.ch, font).map((c) => (c ? { ...c } : null));
      const inked = cols.filter(Boolean);
      const maxTop = Math.max(...inked.map((c) => c.top));
      const minBot = Math.min(...inked.map((c) => c.bot));
      for (const c of inked) {
        if (maxTop - c.top < flat) c.top = maxTop;
        if (c.bot - minBot < flat) c.bot = minBot;
      }

      cols.forEach((c, i) => {
        if (!c) return;
        const rect = {
          xmin: X(r.left + colW * i), xmax: X(r.left + colW * (i + 1)),
          ymax: Y(baseline - c.top * fs), ymin: Y(baseline - c.bot * fs),
          oneWay: false, word: word.id, letter: letter.index,
        };
        rects.push(rect);
        inkTop = Math.max(inkTop, rect.ymax);
        inkBot = Math.min(inkBot, rect.ymin);
        inkMin = Math.min(inkMin, rect.xmin);
        inkMax = Math.max(inkMax, rect.xmax);
      });
      letter.ink = { xmin: inkMin, xmax: inkMax, ymin: inkBot, ymax: inkTop };
      b.xmin = Math.min(b.xmin, inkMin); b.xmax = Math.max(b.xmax, inkMax);
      b.ymin = Math.min(b.ymin, inkBot); b.ymax = Math.max(b.ymax, inkTop);

      // Hook only the role and the game titles, never decorative words.
      if (word.hook && letter.ch !== '.') {
        const cx = (inkMin + inkMax) / 2;
        nodes.push({ x: cx, y: inkBot - 0.02, word: word.id, letter: letter.index, edge: 'bottom' });
        nodes.push({ x: cx, y: inkTop + 0.02, word: word.id, letter: letter.index, edge: 'top' });
      }
    });
    wordBounds[word.id] = b;
  }

  // The gap between "Eren" and "Köselerli" is bridged at x-height so the floor has no pit.
  const name = page.words.filter((p) => p.id === 'name');
  if (name.length === 2) {
    const a = name[0].letters.at(-1).ink, c = name[1].letters[0].ink;
    if (c.xmin > a.xmax && Math.abs(a.ymin - c.ymin) < 0.5) {
      rects.push({ xmin: a.xmax, xmax: c.xmin, ymin: Math.min(a.ymin, c.ymin), ymax: Math.min(a.ymax, c.ymax),
        oneWay: false, word: 'name', letter: -1 });
    }
  }

  // Likewise from the ends of the name's bottom line to the walls, so nothing can fall behind it.
  // Only across a sliver: where the height caps the name short of the far wall, a bridge would be
  // a ledge standing on nothing, and that side stays open.
  if (name.length) {
    const hero = page.hero.getBoundingClientRect();
    const lowest = name.reduce((p, q) => (q.letters[0].ink.ymin < p.letters[0].ink.ymin ? q : p));
    const row = name.filter((q) => Math.abs(q.letters[0].ink.ymin - lowest.letters[0].ink.ymin) < 0.5);
    const first = row[0].letters[0].ink, last = row.at(-1).letters.at(-1).ink;
    const bridge = (xmin, xmax, ink) => {
      if (xmax - xmin > MAX_NAME_BRIDGE) return;
      rects.push({ xmin, xmax, ymin: ink.ymin, ymax: ink.ymax, oneWay: false, word: 'name', letter: -1 });
    };
    bridge(X(hero.left), first.xmin, first);
    bridge(last.xmax, X(hero.right), last);
  }

  // The ground is the heavy bar above the base row. Its right part, above the contact links, is
  // where a run ends.
  const heroRect = page.hero.getBoundingClientRect();
  const WL = X(heroRect.left) + 0.4;
  const W = X(heroRect.right) - 0.4;
  const FL = Y(page.base.getBoundingClientRect().top);
  const contactLeft = Math.max(X(page.contact.getBoundingClientRect().left), WL + (W - WL) * 0.5);
  const tall = 400;
  rects.push({ xmin: WL - 4, xmax: WL, ymin: FL - 4, ymax: FL + tall, oneWay: false, word: 'wall', letter: -3 });
  rects.push({ xmin: W, xmax: W + 4, ymin: FL - 4, ymax: FL + tall, oneWay: false, word: 'wall', letter: -3 });
  rects.push({ xmin: WL - 4, xmax: contactLeft, ymin: FL - 4, ymax: FL, oneWay: false, word: 'ground', letter: -4 });
  rects.push({ xmin: contactLeft, xmax: W + 4, ymin: FL - 4, ymax: FL, oneWay: false, word: 'contact', letter: -2 });

  const smallText = page.smallText.map((el) => {
    const r = el.getBoundingClientRect();
    return { xmin: X(r.left), xmax: X(r.right), ymax: Y(r.top), ymin: Y(r.bottom) };
  });

  // Spawn: the character drips out of the underside of a hook-word letter with a clear drop to
  // the name. The full stop of "Unity developer." goes first when its column is clear.
  const spawns = [];
  const nameTop = FL;
  const hw = colliderSize.x / 2 + 0.02, hh = colliderSize.y / 2 + 0.02;
  const lowest = [];
  for (const word of page.words) {
    if (!word.hook) continue;
    for (const l of word.letters) lowest.push({ l, dot: l.ch === '.' ? 1 : 0 });
  }
  lowest.sort((a, b) => (b.dot - a.dot) || (a.l.ink.ymin - b.l.ink.ymin));
  const blocked = (x, yTop, yBottom) => rects.some((r) => !r.oneWay && r.word !== 'wall' && r.word !== 'ground' && r.word !== 'contact' && r.word !== 'name'
    && r.xmin < x + hw && r.xmax > x - hw && r.ymin < yTop && r.ymax > yBottom);
  for (const { l } of lowest) {
    const x = (l.ink.xmin + l.ink.xmax) / 2;
    const y = l.ink.ymin - hh;
    if (y <= nameTop) continue;
    if (blocked(x, y + colliderSize.y / 2 - 0.05, nameTop)) continue;
    spawns.push({ x, y, letter: l.index });
    if (spawns.length >= 6) break;
  }

  // The stacked layout has no run, and its last title is below the fold. So the character starts
  // under the name, as far right as the way down to the floor is clear, and is seen falling.
  if (phone && name.length) {
    const y = Math.min(...name.map((q) => q.letters[0].ink.ymin)) - hh;
    for (let x = W - hw; x > WL + hw; x -= 0.5) {
      if (blocked(x, y + colliderSize.y / 2 - 0.05, nameTop)) continue;
      spawns.unshift({ x, y, letter: -1 });
      break;
    }
  }

  return new Level({ rects, nodes, spawns, smallText, width: W, left: WL, top: Y(0), ppu, wordBounds });
}
