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
// 300px, not 100vw: a DPR 2 phone then picks the 600 image.
const PANEL_SIZES = '(max-aspect-ratio: 1/1) 300px, 34vw';

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
    assert.equal(attr(panel, 'sizes'), PANEL_SIZES);
  }
});

test('ghost and panel ask for the same image, so each game downloads one', () => {
  for (const ghost of images('ghost')) assert.equal(attr(ghost, 'sizes'), PANEL_SIZES);
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

test('the hero spans the window and the hint needs JS', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  const hero = css.match(/^\.hero {[^}]*}/m)[0];
  assert.doesNotMatch(hero, /\bwidth:/, 'the hero takes the full width, not a width from --w');
  assert.doesNotMatch(hero, /margin: 0 auto/, 'the hero is not centred');
  assert.match(css, /html:not\(\.js\) \.source b { display: none; }/);
});

test('the name has its own cap, independent of --w', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  assert.ok(css.includes('--name-size: min(calc(17.58 * var(--cw)), 36vh);'));
});

test('short landscape windows give the band more room', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  const short = css.match(/@media \(max-height: 719px\) and \(orientation: landscape\) {[^}]*}/)?.[0] ?? '';
  assert.ok(short.includes('--name-size: min(calc(17.58 * var(--cw)), 30vh);'));
  assert.ok(short.includes('--s3: var(--s2);'));
});

test('the level script is a module, and the page still reads whole without it', () => {
  assert.ok(tags('script').some((tag) => attr(tag, 'type') === 'module' && attr(tag, 'src') === 'js/level/main.js'));
  assert.match(html, /<h1 class="name"><span class="w">Eren<\/span> <span class="w">Köselerli<\/span><\/h1>/);
});

test('Skip starts hidden, inside the source line, and is a real button', () => {
  const source = between('<p class="source">', '</p>');
  const skip = tags('button', source)[0];
  assert.ok(skip, 'missing the button');
  assert.ok(hasClass(skip, 'skip'));
  assert.ok(hasAttr(skip, 'hidden'));
  assert.equal(attr(skip, 'type'), 'button');
  assert.match(source, /<button[^>]*>Skip<\/button>/);
});

test('hidden Skip keeps its place, and shows a focus ring', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  assert.match(css, /\.skip\[hidden\] { display: inline-block; visibility: hidden; }/);
  assert.match(css, /\.skip:focus-visible[^{]*{ outline: 3px solid/);
});

test('reduced motion: the last frame comes first, with no trail and no colour transition', () => {
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /html\.js \.panel:not\(\.open\) { opacity: 1; }/);
  assert.match(reduced, /\.col { visibility: visible; }/);
  assert.match(reduced, /#trail, [^{]*{ display: none; }/);
  assert.deepEqual(css.match(/transition:[^;]*/g), ['transition: opacity 1.2s ease'], 'only the trail fades, and it is gone here');
});

test('the page layer leaves colours to the stylesheet and writes no second copy of a word', () => {
  const page = readFileSync(new URL('js/level/Page.js', root), 'utf8');
  assert.doesNotMatch(page, /#[0-9a-f]{6}\b/i);
  assert.doesNotMatch(page, /['"]sr['"]/);
  assert.doesNotMatch(page, /ghost/, 'the ghosts are in the HTML');
  const css = readFileSync(new URL('css/site.css', root), 'utf8');
  assert.match(css, /\.col {[^}]*background: var\(--col\)/);
});

// Spec sections 12 and 6, below the first screen. Also verbatim.
const WORK_COPY = [
  'A precision platformer built around a grappling hook, with my own kinematic physics solver and a state-machine player controller in Unity and C#.',
  'A mobile match-3 with 100K+ downloads. I fixed live bugs across updates and added anti-cheat.',
  'My own 2D engine in C++17 and SFML, built from scratch with ECS, and a tactical Tetris running on it at a locked 60 FPS.',
];
const EXPERIENCE = [
  ['QA', 'Ankara', 'August-October 2026'],
  ['Game Developer', 'Blay Games', 'July 2025-March 2026'],
  ['Game Developer Intern', 'Blay Games', 'October 2024-March 2025'],
  ['Software Test and QA Intern', 'Testinium', 'July-August 2024'],
  ['BSc Software Engineering', 'Izmir University of Economics', '2020-2025'],
];
const hrefs = (source) => tags('a', source).map((tag) => attr(tag, 'href'));
const section = (id) => between(`<section id="${id}"`, '</section>');
const project = (name) => {
  const block = section('work').split(/(?=<article\b)/).find((part) => part.includes(`<h2>${name}</h2>`));
  assert.ok(block, `missing project: ${name}`);
  return block;
};
const siteCss = () => readFileSync(new URL('css/site.css', root), 'utf8');

test('the sections follow the first screen, in the agreed order', () => {
  const at = ['</header>', '<section id="work"', '<section id="experience"', '<section id="contact"'].map((mark) => html.indexOf(mark));
  assert.ok(at.every((pos) => pos !== -1), `missing a section: ${at}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.ok(at[3] < html.indexOf('</main>'));
  const names = ['Slingshot', 'Alice in Blastland', 'Tetris Reflex', 'Dungeon', 'Dance Battle', 'CRT filter', 'Shh Do Not Wake The Baby'];
  const positions = names.map((name) => section('work').indexOf(`<h2>${name}</h2>`));
  assert.ok(positions.every((pos) => pos !== -1), `missing a project: ${positions}`);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('the work copy is verbatim from the spec', () => {
  for (const line of WORK_COPY) assert.ok(section('work').includes(line), `missing: ${line}`);
});

test('the four smaller projects have a title and their one agreed sentence', () => {
  const sentences = {
    Dungeon: 'A Viking tactics game inspired by Into The Breach, with a Utility AI I built to pick attack positions and avoid hazards.',
    'Dance Battle': 'A turn-based disco card game, with a card effect system I built on ScriptableObjects.',
    'CRT filter': 'A CRT shader I made for Slingshot and published as an open-source Unity package.',
    'Shh Do Not Wake The Baby': 'A tower defense where you beat enemies without waking the baby, with grid obstacle placement and a runtime NavMesh.',
  };
  for (const [name, sentence] of Object.entries(sentences)) {
    const text = project(name).match(/<\/h2>\s*<p>([^<]*)<\/p>/)?.[1];
    assert.equal(text, sentence, name);
    assert.equal(text.match(/[.!?](\s|$)/g).length, 1, `${name} is one sentence`);
  }
  assert.ok(!html.includes('—'));
});

test('every project links where it should', () => {
  const links = {
    Slingshot: ['slingshot.html', 'https://github.com/Astrobotiq/RockTheGame'],
    'Alice in Blastland': ['https://play.google.com/store/apps/details?id=com.blay.wonder', 'https://apps.apple.com/us/app/alice-in-blastland/id1631371168'],
    'Tetris Reflex': ['tetris-reflex.html'],
    Dungeon: ['https://github.com/Astrobotiq/Dungeon'],
    'Dance Battle': ['https://github.com/Astrobotiq/Dance-Battle'],
    'Shh Do Not Wake The Baby': ['https://github.com/Astrobotiq/Shh-Do-Not-Wake-The-Baby'],
    'CRT filter': ['https://github.com/Astrobotiq/crt-filter-urp'],
  };
  for (const [name, expected] of Object.entries(links)) assert.deepEqual(hrefs(project(name)), expected, name);
});

test('links that leave the site open a new tab', () => {
  for (const tag of tags('a', section('work')).concat(tags('a', section('contact')))) {
    if (!/^https:/.test(attr(tag, 'href'))) continue;
    assert.equal(attr(tag, 'target'), '_blank', tag);
    assert.equal(attr(tag, 'rel'), 'noopener', tag);
  }
});

test('old copy stays out: no old name, course pages, tags or the old Slingshot concept', () => {
  for (const phrase of ['Tetris Reverse', '.EXE', '.exe', 'reveal', 'foundational', 'Spring Joints', 'syllabus', 'SE 330', 'SE 350', 'İzmir']) {
    assert.ok(!html.includes(phrase), `found: ${phrase}`);
  }
});

test('the experience list is the five dated lines, in order and in three columns', () => {
  const items = section('experience').match(/<li>[\s\S]*?<\/li>/g)
    ?.map((item) => [...item.matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1]));
  assert.deepEqual(items, EXPERIENCE);
  const css = siteCss();
  assert.match(css, /\.jobs li { display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); }/);
  assert.match(css, /\.jobs li span { display: block;/, 'stacked on the phone');
});

test('there is no grade and no percentage bar', () => {
  assert.ok(!html.includes('GPA'));
  assert.ok(!html.includes('<progress'));
  assert.ok(!html.includes('progressbar'));
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ' '), /\d\s*%/);
  assert.match(section('experience'), /<h2>Skills<\/h2>[\s\S]*Unity/);
});

test('the page ends on a yellow band with the email, LinkedIn, GitHub and the CV', () => {
  assert.deepEqual(hrefs(section('contact')), [
    'mailto:koselerlie@gmail.com',
    'https://www.linkedin.com/in/eren-k%C3%B6selerli/',
    'https://github.com/Astrobotiq',
    'assets/Eren-Koselerli-CV.pdf',
  ]);
  assert.ok(html.indexOf('</section>', html.indexOf('<section id="contact"')) < html.indexOf('</main>'));
  assert.match(html.slice(html.indexOf('</section>', html.indexOf('<section id="contact"'))), /^<\/section>\s*<\/main>/);
  assert.match(section('contact'), /<h2>\s*<a class="go" href="mailto:/, 'the email is the title');
  assert.ok(hasAttr(tags('a', section('contact')).at(-1), 'download'));
  assert.ok(!section('experience').includes('mailto:'));
  assert.match(siteCss(), /\.closing {[^}]*background: #f5c518/);
  assert.equal(html.match(/<h2>Contact<\/h2>/), null, 'the band says it by itself');
});

test('hover: the CV button mixes toward the paper, text links thicken, Skip adds nothing', () => {
  const css = siteCss();
  assert.match(css, /\.cv:hover[^{]*{ background: color-mix\(in srgb, var\(--fg\) 85%, var\(--surface\)\); }/);
  assert.match(css, /\.go:hover[^{]*{ text-decoration-thickness:/);
  assert.doesNotMatch(css, /\.skip:hover/);
});

test('secondary project titles drop a size, and section headings stay at title size', () => {
  const css = siteCss();
  assert.match(css, /\.others h2 {[^}]*font-size: max\(1\.5rem, calc\(3 \* var\(--w\)\)\)/);
  assert.match(css, /\.below h2 { font: 400 var\(--title-size\)/);
});

test('the hero bio keeps a reading measure', () => {
  assert.match(siteCss(), /^\.line {[^}]*max-width: 60ch;[^}]*text-wrap: pretty/m);
});

test('only OROBOROS and GOKA get the brighter reveal', () => {
  const css = siteCss();
  assert.match(css, /\.panel\.open\[data-word="oro"\], \.panel\.open\[data-word="goka"\] { filter: brightness\(1\.2\) saturate\(1\.15\); }/);
  assert.ok(!/\.panel\.open\[data-word="kiss"\]/.test(css));
});

test('tint and footage share one crop, set per image', () => {
  const css = siteCss();
  assert.match(css, /\.panel, \.ghost {[^}]*object-position: var\(--crop, center\)/);
  for (const word of WORDS) assert.match(css, new RegExp(`\\[data-word="${word}"\\] {[^}]*--crop:`), word);
});

test('unrevealed panels stay in the accessibility tree', () => {
  const css = siteCss();
  assert.match(css, /html\.js \.panel:not\(\.open\) { opacity: 0; pointer-events: none; }/);
  assert.doesNotMatch(css, /\.panel:not\(\.open\) { visibility/);
});

test('the phone layout starts tinted and opens each game as it comes into view', () => {
  const css = siteCss();
  const phone = css.slice(css.indexOf('@media (max-aspect-ratio: 1/1) {'), css.indexOf('/* The sections stack'));
  assert.doesNotMatch(phone, /\.panel/, 'no panel is open from the start');
  assert.doesNotMatch(phone, /\.game { background/, 'the colour comes from the column');
  const main = readFileSync(new URL('js/level/main.js', root), 'utf8');
  assert.match(main, /page\.revealFromTitle\(/);
});

test('the Slingshot video moves by itself, muted, with no controls of its own', () => {
  const videos = tags('video');
  assert.equal(videos.length, 1);
  const video = videos[0];
  assert.equal(attr(video, 'preload'), 'none', 'nothing is fetched before it is in view');
  for (const name of ['muted', 'loop', 'playsinline']) assert.ok(hasAttr(video, name), name);
  assert.ok(!hasAttr(video, 'controls'));
  assert.equal(attr(video, 'poster'), 'assets/img/slingshot-poster.jpg');
  assert.equal(attr(video, 'src'), 'assets/video/slingshot-swing.mp4');
  assert.ok(!hasAttr(video, 'autoplay'));
  assert.match(attr(video, 'width') ?? '', /^\d+$/);
  assert.match(attr(video, 'height') ?? '', /^\d+$/);
  assert.match(attr(video, 'aria-label') ?? '', /^Slingshot gameplay: .*grappling hook/, 'the video is named for what it shows');
  assert.ok(project('Slingshot').includes(video), 'the video belongs to Slingshot');
});

test('the Alice image describes the game and is cropped above its marketing text', () => {
  const image = tags('img', project('Alice in Blastland'))[0];
  assert.equal(attr(image, 'src'), 'assets/img/alice.jpg');
  assert.equal(attr(image, 'loading'), 'lazy');
  assert.match(attr(image, 'alt') ?? '', /match-3/);
  assert.doesNotMatch(attr(image, 'alt') ?? '', /pop the objects/i);
  assert.match(attr(image, 'width') ?? '', /^\d+$/);
  assert.match(attr(image, 'height') ?? '', /^\d+$/);
  assert.match(siteCss(), /object-position: top/);
});

test('the files the sections use exist', () => {
  for (const path of ['assets/video/slingshot-swing.mp4', 'assets/img/slingshot-poster.jpg', 'assets/img/alice.jpg']) {
    assert.ok(existsSync(new URL(path, root)), `missing: ${path}`);
  }
});

test('the Slingshot colour is a token, reaches 4.5:1 and says so on a line of its own', () => {
  const css = siteCss();
  const hex = css.match(/--slingshot: (#[0-9a-f]{6});/)?.[1];
  assert.ok(hex, 'missing the --slingshot token');
  const luminance = (value) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (luminance(hex) + 0.05) / (luminance('#0c0c0d') + 0.05);
  assert.ok(ratio >= 4.5, `only ${ratio}`);
  assert.match(css, new RegExp(`^\\s*/\\*[^\\n]*${ratio.toFixed(2)}:1[^\\n]*\\*/\\s*$`, 'm'), 'the comment states the ratio');
  assert.match(css, /background: var\(--slingshot\)/);
});

test('the video becomes a button with a ring that shows on any footage', () => {
  const css = siteCss();
  assert.match(css, /\.reel:focus-visible { outline: 4px solid var\(--fg\); outline-offset: -4px; }/);
  assert.match(css, /\.reel:focus-visible::after {[^}]*border: 3px solid var\(--surface\)/);
  assert.doesNotMatch(css, /video:focus-visible/);
  const main = readFileSync(new URL('js/level/main.js', root), 'utf8');
  assert.match(main, /startReel\(/);
});

test('the sections stay out of the level: none of its class names are reused below the hero', () => {
  const below = html.slice(html.indexOf('</header>'));
  for (const tag of below.match(/<[a-z][^>]*>/g)) {
    for (const name of ['game', 'title', 'cap', 'slot', 'panel', 'ghost', 'contact', 'cv', 'mail', 'base', 'source', 'skip', 'line', 'col', 'dent', 'l']) {
      assert.ok(!hasClass(tag, name), `${name} in ${tag}`);
    }
  }
});

test('no decoration: no shadows, no entrance animation, and only the dent is round', () => {
  const css = siteCss();
  assert.ok(!css.includes('box-shadow'));
  assert.ok(!css.includes('@keyframes'));
  assert.deepEqual(css.match(/border-radius:[^;]*/g), ['border-radius: 50%']);
  assert.match(css, /\.dent {[^}]*border-radius: 50%/);
});

test('links in the sections show keyboard focus and are big enough to press', () => {
  const css = siteCss();
  assert.match(css, /\.go:focus-visible[^{]*{ outline: 3px solid/);
  assert.match(css, /\.go {[^}]*min-height: 44px/);
  const below = html.slice(html.indexOf('</header>'));
  const links = tags('a', below);
  assert.ok(links.length >= 10, `only ${links.length} links`);
  for (const tag of links) assert.ok(hasClass(tag, 'go'), `not a .go link: ${tag}`);
});

test('the first screen stays one screen tall', () => {
  assert.match(siteCss().match(/^\.hero {[^}]*}/m)[0], /height: 100svh;/);
});

const page = (name) => readFileSync(new URL(name, root), 'utf8');

test('the old Tetris address redirects to the renamed page', () => {
  const old = page('tetris-reverse.html');
  assert.match(old, /<meta http-equiv="refresh" content="0; url=tetris-reflex\.html">/);
  assert.match(old, /<link rel="canonical" href="[^"]*tetris-reflex\.html">/);
  assert.match(old, /<a href="tetris-reflex\.html"/);
  assert.ok(existsSync(new URL('tetris-reflex.html', root)));
});

test('the Tetris page uses its new name everywhere', () => {
  assert.ok(!/Tetris Reverse|tetris_reverse|REVERSE/.test(page('tetris-reflex.html')));
});

test('the subpages link back to the work section', () => {
  for (const name of ['tetris-reflex.html', 'slingshot.html']) {
    const source = page(name);
    assert.ok(!source.includes('#active-projects'), name);
    assert.ok(!/Active Projects|active_projects|Aktif Projeler/.test(source), name);
    assert.ok(source.includes('index.html#work'), name);
  }
});

test('sharing metadata is present and the image exists', () => {
  const meta = (key) => tags('meta').find((tag) => attr(tag, 'property') === key || attr(tag, 'name') === key);
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
    assert.ok(meta(key), `missing ${key}`);
  }
  assert.equal(attr(meta('twitter:card'), 'content'), 'summary_large_image');
  const canonical = tags('link').find((tag) => attr(tag, 'rel') === 'canonical');
  assert.equal(attr(canonical, 'href'), 'https://astrobotiq.github.io/Portfolio/');
  assert.equal(attr(meta('og:url'), 'content'), 'https://astrobotiq.github.io/Portfolio/');
  const image = attr(meta('og:image'), 'content');
  assert.match(image, /^https:\/\/astrobotiq\.github\.io\/Portfolio\/assets\/img\/og\.jpg$/);
  assert.ok(existsSync(new URL(image.replace('https://astrobotiq.github.io/Portfolio/', ''), root)));
});
