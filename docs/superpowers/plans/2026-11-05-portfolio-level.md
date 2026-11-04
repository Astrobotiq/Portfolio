# Portfolyo "Sayfa bölüm oluyor" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut `index.html`'i, karakterin oyun başlıklarında sallandığı ve her vuruşun oyunu renklendirdiği Triptych portfolyo sayfasıyla değiştirmek.

**Architecture:** Bağımlılıksız statik site. Sayfa JavaScript olmadan da tamdır; `js/level/` üzerine bir katman olarak çalışır. Simülasyon DOM bilmez ve Node'da test edilir; DOM katmanı yalnızca simülasyon olaylarına tepki verir. Çalışan prototip `.superpowers/spikes/level2/` port kaynağıdır.

**Tech Stack:** HTML, CSS, ES modülleri, Web Worker, Canvas 2D, `node --test` (Node 22). Paket bağımlılığı yok.

**Spec:** `docs/superpowers/specs/2026-11-05-portfolio-level-design.md`

## Global Constraints

- Build adımı ve paket bağımlılığı yok. `package.json` yalnızca `"type": "module"` ve test komutu içindir.
- Site metinleri spec Bölüm 12'deki tablodan birebir alınır. Dil İngilizce, `lang="en"`.
- Şu ifadeler sitede geçmez: "15+ months", "live-ops", "0%", "100% deterministic".
- Tokenlar: `--surface #f1efea`, `--fg #0c0c0d`, OROBOROS `#8f7bff`, GOKA Street `#ff6fae`, Kiss Cargo `#f5c518`.
- Fontlar Anton ve Archivo, kendi sunucumuzda, `font-display: swap`. Harici font veya görsel isteği yok.
- Kaynak kod yorumlarında, metinlerde kimse için cinsiyetli zamir kullanılmaz.
- Commit'ler `redesign/level-portfolio` dalına gider. `main`'e birleştirme ve push ancak sahibi isterse yapılır.
- Her commit mesajı şu satırla biter: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `slingshot.html` ve Tetris alt sayfası için `js/ui/*` ve `js/tetris/*` silinmez.
- `.superpowers/` git dışında kalır; plana alınan dosyalar oradan kopyalanır.

## Review Focus

1. **Sayfanın alt kısmına kaydıran ziyaretçi:** Kaydırma hiç takılmamalı; karakter ekran dışındayken simülasyon durmalı, geri dönünce kaldığı yerden sürmeli. (Görev 5)
2. **Telefon ve masaüstü düzeni arasında yön değiştirme:** Görseller gizli kalmamalı, karakter sayfa dışında kaybolmamalı. (Görev 5)
3. **Anton geç yüklenir:** Harf genişlikleri değişince seviye geometrisi görünen harflerle yeniden hizalanmalı. (Görev 5)
4. **Koşu sırasında kısa tıkla Steam yeni sekmede açılıp geri dönülür:** Sayfa durumu bozulmamalı, koşu sürmeli. (Görev 4)
5. **Görsel dosyası yüklenemez:** Sütun rengi ve alt metin kalmalı, kırık görsel simgesi çıkmamalı. (Görev 2)

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `package.json` | ES modül türü, `npm test`, `npm run release-check` |
| `index.html` | Tüm içerik; JS olmadan tam |
| `css/site.css` | Token, ızgara, durumlar, telefon, alt bölümler |
| `assets/fonts/`, `assets/img/`, `assets/video/` | Kendi sunucumuzda dosyalar |
| `js/level/` simülasyon | `PlayerController`, `KinematicPhysicsHandler`, `NodeDetector`, `Physics2D`, `Mathf`, `PlayerStatsSO`, `BotInput`, `Level`, `Planner`, `planner-worker`, `States/*` |
| `js/level/titlePress.js` | Başlık ve klavye kuralları, saf fonksiyonlar |
| `js/level/InputHandler.js` | DOM olaylarını kurallara bağlar |
| `js/level/LevelBuilder.js`, `Page.js`, `View.js`, `main.js` | DOM katmanı |
| `tetris-reflex.html`, `tetris-reverse.html` | Yeniden adlandırılan sayfa ve yönlendirme |
| `tests/` | Node testleri, `tests/fixtures/*.json` seviye örnekleri |
| `tests/release/release.test.js` | Yayın kapısı, yalnızca `npm run release-check` çalıştırır |

---

### Task 1: Simülasyonu taşı ve test et

**Files:**
- Create: `package.json`, `js/level/*` (simülasyon dosyaları), `tests/simulation.test.js`, `tests/fixtures/level-1440x900.json`

**Interfaces:**
- Produces: `new Level(json)`, `new Planner(level, stats, collider, { deadlineMs, sliceMs })`, `planner.planFirstRun()`, `runToEnd(gen)`; sonuç `{ frames, ticks, impacts:[{word,tick,speed}], landedOn, seconds, spawn, miss }`. `COLLIDER = { x: 0.6, y: 0.78 }`, `js/level/PlayerStatsSO.js` içinden export edilir.

- [ ] **Step 1: Spec ve planı commit et**

```bash
git add docs/superpowers
git commit -m "docs: add portfolio level design and plan"
```

- [ ] **Step 2: `package.json` yaz**

`{ "private": true, "type": "module", "scripts": { "test": "node --test \"tests/*.test.js\"", "release-check": "node --test \"tests/release/*.test.js\"" } }`

- [ ] **Step 3: Dosyaları kopyala**

`.superpowers/spikes/level2/js/` içinden `Mathf, BotInput, Physics2D, Level, NodeDetector, KinematicPhysicsHandler, PlayerController, PlayerStatsSO, Planner, planner-worker` ve `States/` klasörünü `js/level/` altına kopyala. `COLLIDER` sabitini `PlayerStatsSO.js`'e taşı.

- [ ] **Step 4: Fixture üret**

`http://localhost:8803/` prototipi 1440x900'de açıkken `JSON.stringify(__spike.level.toJSON())` çıktısını `tests/fixtures/level-1440x900.json` olarak kaydet.

- [ ] **Step 5: Testi yaz**

`tests/simulation.test.js`:

```js
test('aynı kareler aynı sonucu verir', () => {
  const a = replay(fixture, plan.frames), b = replay(fixture, plan.frames);
  assert.deepEqual(a.position, b.position);
  assert.equal(a.ticks, plan.ticks);
});
test('rota üç oyunu da vurur ve iletişim zemininde biter', () => {
  assert.deepEqual(new Set(plan.impacts.map(i => i.word)), new Set(['oro','goka','kiss']));
  assert.equal(plan.landedOn, 'contact');
  assert.ok(plan.impacts[0].tick <= 125);
  assert.ok(plan.seconds <= 11.5);
});
```

`replay` yardımcı fonksiyonu test dosyasında: `Level`, `PlayerController`, `ScriptInput` ile `plan.spawn`'dan başlar, `AirborneState`'e geçer, kareleri oynatır. Rota için `deadlineMs: 10000, sliceMs: 1e9`.

- [ ] **Step 6: Çalıştır**

Run: `npm test`
Expected: 2 test PASS. Modül import hatası varsa düzelt; simülasyon kodunda davranış değiştirme.

- [ ] **Step 7: Commit**

```bash
git add package.json js/level tests
git commit -m "feat: port movement simulation with planner tests"
```

---

### Task 2: Statik sayfa ve dosyalar

**Files:**
- Create: `css/site.css`, `assets/fonts/*.woff2`, `assets/img/*`, `tests/html.test.js`
- Modify: `index.html` (tamamen değişir)

**Interfaces:**
- Produces, DOM sözleşmesi (sonraki görevler bu seçicileri kullanır): `#hero`, `h1.name > span.w`, `.intro > .role + .line`, `ul.games > li.game[data-word]` içinde `h2 > a.title`, `p.cap`, `.slot > img.ghost + img.panel[data-word]`; `.base > .source + .contact > a.cv + a.mail`; kök elemanda `class="js"` ve `data-day`. `img.ghost` HTML'de hazırdır, `Page` üretmez; böylece gri görseller JavaScript'i beklemeden ilk karede görünür.
- `data-word` değerleri `oro`, `goka`, `kiss`.

- [ ] **Step 1: Görselleri ve fontları indir**

Steam'den 600x338 ve 1920x1080 sürümlerini `assets/img/{oro,goka,kiss}-{600,1920}.jpg` olarak indir. Kaynak URL'ler spec prototipinin `index.html` dosyasında; `600x338` sürümü aynı adlandırmayla bulunur. Anton ve Archivo (500, 700) `latin` ve `latin-ext` woff2 dosyalarını Google Fonts CSS'inden `assets/fonts/` altına indir; `ö` harfi `latin` içinde olmalı, kontrol et. Alice görselini (spec Bölüm 12, URL sonuna `=w800`) `assets/img/alice.jpg` yap.

- [ ] **Step 2: Başarısız testi yaz**

`tests/html.test.js`, `index.html`'i metin olarak okur:

- Spec Bölüm 12 tablosundaki her ilk ekran metni birebir geçer.
- Global Constraints'teki yasak ifadeler geçmez.
- `<h1`, üç `<h2` var; her `img.panel` için anlamlı `alt`, `width`, `height`, `srcset`; her `img.ghost` için `alt=""` ve `aria-hidden="true"` var.
- Her `a.title` için `target="_blank"` ve `rel="noopener"`.
- `fonts.googleapis`, `steamstatic` geçmez.

Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: `index.html` yaz**

Prototip `index.html`'i temel al. Değişiklikler: görseller `.game` içine, başlıklar `h2` içine; Google Fonts yerine `<link rel="preload" as="font">` ile Anton; `srcset="assets/img/x-600.jpg 600w, assets/img/x-1920.jpg 1920w" sizes="(max-aspect-ratio: 1/1) 100vw, 34vw"`; `?c=` seçimi kalkar. Head içi satır içi betik yalnızca `js` sınıfını ve `data-day="0"` ekler, 5000 ms sonra `window.__booted` yoksa sınıfı kaldırır.

- [ ] **Step 4: `css/site.css` yaz**

Prototip `style.css`'ini temel al, Daybreak ve Dark kurallarını çıkar. Tek ızgara: `.intro`, `.games`, `.base` için `margin-inline: calc(-1 * var(--edge)); grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 0`; hücre metni `padding-left: var(--edge); padding-right: var(--gut)`. `.game { display: contents }`, başlık satır 1, açıklama satır 2, `.slot` satır 3 ve `minmax(0, 1fr)`. Yazı boyutları `clamp()` ile: alt sınırlar `rem`, üst sınırlar spec Bölüm 3 tablosu. `.hero`, `@media (max-height: 560px), (max-width: 760px)` altında `height: auto; overflow: visible`. `.ghost` kuralları `opacity: .9; filter: grayscale(1) brightness(1.25) contrast(1.05); mix-blend-mode: luminosity`. Slot arka planı `--col`; `li.game` bu değişkeni CSS'te `[data-word]` ile alır. `html.js .panel:not(.open) { visibility: hidden }`, `html:not(.js) .ghost { display: none }`; JS'siz görünümde panel görünür, ghost ve sütun yok.

- [ ] **Step 5: Testi geçir**

Run: `npm test`. Expected: PASS.

- [ ] **Step 6: Tarayıcıda JS'siz kontrol (Review Focus 5 dahil)**

Bu görevde sayfada henüz `main.js` yok. 1440x900 ve 375x812 aç. Önce ilk kareyi al: gri görseller ve renkler görünür. 5 sn bekle: satır içi güvenlik betiği `js` sınıfını kaldırır ve JS'siz görünüm gelir; ikinci ekran görüntüsünü al.

Kontrol: 1440x900'de `scrollWidth === innerWidth`, ad kenarlara oturuyor, tüm metin okunuyor. `javascript_tool` ile bir `.panel` ve `.ghost` `src`'sini bozunca slot rengi görünüyor ve düzen kaymıyor. Kırık görsel simgesi çıkıyorsa `img { color: transparent }` kuralını ekle.

- [ ] **Step 7: Commit**

```bash
git add index.html css assets tests/html.test.js
git commit -m "feat: add static triptych page with self-hosted assets"
```

---

### Task 3: DOM katmanı ve koşu

**Files:**
- Create: `js/level/LevelBuilder.js`, `js/level/Page.js`, `js/level/View.js`, `js/level/main.js`, `js/level/InputHandler.js`, `tests/fixtures/level-{1280x720,1366x768,1920x1080,1024x768,2560x1440}.json`
- Modify: `index.html` (module script), `tests/simulation.test.js`

**Interfaces:**
- Consumes: Görev 1 simülasyonu, Görev 2 DOM sözleşmesi.
- Produces: `Page.reveal(id, x, y)`, `Page.revealAll()`, `Page.setDay(n)`, `Page.remeasure()`, `View.fadeTrail()`, `View.syncColors()`, `main.js` içinde `relevel()`, `isPhoneLayout(): boolean`. `?debug=1` iken `window.__site = { ctx, level, plan, mode, wordsLeft, log, page, view, relevel, skipRun }`; aksi halde global yok.

- [ ] **Step 1: Dosyaları kopyala ve uyarla**

Prototipten `LevelBuilder, Page, View, main, InputHandler` dosyalarını kopyala. Kaldır: `?c=` dalları ve Triptych dışı kod, harflerin içine görsel doldurma (`layoutFills`, `flood` içeriği, `_endFlood`, `.title .l::after`), `__spike`, `?pause`. `.slot` artık `.game` içinde; `layoutCols` bu yapıya göre ölçer. Telefon için `isPhoneLayout = () => matchMedia('(max-aspect-ratio: 1/1)').matches`, `startPlan` ve `View` bunu kullanır.

- [ ] **Step 2: Kelime tekrarını kaldır**

`Page._addWord`: `.sr` kopyası yazılmaz. `a.title` için `aria-label=text`; `h1` için `aria-label="Eren Köselerli"`; harflerin sarmalayıcısı `aria-hidden="true"`. `document.querySelector('h1').textContent` boşluklar normalize edilince `Eren Köselerli` olmalı.

- [ ] **Step 3: Ana sayfada koşuyu doğrula**

`python -m http.server 8804` ile kökten sun, 1440x900'de `/?debug=1` aç.

Beklenen: `__site.mode` sonunda `done`, `wordsLeft` boş, zemin `contact`; ilk `impact` logu 3 sn içinde, `runEnd` 12 sn içinde; konsol hatası yok. Pencere öndeyken ölç: arka planda `requestAnimationFrame` durduğu için sonuç geçersiz olur (`document.visibilityState === 'visible'` kontrol et).

- [ ] **Step 4: Fixture'ları yenile**

1024x768, 1280x720, 1366x768, 1440x900, 1920x1080, 2560x1440 için `JSON.stringify(__site.level.toJSON())` kaydet.

- [ ] **Step 5: Testi tüm görünümlere genişlet**

`tests/simulation.test.js` Görev 1'deki iki testi her fixture için çalıştırır (`for (const size of SIZES) test(...)`).

Run: `npm test`
Expected: PASS. Bir görünümde rota yoksa CSS'te o görünümün başlık veya bant ölçülerini düzelt ve fixture'ı yenile; simülasyon sabitlerini değiştirme.

- [ ] **Step 6: Commit**

```bash
git add js/level tests index.html
git commit -m "feat: run the level on the new page"
```

---

### Task 4: Başlık ve klavye kuralları

**Files:**
- Create: `js/level/titlePress.js`, `tests/titlePress.test.js`
- Modify: `js/level/InputHandler.js`, `js/level/main.js`, `css/site.css`

**Interfaces:**
- Produces, `js/level/titlePress.js`:
  - `TITLE_HOLD_MS = 400`, `TITLE_MOVE_PX = 12`, `PLAY_IDLE_MS = 1500`, `RESUME_IDLE_MS = 3500`
  - `isPlaying({ humanMode: boolean, neutral: boolean, grounded: boolean, idleMs: number }): boolean`
  - `pressOutcome({ playing, heldMs, movedPx, touch, modifier }): 'steam' | 'swing' | 'scroll'`
  - `keyBelongsToGame({ key, engaged, heroVisible, onFocusedLink }): boolean`

- [ ] **Step 1: Başarısız testi yaz**

`tests/titlePress.test.js`, spec Bölüm 5 tablosunu birebir:

```js
const out = (o) => pressOutcome({ playing:false, heldMs:60, movedPx:0, touch:false, modifier:false, ...o });
assert.equal(out({}), 'steam');
assert.equal(out({ heldMs: 400 }), 'swing');
assert.equal(out({ movedPx: 13 }), 'swing');
assert.equal(out({ movedPx: 13, touch: true }), 'scroll');
assert.equal(out({ playing: true }), 'swing');
assert.equal(out({ playing: true, modifier: true }), 'steam');

assert.equal(isPlaying({ humanMode:false, neutral:true, grounded:true, idleMs:0 }), false);
assert.equal(isPlaying({ humanMode:true, neutral:false, grounded:true, idleMs:9999 }), true);
assert.equal(isPlaying({ humanMode:true, neutral:true, grounded:false, idleMs:9999 }), true);
assert.equal(isPlaying({ humanMode:true, neutral:true, grounded:true, idleMs:1499 }), true);
assert.equal(isPlaying({ humanMode:true, neutral:true, grounded:true, idleMs:1500 }), false);

const key = (o) => keyBelongsToGame({ key:'ArrowDown', engaged:false, heroVisible:true, onFocusedLink:false, ...o });
assert.equal(key({}), false);
assert.equal(key({ key:'j' }), true);
assert.equal(key({ engaged:true }), true);
assert.equal(key({ engaged:true, heroVisible:false }), false);
assert.equal(key({ engaged:true, key:' ', onFocusedLink:true }), false);
assert.equal(key({ engaged:true, key:'Enter' }), false);
```

Run: `npm test`. Expected: FAIL, modül yok.

- [ ] **Step 2: `titlePress.js` yaz ve testi geçir**

Run: `npm test`. Expected: PASS.

- [ ] **Step 3: `InputHandler`'ı bağla**

Prototipteki başlık mantığını bu fonksiyonlara çevir. Kurucu `{ onEngage, screenToWorld, isPlaying, isHeroVisible }` alır. `engaged` işaretçi veya `J`/`K` ile `true` olur, `keydown` yalnızca `keyBelongsToGame` doğruysa `preventDefault` çağırır; yoksa tarayıcı kaydırır. `e.isPrimary` olmayan işaretçiler yok sayılır. Dokunmada bekleme oynamıyorken 400 ms, oynarken 110 ms.

- [ ] **Step 4: Tekerlek ve imleç**

`main.js`: aynı hareket penceresi 220 ms; `e.ctrlKey` veya `!human.neutral` ise savurma yok. Her karede `documentElement.classList.toggle('playing', playing)`. CSS: `.hero { cursor: crosshair }`, `.title { cursor: pointer }`, `html.playing .title { cursor: crosshair }`, oynamıyorken hover'da alt çizgi.

- [ ] **Step 5: Gerçek fareyle tablo testi**

`computer` aracının gerçek tıklamalarıyla, `?debug=1`:

| Senaryo | Beklenen |
|---|---|
| Bot koşarken başlığa kısa tık | Steam yeni sekmede; sekmeyi kapatınca koşu sürüyor, `wordsLeft` bozulmamış (Review Focus 4) |
| Başlığa 500 ms basılı tutma | `mode === 'human'`, yeni sekme açılmadı; `handover` logundaki hız son bot hızıyla aynı |
| Sallanırken başlığa kısa tık | Yeni sekme açılmadı |
| 1.5 sn yerde durduktan sonra kısa tık | Steam |
| Oklar, oyun başlamadan | Sayfa kaydı, karakter hareket etmedi |
| `J` sonrası oklar | Karakter hareket etti, sayfa kaymadı |
| Sekmeyle başlığa gel, Enter | Steam |

Sentetik `dispatchEvent` bu adımda geçerli sayılmaz. Steam açan adımlarda açılan sekmeyi kapat, Steam'de hiçbir şeye tıklama.

- [ ] **Step 6: Commit**

```bash
git add js/level css tests/titlePress.test.js
git commit -m "feat: separate swinging from following title links"
```

---

### Task 5: Yaşam döngüsü ve geri düşmeler

**Files:**
- Modify: `js/level/main.js`, `js/level/Page.js`, `js/level/View.js`, `index.html`, `css/site.css`

**Interfaces:**
- Consumes: `isPlaying`, `RESUME_IDLE_MS`, `Page.revealAll`, `View.fadeTrail`.
- Produces: `skipRun(): void`, `Page.remeasure(): void`, `isHeroVisible(): boolean`.

- [ ] **Step 1: "Skip" düğmesi**

`.base` içine `<button class="skip" hidden>Skip</button>`. Görünür: `mode` `planning`, `bot` veya `replanning` iken ve telefon düzeni değilken. `skipRun()`: planı iptal eder, `frames = null`, `wordsLeft = []`, `mode = 'done'`, `revealAll()`, `fadeTrail()`, düğmeyi gizler. Karakter kaldığı yerden yere düşer.

Doğrula: koşu ortasında Skip; üç görsel açık, iz solmuş, konsol temiz, düğme gizli.

- [ ] **Step 2: Ekran dışında durma (Review Focus 1)**

`isHeroVisible()`: `IntersectionObserver` ile `#hero`. Görünmezken tick yapılmaz, `acc` sıfırlanır, kare döngüsü uyur; görünür olunca `wake()`. Kaydırma ve tekerlek savurması yalnızca `isHeroVisible()` iken.

Doğrula: koşu ortasında sayfa sonuna kaydır, `TickCount` 2 sn sabit; geri dön, koşu sürüyor ve üç vuruş tamamlanıyor. Kaydırma sırasında `perf` kare süresi medyanı 16.7 ms altı.

- [ ] **Step 3: Yön ve boyut değişimi (Review Focus 2)**

`relevel()`: telefon düzenine geçişte `revealAll()`, `wordsLeft = []`, plan iptal. Masaüstüne geçişte açılmış görseller açık kalır, `mode` `done` kalır. Karakter yeni seviyenin içine sınırlanır.

Doğrula: 1440x900 koşu ortasında 375x812'ye, sonra 1440x900'e geç. Tüm görseller görünür, karakter görünür alanda, hata yok. Sonra 1100x800 ile 1300x760 arasında boyut değiştir: rota yeniden kuruluyor.

- [ ] **Step 4: Geç font (Review Focus 3)**

`Page.remeasure()`: `_addWord`'ün yazdığı `marginLeft` düzeltmelerini siler, harf konumlarını yeniden ölçer. `document.fonts` `loadingdone` olayında ve açılış 1200 ms bekleyişi çoktan aşılmışsa `remeasure()` ve `relevel()`.

Doğrula: `?debug=1` iken konsoldan `__site.page.remeasure(); __site.relevel()` sonrası her harf için `letter.rest.left` ile `getBoundingClientRect().left` farkı 1 px altında.

- [ ] **Step 5: Hata ve kapanış davranışları**

- Worker `onerror`: `planPending = false`, `revealAll()`.
- Başarısız rota: `revealAll()`, karakter düşer, oynanabilir.
- `window.__booted = true` açılışın ilk satırında.
- Devir: 3.5 sn dokunulmazsa ve `wordsLeft` doluysa bot devam eder.
- Uyku: karakter yerde, sayfa durmuş, ziyaretçi nötr ve bu durum 3 sn sürdüyse kare döngüsü uyur; `pointermove` ve `keydown` uyandırır.
- `prefers-reduced-motion`: animasyon yok, son kare hazır; açık görseller, iz yok; sayfa renkleri `transition` kullanmaz.

Doğrula: `new Worker` çağrısını geçici olarak hatalı URL'ye çevirip görsellerin açıldığını gör, geri al. Azaltılmış hareketle yeniden yükle: son kare ilk karede. Uykuda 5 sn `perf.frames.length` sabit, fare hareketiyle artıyor. Koşu ortasında sekmeyi 5 sn arka plana al ve dön: `TickCount` sıçramıyor, koşu sürüyor.

- [ ] **Step 6: Commit**

```bash
git add index.html css js/level
git commit -m "feat: handle skip, offscreen, resize, late font and failure states"
```

---

### Task 6: Alt bölümler

**Files:**
- Create: `assets/video/slingshot-swing.mp4`, `assets/img/slingshot-poster.jpg`
- Modify: `index.html`, `css/site.css`, `tests/html.test.js`

**Interfaces:**
- Produces: `<section id="work">`, `<section id="experience">`. Alt sayfalar `index.html#work`'e döner (Görev 7).

- [ ] **Step 1: Başarısız testi ekle**

`tests/html.test.js`: spec Bölüm 12'deki Slingshot, Alice ve Tetris Reflex metinleri birebir; Alice için iki mağaza linki; spec Bölüm 6 deneyim listesinin beş satırı; `linkedin.com/in/eren-k%C3%B6selerli`; `GPA` ve `%` ilerleme çubuğu yok; `<video` üzerinde `preload="none"`, `controls`, `poster`.

Run: `npm test`. Expected: FAIL.

- [ ] **Step 2: Dosyaları kopyala**

`.superpowers/brainstorm/1463-1793803513/content/slingshot-swing.mp4` → `assets/video/`. `.superpowers/spikes/timesolid/solid-still.png` → en fazla 1600 px genişlikte `assets/img/slingshot-poster.jpg` (Pillow ile). Ortam ffmpeg içermediği için video kırpılmaz; `preload="none"` olduğundan ilk yükü etkilemez.

- [ ] **Step 3: Bölümleri yaz**

Sıra: Slingshot (kendi rengiyle, video, metin, GitHub linki), diğer işler (Alice görselli; Tetris Reflex, Dungeon, Dance Battle, Shh Do Not Wake The Baby, CRT filter başlık, tek cümle, link), deneyim, iletişim. Dungeon, Dance Battle, Shh ve CRT için mevcut `index.html`'deki `proj*_desc` İngilizce metinleri ve linkleri kullanılır; `reveal`, `.EXE` ve süs etiketleri alınmaz.

Düzen: ilk ekranla aynı üç sütun. Başlıklar Anton `5.4 * --w`. Yuvarlak köşe, kart gölgesi, kayarak beliren içerik yok. Slingshot rengi görüntüden seçilir, `--fg` ile en az 4.5:1 sağlar, kod içinde kontrast oranı yorum olarak yazılır. Sahip Görev 8'de onaylar.

- [ ] **Step 4: Testi geçir**

Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Tarayıcıda kontrol**

1440x900 ve 375x812: taşma yok, video ancak oynat'a basınca iner (`read_network_requests` ile mp4 isteği yok), ilk ekran koşusu etkilenmiyor.

- [ ] **Step 6: Commit**

```bash
git add index.html css assets tests/html.test.js
git commit -m "feat: add work and experience sections"
```

---

### Task 7: Alt sayfalar ve paylaşım bilgisi

**Files:**
- Create: `tetris-reflex.html`, `assets/img/og.jpg`
- Modify: `tetris-reverse.html`, `slingshot.html`, `index.html`, `tests/html.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/html.test.js`: `tetris-reverse.html` `tetris-reflex.html`'e `meta refresh` ve `rel="canonical"` içerir, gerçek link taşır; `tetris-reflex.html` içinde `Tetris Reverse` yok; iki alt sayfada `#active-projects` yok, `index.html#work` var; `index.html` içinde `og:title`, `og:description`, `og:image`, `twitter:card`, `canonical` var; `og:image` yolu var olan bir dosyayı gösterir.

Run: `npm test`. Expected: FAIL.

- [ ] **Step 2: Sayfaları düzenle**

`git mv tetris-reverse.html tetris-reflex.html`, `Tetris Reverse` metinlerini `Tetris Reflex` yap, yeni `tetris-reverse.html` yönlendirme sayfası yaz. Alt sayfaların dönüş linklerini `index.html#work` yap. Stil değişmez.

- [ ] **Step 3: Paylaşım görseli ve etiketler**

1200x630 görünümde koşu bitmiş sayfanın ekran görüntüsünü Pillow ile `assets/img/og.jpg` yap (85 kalite). Etiketlerde `https://astrobotiq.github.io/Portfolio/` kök URL'si, açıklama metni spec Bölüm 12 tanıtımının kısa hali: mevcut `meta description`.

- [ ] **Step 4: Testi geçir ve sayfaları aç**

Run: `npm test`. Expected: PASS. `tetris-reverse.html` Tetris Reflex'e yönleniyor, Tetris oyunu ve Slingshot sayfası konsol hatasız çalışıyor.

- [ ] **Step 5: Commit**

```bash
git add -A tetris-reflex.html tetris-reverse.html slingshot.html index.html assets tests
git commit -m "feat: rename Tetris Reflex and add sharing metadata"
```

---

### Task 8: Son doğrulama ve yayın kapısı

**Files:**
- Create: `tests/release/release.test.js`

- [ ] **Step 1: Yayın kapısı testini yaz**

Şunları doğrular: `assets/Eren-Koselerli-CV.pdf` var ve `.cv` onu `download` ile gösterir; `docs/superpowers` klasörü yok; `index.html`'de QA satırı şirket adı içerir. Bu dalda FAIL vermesi beklenir ve normaldir; `npm test` bunu çalıştırmaz.

- [ ] **Step 2: Görünüm matrisini çalıştır**

Pencere öndeyken 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080, 2560x1440: üç vuruş, ilk vuruş 3 sn içinde, bitiş 12 sn içinde, `scrollWidth === innerWidth`, kare süresi medyanı 16.7 ms altı. Ekran görüntülerini `.superpowers/qa/` altına kaydet.

- [ ] **Step 3: Erişilebilirlik kontrolü**

JS kapalı; azaltılmış hareket; %200 yakınlaştırma (640x400 vekil görünüm: hiçbir şey kesilmiyor, sayfa kayıyor); yalnızca klavyeyle tüm linkler ve Skip; `h1` ve `h2` adları `read_page` çıktısında tam kelime; `.cv` ve `.mail` yüksekliği en az 44 px; kontrastları ölç: üç sütun rengi `--fg` ile sırasıyla en az 6.0, 7.6, 12.0.

- [ ] **Step 4: Bağımsız tarama**

`superpowers:requesting-code-review` ile tüm dal; ek olarak `web-design-guidelines` ve `design-skills:design-critique` ile son sayfa. Bulguları düzelt ya da gerekçesiyle reddet, `npm test` PASS.

- [ ] **Step 5: Sahibine sun ve dur**

Şu listeyi ver, cevapları olmadan birleştirme yapma:

- Canlı hissi ve gerçek fareyle başlık tablosunu dene.
- Gerçek telefonda dene (en az bir Android).
- Slingshot bölümünün rengini onayla.
- Güncel CV PDF'ini ver (QA işi eklenmiş).
- QA şirket adını ver.
- Alice'in tarihlerini netleştir (CV'lerde çelişiyor).
- `docs/superpowers/` kaldırılsın mı, kararını ver.
- `main`'e birleştirme ve yayını iste.

Slingshot deposundaki kod düzenlemelerinin, ilk ekrandaki "Read the C# on GitHub" linki yayına çıkmadan yapılmasını da hatırlat.
