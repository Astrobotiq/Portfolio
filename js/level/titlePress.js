// Pure rules for telling "swing" from "follow the Steam link" on the game titles, and for deciding
// which keys belong to the game. No DOM here, so the table in the spec is testable as is.
export const TITLE_HOLD_MS = 400;   // A press on a title at least this long is a swing.
export const TITLE_MOVE_PX = 12;    // Moving the pointer further than this is a swing (or a scroll on touch).
export const PLAY_IDLE_MS = 1500;   // Standing still on the ground this long hands the titles back to the links.
export const RESUME_IDLE_MS = 3500; // After this long untouched, the bot picks the run back up.

// Playing: a key or pointer is held, or the character is airborne, or landed less than PLAY_IDLE_MS ago.
export function isPlaying({ humanMode, neutral, grounded, idleMs }) {
  if (!humanMode) return false;
  if (!neutral) return true;
  return !(grounded && idleMs >= PLAY_IDLE_MS);
}

export function pressOutcome({ playing, heldMs, movedPx, touch, modifier }) {
  if (modifier) return 'steam';
  if (playing) return 'swing';
  const moved = movedPx > TITLE_MOVE_PX;
  if (touch && moved) return 'scroll';
  if (heldMs >= TITLE_HOLD_MS || moved) return 'swing';
  return 'steam';
}

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', ' '];
const HOOK_KEYS = ['j', 'k'];

// `key` is already lower-cased for single characters. J and K start the game, so they always count.
// The rest only count once the game has started and while the top of the page is on screen.
// Space on a link the keyboard focused stays the browser's. Enter is never the game's.
export function keyBelongsToGame({ key, engaged, heroVisible, onFocusedLink }) {
  if (HOOK_KEYS.includes(key)) return true;
  if (!NAV_KEYS.includes(key)) return false;
  if (!engaged || !heroVisible) return false;
  if (key === ' ' && onFocusedLink) return false;
  return true;
}
