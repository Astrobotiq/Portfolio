# Portfolyo yeniden tasarımı: Sayfa bölüm oluyor

Tarih: 2026-11-05
Dal: `redesign/level-portfolio`
Çalışan prototip: `.superpowers/spikes/level2/` (git dışında, atılacak kod; port edilecek kaynak olarak kullanılır)

## 1. Amaç

Eren Köselerli'nin Unity geliştirici portfolyosu (`https://astrobotiq.github.io/Portfolio/`) "AI slop" hissi veriyor ve karakteri yok. Yeni site:

- Recruiter'a 10 saniyeden kısa sürede kim olduğunu, ne yaptığını ve işlerini göstermeli.
- "WOW" dedirtmeli, ama bunu bilgiyi geciktirerek yapmamalı.
- Gameplay lead'e Unity becerisinin somut kanıtını vermeli.

### Başarı ölçütleri

1. İlk karede ad, rol, üç oyunun adı ve görseli, CV ve e-posta görünür. Hiçbiri animasyonu beklemez.
2. Karakter yüklemeden sonra 3 saniye içinde ilk oyuna çarpar, koşu 12 saniye içinde biter.
3. Steam'e gitmek isteyen ilk tıkta gider; oynayan yanlışlıkla Steam'e gitmez.
4. JavaScript çalışmasa da tüm içerik okunur ve bütün linkler çalışır.

### Bu spec'te neyin kaynağı ne

- **Sahibinin onayladıkları:** Konsept, ilk ekran düzeni (Bölüm 3), gece yönü, renkler ve fontlar (Bölüm 4). Gece yönü, aynı gün sahibinin "çok sade, heryer beyaz" geri bildirimiyle ilk açık zeminli Triptych'in yerini aldı.
- **Spec'te önerilenler, inceleme bekliyor:** Tıklama kuralları prototipte test edildi ama sahibi gerçek fareyle onaylamadı (Bölüm 5). Alt bölümler (Bölüm 6) ve teknik yapı (Bölüm 7) ilk kez burada öneriliyor.

## 2. Konsept

Sayfanın kendi yazısı bir oyun bölümüdür. Slingshot'ın hareket kodunun web portu üzerinde çalışan karakter, oyun başlıklarının harflerine ip atıp sallanır. Her çarpma o oyunun rengini ve görselini açar. Ziyaretçi istediği an kontrolü devralabilir ve karakter hızını kaybetmez.

Koşu önceden kaydedilmiş bir animasyon değildir. Kod, gerçek simülasyonu ileri doğru çalıştırarak o ekran boyutuna uyan rotayı hesaplar ve aynı girdi arayüzünden oynatır.

**Sıra:** Önce sayfa düzeni kurulur, fizik ona uyar. Fizik gereği düzen değiştirilmez.

## 3. İlk ekran düzeni

### Masaüstü

Tek ekran, kaydırma olmadan görünür. Üç eşit sütunlu tek ızgara.

```
+--------------------------------------------------+
| Eren Köselerli                 (tam genişlik)    |
| Unity developer     | Kısa tanıtım (sütun 2-3)   |
| OROBOROS      | GOKA Street     | Kiss Cargo     |
| açıklama      | açıklama        | açıklama       |
|##################################################|
|# görsel       # görsel          # görsel        #|  kenardan kenara bant
|##################################################|  altı = karakterin zemini
| Oynama daveti + kod linki       | CV     e-posta |
+--------------------------------------------------+
```

| Öğe | Değer (`--w`: genişliğin %1'i, en fazla `1.9vh`) |
|---|---|
| Ad | Gasoek One, `12.6 * --cw`, kenarlara tam oturur |
| Rol | Newsreader 500, `3.9 * --w`, mercan |
| Oyun başlığı | Gasoek One, `4.25 * --w` |
| Gövde metni | Newsreader 500, en az 17px |
| Sayfa kenarı | `1.75 * --w` |
| Görsel bandı | Ara boşluksuz, sayfa kenarını aşar, kalan yüksekliği doldurur, en fazla `24.6 * --cw`. Kare pencerede artan yükseklik başlıkların üstüne gider, çünkü daha uzun bant süresinde geçilemiyor |

Kurallar:

- Bandın altı karakterin zeminidir ve mercan bir şeritle işaretlenir: alt satır gökyüzünden koyu bir zemindir.
- Sağdaki sütunun zemini koşunun bitiş noktasıdır. Karakter CV düğmesinin üstünde durur.
- Spacing tek ölçekten gelir: `--s1 0.6u`, `--s2 1.2u`, `--s3 2u`.

### Telefon (en-boy oranı 1:1 veya daha dar)

Sayfa kaydırılır. Sıra: ad, rol, tanıtım, sonra her oyun için başlık, açıklama ve 2:1 görsel; en altta iletişim.

Başlıklar alt alta geldiği için karakter onlara alttan ulaşamaz. Bu yüzden telefonda **koşu yoktur**: iz çizilmez, karakter düşüp zeminde durur ve oynanabilir. Her oyun, en az yarısı görünene kadar tonunda kalır; sonra sütunu dolar ve görseli `Page.reveal` ile açılır. Azaltılmış harekette her şey baştan açıktır, JavaScript yoksa görseller tam renklidir.

## 4. Görsel dil: Slingshot'ın gecesi

Bütün palet Slingshot'ın kendi ekranından gelir: boşluk, şerit, çubuklar, ipler. Üç oyunun renkleri sütunlarda kalır, ama artık kağıda değil geceye dökülür.

| Token | Değer | Kullanım |
|---|---|---|
| `--surface`, `--ink` | `#1a1826` | Gökyüzü; renkli blokların üstündeki yazı |
| `--fg` | `#f6ede4` | Ad, gece üstündeki yazı, ip |
| `--ground` | `#100e19` | Alt satır ve Slingshot bölümü |
| `--dusk` | `#24203a` | Diğer işler zemini |
| `--coral` | `#ff6b6f` | Şerit: rol, karakter, CV düğmesi, kapanış bandı (`--ink` ile 6.31:1) |
| `--teal` | `#01babd` | Çubuklar: ipin kancası, deneyim listesindeki işler |
| OROBOROS | `#8f7bff` | Sütun rengi |
| GOKA Street | `#ff6fae` | Sütun rengi |
| Kiss Cargo | `#f5c518` | Sütun rengi |

Fontlar: başlıklarda Gasoek One, geri kalan her şeyde Newsreader 500 ve 600. İkisi de OFL, kendi sunucumuzdan.

Kontrast değerleri `tests/html.test.js` içinde ölçülür.

**Şafak:** Her vuruş gökyüzünü bir adım aydınlatır (`data-day` 1, 2, 3; `.hero::after`, 1.4 sn). Sayfanın tek kendiliğinden hareketi koşunun kendisidir, ayrı bir giriş animasyonu yoktur.

**Yıldızlar ve iplik:** `assets/img/sky.svg` gökyüzü dokusudur. `assets/img/strings.svg` afişteki şerit ve ipleri Slingshot bölümünün arkasına çizer; dar düzende kalkar, orada afişin kendisi gösterir.

### Durumlar

1. **Vuruştan önce:** Görseller baştan görünür. Gri tona çevrilip `mix-blend-mode: luminosity` ile oyunun renginin geceyle karışımına boyanır. Boş çerçeve yoktur. Başlık ve açıklama geceye göre açık renktedir.
2. **Vuruş anı:** Çarpma noktasından yayılan daire iki şeyi birlikte açar: başlıktan görselin altına kadar sütun rengi ve görselin gerçek renkleri. Süre 620 ms, `cubic-bezier(.16,1,.3,1)`. Daire geçerken başlık ve açıklama koyu renge döner.
3. **Son kare:** Üç renkli sütun, üç tam renkli görsel, aydınlanmış gökyüzü. İz silinmiştir (1.2 sn solma), karakter CV'nin üstünde durur.

### Karakter

- Slingshot'ın karakteri: taç, baş, pelerin, hareket eden gözler.
- Çarpışma kutusu `0.6 x 0.78` birim; çizim ayaklar sabit kalarak 3 kat büyük. Telefonda 1.6 kat.
- Dolgu `--coral`, kenar `--surface`, gözler `--fg`; böylece gecede, açık renkli yazıda ve görselde okunur. İp `--fg`, kenarı `--surface`.
- Hız kaynaklı esneme ve iniş sıkışması kullanılır.

### İz

- Yalnızca görsel bandının üzerinde çizilir, yazıların üstünden geçmez.
- Afişin resmi canlı çizilir: mercan şerit ve ondan turkuaz kancaya uzanan ipler. Dururken çizim yapılmaz.
- Renkli görselin altında kalır, yani her vuruş kendi izini siler.

### Kaçınılacaklar

Harflerin içine görsel doldurma, piksel nostaljisi, terminal taklidi, parçacıklı hero, oyunlaştırılmış CV, yuvarlak köşeli kart, her bölümde yukarı kayarak beliren içerik, her başlığın üstüne küçük etiket.

## 5. Etkileşim

### Kontrol

- Basılı tutma: imlece doğru ip atar, salınır. Bırakınca o hızla uçar.
- Kısa tık (başlık dışında): sapan fırlatması.
- Klavye: oklar veya WASD hareket, boşluk zıplama, `J` ip, `K` ikinci tetik.
- Dokunma: basılı tutma ip atar, bırakınca uçar. Kaydırma hareketi kaydırma olarak kalır.

### Başlığa basmanın anlamı

"Oynuyor" demek: tuş veya işaretçi basılı, ya da karakter havada, ya da yere ineli 1.5 saniye olmadı.

| Durum | Hareket | Sonuç |
|---|---|---|
| Oynamıyor | 400 ms'den kısa, 12 px'den az hareketli basış | Steam, yeni sekmede |
| Oynamıyor | 400 ms'den uzun basış veya fareyle sürükleme | Sallanma, tık yutulur |
| Oynamıyor (dokunma) | Parmak kayarsa | Sayfa kayar |
| Oynuyor | Her basış | Yalnızca oyun, tık yutulur |
| Her durum | Ctrl, Cmd, Shift ile tık; orta tuş; klavyeyle Enter | Steam |

Diğer linkler (CV, e-posta, GitHub) her zaman linktir ve oyun girdisi sayılmaz.

### Durumun gösterilmesi

- İmleç: sayfada artı işareti (sallanma), başlıkta el (Steam), oynarken başlıkta da artı.
- Oynamıyorken üstüne gelince başlığın altı çizilir.
- Klavye odağı her durumda görünür halkadır.
- Başlığın `href` değeri, sekme sırası ve erişilebilir adı hiç değişmez.

### Devir

- Ziyaretçi kontrolü alınca aynı controller devam eder, hız korunur.
- 3.5 saniye dokunulmazsa ve açılmamış oyun varsa bot kaldığı yerden devam eder.
- Koşu sürerken alt satırda "Skip" düğmesi görünür; basınca her şey açılır ve iz silinir.

### Klavye ve tekerlek kuralları

- Oyun başlamadan oklar ve boşluk sayfayı kaydırır. `J` veya `K` ya da işaretçiyle oyun başladıktan sonra ve sayfanın en üstü görünürken tuşlar oyuna geçer.
- Odak bir linkteyken klavyeyle gelindiyse boşluk tuşuna oyun dokunmaz.
- Tekerlek karakteri her hareket için bir kez savurur; 220 ms'den kısa aralıklı olaylar aynı hareket sayılır. İp tutulurken ve Ctrl ile yakınlaştırırken savurmaz.
- İkincil parmak yok sayılır; böylece iki parmakla yakınlaştırma çalışır.

## 6. Alt bölümler (öneri)

İlk ekranın altına, aynı ızgara ve aynı renklerle:

1. **Slingshot:** Kişisel oyun; site karakterinin de kaynağı. Bölüm, afişin kompozisyonudur: şerit ve ipler ekranın arkasından çıkar. Oynanış videosu `muted loop playsinline`, denetimsizdir: en az yarısı görününce başlar, görünmezken durur, basınca durur veya başlar, klavyeyle düğme olarak ulaşılır. Görünene kadar mp4 indirilmez. Azaltılmış hareket, `saveData` ve telefonda kendiliğinden başlamaz: poster görünür, basınca oynar. Kısa teknik açıklama, GitHub linki.
2. **Diğer işler:** Alice in Blastland, kendi lila sütununda; Tetris Reflex, mevcut sitedeki Dungeon, Dance Battle, Shh Do Not Wake The Baby ve CRT filter. Her biri başlık, tek cümle ve link. Metinler Bölüm 12'de.
3. **Deneyim:** Tarihli iş listesi, eğitim (not ortalaması olmadan), beceriler düz liste halinde (yüzde çubuğu olmadan). Masaüstünde rol, şirket ve tarih sayfa ızgarasının üç sütunundadır, telefonda alt alta. Liste gerçek bir sıradır, bu yüzden bir ipe asılıdır: her iş için bir turkuaz çubuk.
4. **Kapanış bandı:** Sayfa tam genişlikte `--coral` bir bantla biter: sayfa genişliğinde Gasoek One ile e-posta linki, LinkedIn, GitHub ve Download CV. Telefonda e-posta taşmadan genişliğe sığar.

Deneyim listesi:

- QA, Ankara, August-October 2026 (şirket adı Bölüm 12'de bekliyor)
- Game Developer, Blay Games, July 2025-March 2026
- Game Developer Intern, Blay Games, October 2024-March 2025
- Software Test and QA Intern, Testinium, July-August 2024
- BSc Software Engineering, Izmir University of Economics, 2020-2025

İş arası için açıklama cümlesi yazılmaz. Tarihler listede dürüstçe görünür, ilk ekran "available now" der.

Lead'in istediği kanıtlar (oynanabilir sürüm, Profiler öncesi/sonrası, kod örneği, hata analizi) malzeme hazır olduğunda Slingshot bölümüne eklenir. Malzeme olmadan yer tutucu bırakılmaz.

### Mevcut siteden kalkanlar

İngilizce dışındaki dil, açık/koyu tema anahtarı, `.EXE` etiketleri, not ortalaması, ilerleme çubukları, İzmir konumu, ana sayfadaki mini Tetris.

### Alt sayfalar

- `slingshot.html` ve `tetris-reverse.html` çalışmaya devam eder, `js/ui/*` ve `js/tetris/*` bu yüzden silinmez. Yeniden stili bu işin kapsamında değildir.
- Proje adı Tetris Reflex olur: `tetris-reflex.html` eklenir, `tetris-reverse.html` ona yönlendirir.

## 7. Teknik yapı

Statik site, GitHub Pages, `main` dalının kökünden. Build adımı ve bağımlılık yok. ES modülleri.

```
index.html              içerik, JS olmadan da tam
css/site.css            token, düzen, durumlar
assets/                 kendi sunucumuzda fontlar, görseller, CV
js/level/main.js        açılış, durum, kare döngüsü
js/level/Page.js        DOM: harfleri ayırma, tepkiler, sütun ve görsel açma
js/level/LevelBuilder.js DOM'dan seviye geometrisi
js/level/Level.js       seviye verisi, DOM yok
js/level/View.js        karakter ve iz çizimi, yalnızca okur
js/level/InputHandler.js insan girdisi ve başlık kuralları
js/level/BotInput.js    bot girdisi, aynı arayüz
js/level/Planner.js     ileri simülasyonla rota, DOM yok
js/level/planner-worker.js rota hesabı ana thread dışında
js/level/PlayerController.js, KinematicPhysicsHandler.js, NodeDetector.js,
         Physics2D.js, Mathf.js, PlayerStatsSO.js, States/*   Slingshot portu
```

### Sınırlar

- **Simülasyon** (`PlayerController` ve altı, `Level`, `Planner`) DOM bilmez, Node'da çalışır.
- **`LevelBuilder`** pikselin bittiği yerdir; sonrası dünya birimidir.
- **`View`** simülasyonu okur, geri yazmaz.
- **Girdi**: `InputHandler` ve `ScriptInput` aynı alanları sunar; devir tek atamadır.

### Veri akışı

Sabit 50 Hz tick. Simülasyon olay üretir (`contact`, `impact`, `launch`); `main` bunları `Page` ve `View` tepkilerine çevirir. Sayfa tepkilerinin tamamı gerçek olaylardan gelir, zamanlı animasyon yoktur.

### Slingshot'tan bilinen farklar

Portun site için değişen değerleri `PlayerStatsSO.js` içindeki `WebRetune` ile belgelenir: algılama yarıçapı 30, çarpışma kutusu 0.6 x 0.78, salınım çarpışma yarıçapları 0.3, başlık çarpmasında 0.2 sn donma. Duvar, dash, kenar tutunma, hareketli yüzey ve döner düğüm taşınmaz. Sitedeki metin "port" der, "oyunun birebir kodu" demez.

## 8. Hata ve geri düşme durumları

| Durum | Davranış |
|---|---|
| JavaScript kapalı | Tam renkli görseller ve sütunsuz sayfa; tüm içerik ve linkler çalışır |
| Betik 5 sn içinde başlamaz | Aynı görünüme döner |
| Worker hata verir veya rota bulunamaz | Her şey açılır, karakter düşer ve oynanabilir kalır |
| Font gelmez | Yedek fontla seviye yine kurulur |
| Görsel yüklenmez | Sütun rengi ve alt metin görünür |
| Pencere boyutu değişir | Seviye yeniden kurulur, koşu yeni düzende sürer |
| `prefers-reduced-motion` | Hareket yok, son kare hazır gelir |
| Sekme arka planda | Kare döngüsü durur, dönüşte zaman sıçramaz |
| Her şey durulunca | Kare döngüsü uyur, işaretçi hareketiyle uyanır |

## 9. Erişilebilirlik ve performans

- Yazı boyutları `rem` tabanlı `clamp()` ile. %200 yakınlaştırmada hiçbir şey kesilmez; küçük pencerede `height: auto` ve yığılmış düzen.
- Koşu "Skip" ile durdurulabilir (WCAG 2.2.2).
- CV ve e-posta hedefleri en az 44px yükseklikte.
- Ekran okuyucu tam kelimeyi okur, harf `span`'leri gizlidir. Başlıklar `h2`, görseller kendi oyununun içinde ve anlamlı `alt` metniyle. Sayfa metni taramalarda kelime tekrarı üretmez.
- Görsellere `srcset`, `width` ve `height`. Telefonda 600 x 338 sürümü. Fontlar kendi sunucumuzda, `font-display: swap`.
- Sayfa düzeni açılırken kaymaz: harf bölme ilk boyamayı oynatmaz.
- Meta ve Open Graph etiketleri eklenir.
- Metin seçimi yalnızca iletişim satırında açıktır, çünkü sayfanın geri kalanında basmak oyundur. Bilinen takas.

## 10. Test

**Otomatik (`node --test`, bağımlılıksız):**

- Simülasyon aynı girdiyle aynı sonucu verir.
- Planlayıcı, sabit seviye örnekleri üzerinde üç oyunu da vurur ve iletişim zemininde biter.

**Tarayıcıda, her biri için:**

- Görünüm: 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080, 2560x1440. Rota var, üç vuruş, 12 sn içinde bitiş, ilk vuruş 3 sn içinde, taşma yok.
- Başlık tablosunun (Bölüm 5) her satırı **gerçek fare** ve **gerçek dokunma** ile. Sentetik olay yeterli sayılmaz.
- Devir hızı koruyor, 3.5 sn sonra bot devam ediyor, "Skip" çalışıyor.
- JavaScript kapalı, azaltılmış hareket, %200 yakınlaştırma, klavyeyle tam gezinme.
- Kontrast değerleri ölçülür.
- **Gerçek telefon:** en az bir Android ve mümkünse bir iPhone.
- Kare süresi: tümleşik grafikte medyan 16.7 ms altı.

**İnsan değerlendirmesi:** Hareket ve his yalnızca canlı izlenerek değerlendirilebilir. Yayından önce sahibi ve mümkünse bir recruiter ile bir gameplay lead dener.

## 11. Yayın

- Çalışma `redesign/level-portfolio` dalında yürür. Yayın `main`'e birleştirmeyle olur ve bu ancak sahibi isteyince yapılır.
- GitHub Pages `main`'deki her dosyayı herkese açık sunar. `docs/superpowers/` `main`'e girmeden önce çıkarılır veya sahibi açık kalmasını seçer.
- `.superpowers/` git dışında kalır.

## 12. Sahibinden gerekenler

Bu maddeler gelmeden yayın yapılmaz; varsayılan davranış yanlarında yazılı.

| Madde | Yanıt gelene kadar |
|---|---|
| Güncel CV PDF'i (QA işi eklenmiş) | "Download CV" yayına çıkmaz |
| Aşağıdaki metinlerin onayı | Prototipteki metinler kullanılır, yayın öncesi onay şart |
| QA işinin şirket adı | Listede "QA, Ankara" yazar |

Renkler onaylandı (Bölüm 4). Türkiye'de çalışma izni var; sitede "Based in Ankara, available now and open to relocating" yazar, vize sponsorluğundan söz edilmez.

### Site metinleri

Kaynak: `Eren-Köselerli-CV.pdf`, eski site ve mağaza sayfaları. Sitede yalnızca sahibinin savunabileceği rakamlar kullanılır: 100 ms altı senkron, 2 kat hızlı düşman üretimi, 10+ controller. Mağazadan doğrulanan 100K+ indirme oyunundur, kişisel başarı gibi yazılmaz.

| Yer | Metin |
|---|---|
| Rol | Unity developer |
| Tanıtım | I build and ship games in Unity and C#: gameplay, multiplayer and performance. Two on Steam, a third coming soon, and a mobile match-3 with 100K+ downloads. Based in Ankara, available now and open to relocating. |
| OROBOROS | I ported it to Steam alone and removed GC spikes from 10+ core controllers. |
| GOKA Street | On the programming team, I worked on core mechanics and the Steam release. |
| Kiss Cargo | Coming soon. I built multiplayer sync under 100 ms and halved new-enemy build time. |
| Oynama daveti | Try it: hold to swing, let go to fly. |
| Kaynak notu | This is the movement code from Slingshot, my Unity platformer, ported to the web. |
| Kod linki | Read the C# on GitHub |
| Alice in Blastland | A mobile match-3 with 100K+ downloads. I fixed live bugs across updates and added anti-cheat. |
| Tetris Reflex | My own 2D engine in C++17 and SFML, built from scratch with ECS, and a tactical Tetris running on it at a locked 60 FPS. |
| Slingshot | A precision platformer built around a grappling hook, with my own kinematic physics solver and a state-machine player controller in Unity and C#. |
| Dungeon | A Viking tactics game inspired by Into The Breach, with a Utility AI I built to pick attack positions and avoid hazards. |
| Dance Battle | A turn-based disco card game, with a card effect system I built on ScriptableObjects. |
| CRT filter | A CRT shader I made for Slingshot and published as an open-source Unity package. |
| Shh Do Not Wake The Baby | A tower defense where you beat enemies without waking the baby, with grid obstacle placement and a runtime NavMesh. |

Kullanılmayanlar: "15+ months of live-ops" (ana CV'de yok, staj tarihleriyle çelişiyor), "0%" hile raporu, "100% deterministic", proje özetlerindeki doldurulmamış veya örnek yüzdeler.

### Alice in Blastland kaynakları

- Google Play: `https://play.google.com/store/apps/details?id=com.blay.wonder` (100K+ indirme, 2026-11-05'te görüldü)
- App Store: `https://apps.apple.com/us/app/alice-in-blastland/id1631371168`
- Görsel: Play Store oynanış ekranı, `https://play-lh.googleusercontent.com/6AX3q0xxhW-QyzI4-FLBm6E_spiManwAJ5KxRbOztUwiUJ2jpCJwi-iWNgAj54xuuaDLv7DQ1K_rfAQOWG5FBA`. Yayında `assets/` altına kopyalanır.

## 13. Kapsam dışı

- Slingshot deposundaki kod düzenlemeleri (ayrı iş, ayrı oturum).
- Alt sayfaların yeniden stili.
- Türkçe sürüm.
- Telefonda koşu.
- İstatistik veya analitik aracı.
