import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

// Spec section 12, first screen. Copied verbatim: a reworded line is a failure.
const FIRST_SCREEN_COPY = [
  'Unity developer',
  'I build and ship games in Unity and C#: gameplay, multiplayer and performance. Two on Steam, a third coming soon, and a mobile match-3 with 100K+ downloads. Based in Ankara, available now and open to relocating.',
  'I ported it to Steam alone and removed GC spikes from 10+ core controllers.',
  'On the programming team, I worked on core mechanics and the Steam release.',
  'Coming soon. I built multiplayer sync under 100 ms and halved new-enemy build time.',
  'Try it: hold to swing, let go to fly.',
  'This is the movement code from Slingshot, my Unity platformer, ported to the web.',
  'Read the C# on GitHub',
];

const BANNED_COPY = ['15+ months', 'live-ops', '0%', '100% deterministic'];
const WORDS = ['oro', 'goka', 'kiss'];

const tags = (name, source = html) => source.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>])`))?.[1];
const hasAttr = (tag, name) => new RegExp(`\\s${name}(?:=|\\s|>)`).test(tag);
const hasClass = (tag, name) => (attr(tag, 'class') ?? '').split(/\s+/).includes(name);
const images = (name) => tags('img').filter((tag) => hasClass(tag, name));
const between = (open, close) => {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start) + close.length);
};
const gamesList = () => between('<ul class="games">', '</ul>');

test('first-screen copy is verbatim from the spec', () => {
  for (const line of FIRST_SCREEN_COPY) assert.ok(html.includes(line), `missing: ${line}`);
});

test('banned phrases are absent', () => {
  for (const phrase of BANNED_COPY) assert.ok(!html.includes(phrase), `found: ${phrase}`);
});

test('there is one h1 and each game has its h2', () => {
  assert.equal(tags('h1').length, 1);
  // Counted inside the list because later sections bring their own h2s.
  assert.equal(tags('h2', gamesList()).length, 3);
});

test('every panel has real alt text, dimensions and a srcset', () => {
  const panels = images('panel');
  assert.equal(panels.length, 3);
  for (const panel of panels) {
    assert.ok((attr(panel, 'alt') ?? '').trim().length > 10, `alt: ${panel}`);
    assert.match(attr(panel, 'width') ?? '', /^\d+$/);
    assert.match(attr(panel, 'height') ?? '', /^\d+$/);
    assert.match(attr(panel, 'srcset') ?? '', /-600\.jpg 600w, .*-1920\.jpg 1920w$/);
    assert.equal(attr(panel, 'sizes'), '(max-aspect-ratio: 1/1) 100vw, 34vw');
  }
});

test('every ghost is hidden from assistive technology', () => {
  const ghosts = images('ghost');
  assert.equal(ghosts.length, 3);
  for (const ghost of ghosts) {
    assert.equal(attr(ghost, 'alt'), '');
    assert.equal(attr(ghost, 'aria-hidden'), 'true');
  }
});

test('every game follows the DOM contract', () => {
  const list = gamesList();
  const items = list.split(/(?=<li\b)/).slice(1);
  assert.deepEqual(items.map((item) => attr(tags('li', item)[0], 'data-word')), WORDS);
  items.forEach((item, i) => {
    assert.ok(hasClass(tags('li', item)[0], 'game'));
    assert.match(item, /<h2\b[^>]*>\s*<a\b[^>]*class="title"/);
    assert.match(item, /<\/h2>\s*<p class="cap">/);
    assert.match(item, /<div class="slot">\s*<img\b[^>]*class="ghost"[^>]*>\s*<img\b[^>]*class="panel"[^>]*>\s*<\/div>/);
    const panel = images('panel').filter((tag) => item.includes(tag))[0];
    assert.equal(attr(panel, 'data-word'), WORDS[i]);
  });
  assert.match(html, /<h1 class="name"><span class="w">Eren<\/span> <span class="w">Köselerli<\/span><\/h1>/);
  assert.match(html, /<div class="intro">\s*<p class="role">[^<]*<\/p>\s*<p class="line">/);
  assert.match(html, /<div class="base">\s*<p class="source">[\s\S]*?<\/p>\s*<p class="contact">\s*<a class="cv"[^>]*>[^<]*<\/a>\s*<a class="mail"/);
  assert.match(html, /id="hero"/);
});

test('every title opens its store page in a new tab', () => {
  const titles = tags('a').filter((tag) => hasClass(tag, 'title'));
  assert.equal(titles.length, 3);
  for (const title of titles) {
    assert.equal(attr(title, 'target'), '_blank');
    assert.equal(attr(title, 'rel'), 'noopener');
    assert.match(attr(title, 'href') ?? '', /^https:\/\/store\.steampowered\.com\/app\//);
  }
});

test('the CV is a download link', () => {
  const cv = tags('a').find((tag) => hasClass(tag, 'cv'));
  assert.equal(attr(cv, 'href'), 'assets/Eren-Koselerli-CV.pdf');
  assert.ok(hasAttr(cv, 'download'));
});

test('nothing is fetched from another host', () => {
  for (const host of ['fonts.googleapis', 'fonts.gstatic', 'steamstatic', 'googleusercontent']) {
    assert.ok(!html.includes(host), `found: ${host}`);
  }
});

test('the head script is the five-second fallback and nothing else', () => {
  const head = between('<head>', '</head>');
  assert.match(head, /classList\.add\('js'\)/);
  assert.match(head, /dataset\.day = '0'/);
  assert.match(head, /window\.__booted/);
  assert.match(head, /classList\.remove\('js'\)[^]*5000/);
  assert.ok(!head.includes('URLSearchParams'));
  assert.ok(!tags('html')[0].includes('class='), 'js class must come from the script, not the markup');
});

test('local files referenced by the page exist', () => {
  const srcset = images('panel').concat(images('ghost'))
    .flatMap((tag) => [attr(tag, 'src'), ...attr(tag, 'srcset').split(', ').map((part) => part.split(' ')[0])]);
  const links = tags('link').map((tag) => attr(tag, 'href')).filter((href) => !/^https?:/.test(href));
  // The CV PDF is left out on purpose: the owner supplies it and the release gate checks it.
  for (const path of [...srcset, ...links]) assert.ok(existsSync(new URL(path, root)), `missing: ${path}`);
});

test('fonts are self-hosted with swap, and the tokens are the agreed ones', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  assert.equal(faces.length, 4);
  for (const face of faces) {
    assert.match(face, /font-display: swap/);
    const url = face.match(/url\("?([^")]+)"?\)/)[1];
    assert.ok(existsSync(new URL(url, new URL('css/', root))), `missing: ${url}`);
  }
  assert.ok(!/https?:/.test(css), 'css must not reach another host');
  for (const token of ['--surface: #f1efea', '--fg: #0c0c0d', '#8f7bff', '#ff6fae', '#f5c518']) {
    assert.ok(css.includes(token), `missing: ${token}`);
  }
});
