// Slingshot's footage: it moves by itself while it is in view, and a press pauses it. Only a page
// with JS gets a button here, so a plain page has a poster and nothing that pretends to work.
export const REEL_START_RATIO = 0.5;

export function reelAutoplays({ reduced, saveData, phone }) {
  return !reduced && !saveData && !phone;
}

export class Reel {
  constructor(video, button, description, { autoplay }) {
    this.video = video;
    this.button = button;
    this.description = description;
    this.autoplay = autoplay;
    // Until the first press, the rule decides. Afterwards, the press does.
    this.pressed = false;
    this.wants = false;
    video.addEventListener('play', () => this._sync());
    video.addEventListener('pause', () => this._sync());
    button.addEventListener('click', () => this.toggle());
    this._sync();
  }

  _sync() {
    const moving = !this.video.paused;
    this.button.classList.toggle('moving', moving);
    this.button.setAttribute('aria-label', `${moving ? 'Pause' : 'Play'} video. ${this.description}`);
  }

  _play() {
    // A refused or interrupted play leaves the poster and the mark, which is all there is to say.
    this.video.play()?.catch(() => {});
  }

  toggle() {
    this.pressed = true;
    this.wants = this.video.paused;
    if (this.wants) this._play();
    else this.video.pause();
  }

  // How much of it is in view, from 0 to 1.
  seen(ratio) {
    if (ratio <= 0) {
      if (!this.video.paused) this.video.pause();
      // Without autoplay, motion only ever follows a press, so coming back asks for a new one.
      if (!this.autoplay()) this.wants = false;
      return;
    }
    const wants = this.pressed ? this.wants : this.autoplay();
    if (wants && ratio >= REEL_START_RATIO && this.video.paused) this._play();
  }
}

export function startReel({ video, reduced, isPhoneLayout }) {
  if (!video) return null;
  const doc = video.ownerDocument;
  const description = video.getAttribute('aria-label');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'reel';
  video.replaceWith(button);
  button.append(video);
  video.removeAttribute('aria-label');
  const mark = doc.createElement('span');
  mark.className = 'reel-mark';
  mark.setAttribute('aria-hidden', 'true');
  button.append(mark);

  const reel = new Reel(video, button, description, {
    autoplay: () => reelAutoplays({ reduced, saveData: !!navigator.connection?.saveData, phone: isPhoneLayout() }),
  });
  new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    reel.seen(entry.isIntersecting ? entry.intersectionRatio : 0);
  }, { threshold: [0, REEL_START_RATIO] }).observe(button);
  return reel;
}
