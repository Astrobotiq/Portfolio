// Pure rules for the page's lifecycle: when the Skip button shows, when the frame loop may sleep,
// when a resize is a new level, and where a character goes when the level changes under it.
// No DOM here, so they are testable as they stand.
export const SLEEP_AFTER_MS = 3000;
const URL_BAR_PX = 120;
const RUN_MODES = ['planning', 'bot', 'replanning'];

export function skipVisible({ mode, phone }) {
  return !phone && RUN_MODES.includes(mode);
}

// True while nothing on the page can change by itself. The run must be over, because a visitor
// who stopped with games unopened gets the bot back after RESUME_IDLE_MS, and that needs ticks.
export function atRest({ mode, wordsLeft, grounded, paused, settled, neutral, speed }) {
  const runOver = mode === 'done' || (mode === 'human' && wordsLeft === 0);
  return runOver && grounded && !paused && settled && neutral && speed < 0.05;
}

// A phone's collapsing URL bar changes only the height by a little: not a new level. On a desktop
// the type scales with the height, so there every change counts.
export function resizeNeedsRelevel({ w, h, phone, lastW, lastH, lastPhone }) {
  if (w === lastW && h === lastH && phone === lastPhone) return false;
  const urlBar = phone && lastPhone && w === lastW && Math.abs(h - lastH) < URL_BAR_PX;
  return !urlBar;
}

// Keeps a collider between the walls, under the top of the page and above the floor. A character
// carried over from a taller layout would otherwise start below the floor and fall for ever.
// Landing inside a letter is left to the physics, which pushes out of overlaps on the next move.
export function clampToLevel(pos, level, size) {
  const hw = size.x / 2, hh = size.y / 2;
  const floor = Math.max(...level.rects.filter((r) => r.word === 'ground' || r.word === 'contact').map((r) => r.ymax));
  return {
    x: Math.min(level.width - hw, Math.max(level.left + hw, pos.x)),
    y: Math.max(floor + hh, Math.min(level.top - hh, pos.y)),
  };
}
