import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const pages = ['slingshot.html', 'tetris-reflex.html'];
const css = () => read('css/subpage.css');

// The two tables a page keeps its words in, evaluated the way the browser would.
const tables = (source) => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const window = {};
  new Function('window', 'document', script)(window, {});
  return window;
};

for (const name of pages) {
  test(`${name} loads the home page's tokens and its own sheet, in that order`, () => {
    const source = read(name);
    const site = source.indexOf('href="css/site.css"');
    const own = source.indexOf('href="css/subpage.css"');
    assert.ok(site > 0 && own > site, 'site.css has to come first');
  });

  test(`${name} fetches nothing from another host and names no old font`, () => {
    const source = read(name);
    for (const old of ['fonts.googleapis', 'fonts.gstatic', 'Press Start', 'Source Code Pro', 'Rajdhani', '--pixel', '--mono']) {
      assert.ok(!source.includes(old), `found ${old}`);
    }
    const remote = [...source.matchAll(/(?:href|src)="(https?:[^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(remote, []);
  });

  test(`${name} keeps its styling in the stylesheet`, () => {
    const source = read(name);
    assert.ok(!/<style[\s>]/.test(source));
    assert.ok(!/\sstyle="/.test(source));
  });

  test(`${name} links back to the work section from the top and the bottom`, () => {
    const links = read(name).match(/href="index\.html#work"/g) ?? [];
    assert.equal(links.length, 2);
  });

  test(`${name} keeps the language switch, and every word exists in both languages`, () => {
    const source = read(name);
    assert.ok(source.includes('id="langToggle"'));
    assert.ok(source.includes('src="js/ui/lang.js"'));
    const { TRANSLATIONS: t, ENTRY_CONTENT: entries } = tables(source);
    assert.deepEqual(Object.keys(t.tr).sort(), Object.keys(t.en).sort());
    const keys = [...source.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 20);
    for (const key of keys) assert.ok(key in t.en, `no text for ${key}`);
    for (const entry of Object.values(entries)) {
      assert.ok(entry.en.trim() && entry.tr.trim());
    }
  });

  test(`${name} has one night and no theme switch`, () => {
    const source = read(name);
    for (const gone of ['themeToggle', 'toggleTheme', 'js/ui/theme.js', 'js/ui/menu.js', 'js/ui/reveal.js']) {
      assert.ok(!source.includes(gone), `found ${gone}`);
    }
  });

  test(`${name} says whether its entry is open`, () => {
    const source = read(name);
    assert.match(source, /id="entry-01-toggle" aria-expanded="false" aria-controls="entry-01-body"/);
    assert.match(source, /setAttribute\('aria-expanded', String\(!isOpen\)\)/);
  });

  test(`${name} sets Gasoek One only on words it has the letters for`, () => {
    const { TRANSLATIONS: t } = tables(read(name));
    for (const lang of ['en', 'tr']) {
      assert.ok(!/[şŞğĞİ]/.test(t[lang].entry01_title), `${lang}: ${t[lang].entry01_title}`);
      assert.ok(!/[şŞğĞİ]/.test(t[lang].footer_back), `${lang}: ${t[lang].footer_back}`);
    }
  });
}

test('the Tetris page names the same library as the home page', () => {
  assert.ok(read('index.html').includes('C++17 and SFML'));
  const source = read('tetris-reflex.html');
  assert.ok(source.includes('<div class="tech-chip">SFML</div>'));
  assert.ok(!source.includes('SDL'));
});

test('the project pages add no faces of their own and use the home page tokens', () => {
  const sheet = css();
  assert.ok(!sheet.includes('@font-face'));
  assert.ok(!/https?:/.test(sheet));
  for (const token of ['--surface', '--ground', '--dusk', '--fg', '--ink', '--muted', '--coral', '--teal', '--display', '--body', '--edge']) {
    assert.ok(sheet.includes(`var(${token})`), `${token} is not used`);
    assert.ok(!new RegExp(`^\s*${token}:`, 'm').test(sheet), `${token} is redefined`);
  }
});

test('keyboard focus is visible on every control', () => {
  const sheet = css();
  assert.match(sheet, /a:focus-visible, button:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }/);
  assert.match(sheet, /\.tl-toggle:focus-visible { outline-color: var\(--fg\); }/);
});

test('type that fills the width is sized from the span between the edges', () => {
  const sheet = css();
  assert.match(sheet, /\.game-title-main { font: 400 calc\(var\(--title-fit\) \* var\(--span\)\)/);
  assert.match(sheet, /font: 400 calc\(7\.85 \* var\(--span\)\)/);
});

test('an open entry is as tall as its text, so nothing is cut off on a phone', () => {
  const sheet = css();
  assert.ok(!/\.tl-body[^{]*{[^}]*max-height/.test(sheet));
  assert.match(sheet, /\.tl-body\.open { grid-template-rows: 1fr;/);
});

test('motion stays out of the way', () => {
  const sheet = css();
  assert.ok(!sheet.includes('@keyframes'));
  assert.match(sheet, /@media \(prefers-reduced-motion: reduce\) {\s*\.tl-body { transition: none; }/);
});
