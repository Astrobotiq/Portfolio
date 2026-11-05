// The page's side of the deal: splits the real type into letters without moving it, and makes the
// letters react. No screen shake anywhere, by direction: only the touched word moves.

const MAX_SPRING_STEP = 1 / 60; // s

// Where the browser puts each character of a text node, kerning included.
function glyphLefts(node, length) {
  const range = document.createRange();
  const xs = [];
  for (let i = 0; i < length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    xs.push(range.getBoundingClientRect().left);
  }
  return xs;
}

// Put each letter back exactly where it was, so that the split does not shift the first paint.
function placeLetters(letters, xs, fs) {
  for (const l of letters) l.el.style.marginLeft = '';
  for (const l of letters) {
    const dx = xs[l.at] - l.el.getBoundingClientRect().left;
    if (Math.abs(dx) > 0.01) l.el.style.marginLeft = `${dx / fs}em`;
  }
}

export class Page {
  constructor() {
    this.hero = document.getElementById('hero');
    this.contact = document.querySelector('.contact');
    this.base = document.querySelector('.base');
    this.words = [];
    this.lettersByIndex = [];
    this.active = new Set();
    this.pending = [];
    this.time = 0;
    this.ppu = 30;

    document.querySelector('h1').setAttribute('aria-label', 'Eren Köselerli');
    document.querySelectorAll('.name .w').forEach((el) => this._addWord('name', el, { hook: false }));
    document.querySelectorAll('.game').forEach((li) => {
      const title = li.querySelector('.title');
      title.setAttribute('aria-label', title.textContent);
      const word = this._addWord(li.dataset.word, title, { hook: true });
      word.game = li;
    });

    this.panels = {};
    this.cols = {};
    document.querySelectorAll('.panel').forEach((p) => {
      const id = p.dataset.word;
      this.panels[id] = p;
      const col = document.createElement('div');
      col.className = 'col';
      col.dataset.word = id; // The column's colour comes from this, in the stylesheet.
      this.hero.append(col);
      this.cols[id] = col;
    });
    this.smallText = [document.querySelector('.line'), ...document.querySelectorAll('.cap')];
  }

  _addWord(id, el, opts) {
    const text = el.textContent;
    const xs = glyphLefts(el.firstChild, text.length);

    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    const letters = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') { vis.appendChild(document.createTextNode(' ')); continue; }
      const s = document.createElement('span');
      s.className = 'l';
      s.textContent = ch;
      vis.appendChild(s);
      letters.push({ el: s, ch, at: i, dents: [], y: 0, vy: 0, x: 0, vx: 0, s: 0, vs: 0, tug: { x: 0, y: 0 } });
    }
    el.textContent = '';
    el.append(vis);
    placeLetters(letters, xs, parseFloat(getComputedStyle(el).fontSize));

    const word = { id, el, text, vis, letters, ...opts };
    this.words.push(word);
    return word;
  }

  // Run after the level is built, because it needs each letter's rest rectangle and index.
  bindLevel(level) {
    this.ppu = level.ppu;
    this.lettersByIndex = [];
    for (const word of this.words) {
      word.letters.forEach((l) => { this.lettersByIndex[l.index] = l; l.word = word; });
    }
  }

  // Lays the words out again from their plain text, for when the metrics have changed underneath
  // them. The caller rebuilds the level afterwards.
  remeasure() {
    this.clearReactions();
    for (const word of this.words) {
      word.el.textContent = word.text;
      const xs = glyphLefts(word.el.firstChild, word.text.length);
      word.el.textContent = '';
      word.el.append(word.vis);
      placeLetters(word.letters, xs, parseFloat(getComputedStyle(word.el).fontSize));
    }
  }

  // --- Reactions, all driven by real contact events from the simulation ---

  onContact(e) {
    const letter = this.lettersByIndex[e.letter];
    if (!letter) return;
    const mag = Math.min(1, e.speed / 65);
    if (e.speed > 6) this._bump(letter, e.dir, mag);
    const word = letter.word;
    const i = word.letters.indexOf(letter);
    if (e.speed > 10) {
      for (let d = 1; d <= 6; d++) {
        const falloff = Math.pow(0.62, d);
        for (const j of [i - d, i + d]) {
          const n = word.letters[j];
          if (n) this.pending.push({ at: this.time + d * 0.035, letter: n, dir: e.dir, mag: mag * falloff });
        }
      }
    }
  }

  _bump(letter, dir, mag) {
    const fs = letter.rest ? letter.rest.fs : 150;
    const push = fs * 0.2 * mag;
    if (dir.y < 0) { // Landed on it: it compresses from the top.
      letter.s -= 0.42 * mag;
      letter.vs -= 1.2 * mag;
    } else if (dir.y > 0) { // Hit from below: it pops up.
      letter.y -= push;
      letter.s += 0.1 * mag;
      letter.vy -= push * 4;
    } else {
      letter.x += dir.x * push;
      letter.vx += dir.x * push * 4;
    }
    this.active.add(letter);
  }

  // A small permanent dent: a shallow bite in the letter's edge at the contact point.
  dent(e) {
    const letter = this.lettersByIndex[e.letter];
    if (!letter || !letter.rest || letter.dents.length >= 2) return;
    const ppu = this.ppu;
    const fs = letter.rest.fs;
    const depth = Math.max(2, Math.min(fs * 0.03, 2 + (e.speed / 65) * fs * 0.03));
    const span = Math.min(ppu * 0.85, (letter.ink.xmax - letter.ink.xmin) * ppu * 0.42);
    const d = document.createElement('i');
    d.className = 'dent';
    const px = e.point.x * ppu - letter.rest.left;
    let cssText;
    if (e.dir.y !== 0) {
      const edge = e.dir.y > 0 ? letter.ink.ymin : letter.ink.ymax;
      const py = -edge * ppu - letter.rest.top;
      const minX = letter.ink.xmin * ppu - letter.rest.left + span * 0.6;
      const maxX = letter.ink.xmax * ppu - letter.rest.left - span * 0.6;
      const cx = Math.max(minX, Math.min(maxX, px));
      cssText = `left:${cx - span / 2}px;top:${py - depth}px;width:${span}px;height:${depth * 2}px`;
    } else {
      const edge = e.dir.x > 0 ? letter.ink.xmin : letter.ink.xmax;
      const qx = edge * ppu - letter.rest.left;
      const py = -e.point.y * ppu - letter.rest.top;
      cssText = `left:${qx - depth}px;top:${py - span / 2}px;width:${depth * 2}px;height:${span}px`;
    }
    d.style.cssText = cssText;
    letter.el.appendChild(d);
    letter.dents.push(d);
  }

  flood(e) {
    const letter = this.lettersByIndex[e.letter];
    if (!letter || !letter.word.game) return;
    this.reveal(letter.word.id, e.point.x * this.ppu, -e.point.y * this.ppu);
  }

  // How many games have been hit. It only ever moves forward.
  setDay(n) {
    const root = document.documentElement;
    if (+root.dataset.day >= n) return;
    root.dataset.day = String(n);
    if (this.onDay) this.onDay();
  }

  // One circle from the point that was hit opens the column and the footage together, and they
  // stay open. Page coordinates.
  reveal(id, x, y) {
    const panel = this.panels[id], col = this.cols[id];
    if (!panel || panel.classList.contains('open')) return;
    panel.classList.add('open');
    col.classList.add('open');
    this.words.find((w) => w.id === id)?.game?.classList.add('hit');

    // The column holds the panel, so its far corner is the radius that finishes both at once.
    const box = col.getBoundingClientRect();
    const bx = x - box.left, by = y - (box.top + window.scrollY);
    const far = Math.hypot(Math.max(Math.abs(bx), Math.abs(box.width - bx)), Math.max(Math.abs(by), Math.abs(box.height - by)));
    for (const el of [col, panel]) {
      const r = el.getBoundingClientRect();
      const ix = x - r.left, iy = y - (r.top + window.scrollY);
      el.animate(
        [{ clipPath: `circle(0px at ${ix}px ${iy}px)` }, { clipPath: `circle(${far}px at ${ix}px ${iy}px)` }],
        { duration: 620, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    }
  }

  // The phone layout has no hit to open from, so the circle starts at the game's own title.
  revealFromTitle(id) {
    const word = this.words.find((w) => w.id === id);
    if (!word) return;
    const r = word.el.getBoundingClientRect();
    this.reveal(id, r.left + r.width / 2, r.top + r.height / 2 + window.scrollY);
  }

  revealAll() {
    for (const p of Object.values(this.panels)) p.classList.add('open');
    for (const c of Object.values(this.cols)) c.classList.add('open');
    for (const w of this.words) if (w.game) w.game.classList.add('hit');
    this.setDay(3);
  }

  // Each game's column, from its title to the bottom of its footage.
  layoutCols() {
    const hero = this.hero.getBoundingClientRect();
    for (const word of this.words) {
      const col = this.cols[word.id];
      if (!col) continue;
      const slotEl = this.panels[word.id].parentElement;
      const slot = slotEl.getBoundingClientRect();
      // From the heading's box, so that the space above the title is coloured too.
      const top = word.el.closest('h2').getBoundingClientRect().top - hero.top;
      // Stacked games have a margin under the footage, and the colour runs on to the next game.
      const bottom = slot.bottom + parseFloat(getComputedStyle(slotEl).marginBottom) - hero.top;
      col.style.left = `${slot.left - hero.left}px`;
      col.style.width = `${slot.width}px`;
      col.style.top = `${top}px`;
      col.style.height = `${bottom - top}px`;
    }
  }

  // Anchored letters get pulled by the rope, a little.
  setTug(letterIndices, char, frozen) {
    if (this._tugged) for (const l of this._tugged) if (!letterIndices.includes(l.index)) { l.tug = { x: 0, y: 0 }; this.active.add(l); }
    const list = [];
    for (const idx of letterIndices) {
      const l = this.lettersByIndex[idx];
      if (!l || !l.ink) continue;
      const cx = ((l.ink.xmin + l.ink.xmax) / 2) * this.ppu, cy = -l.ink.ymin * this.ppu;
      const dx = char.x - cx, dy = char.y - cy;
      const m = Math.hypot(dx, dy) || 1;
      const k = l.rest.fs * (frozen ? 0.06 : 0.035);
      l.tug = { x: (dx / m) * k, y: (dy / m) * k };
      this.active.add(l);
      list.push(l);
    }
    this._tugged = list;
  }

  update(dt, frozen) {
    if (!frozen) {
      this.time += dt;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (p.at <= this.time) {
          this._bump(p.letter, p.dir, p.mag);
          this.pending.splice(i, 1);
        }
      }
      const k = 340, c = 15;
      // This spring blows up at steps over about 70 ms, so a slow frame is cut into smaller ones.
      const steps = Math.ceil(dt / MAX_SPRING_STEP);
      const h = steps ? dt / steps : 0;
      for (const l of this.active) {
        const tx = l.tug.x, ty = l.tug.y;
        for (let i = 0; i < steps; i++) {
          l.vy += (-k * (l.y - ty) - c * l.vy) * h;
          l.y += l.vy * h;
          l.vx += (-k * (l.x - tx) - c * l.vx) * h;
          l.x += l.vx * h;
          l.vs += (-k * l.s - c * l.vs) * h;
          l.s += l.vs * h;
        }
        const still = Math.abs(l.y - ty) + Math.abs(l.x - tx) + Math.abs(l.vy) * 0.02 + Math.abs(l.vx) * 0.02 + Math.abs(l.s) * 40 + Math.abs(l.vs) * 2 < 0.08;
        if (still && tx === 0 && ty === 0) {
          l.y = l.x = l.s = l.vy = l.vx = l.vs = 0;
          l.el.style.transform = '';
          this.active.delete(l);
        }
      }
    }
    for (const l of this.active) {
      const sy = Math.max(0.6, 1 + l.s), sx = 1 - l.s * 0.5;
      l.el.style.transform = `translate(${l.x.toFixed(2)}px,${l.y.toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    }
  }

  // How far the letter under the character has moved, so that it rides the dent down.
  letterOffset(index) {
    const l = this.lettersByIndex[index];
    if (!l || !l.rest) return { x: 0, y: 0 };
    return { x: l.x, y: l.y + (l.ink ? -l.s * (l.ink.ymax * this.ppu + l.rest.baseline) : 0) };
  }

  get settled() {
    return this.active.size === 0 && this.pending.length === 0;
  }

  clearReactions() {
    this.pending.length = 0;
    this._tugged = [];
    for (const word of this.words) {
      for (const l of word.letters) {
        l.y = l.x = l.s = l.vy = l.vx = l.vs = 0;
        l.tug = { x: 0, y: 0 };
        l.el.style.transform = '';
        for (const d of l.dents) d.remove();
        l.dents = [];
      }
    }
    this.active.clear();
  }
}
