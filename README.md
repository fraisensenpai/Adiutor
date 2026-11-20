# Adiutor

Yapay zekâ ajanlarıyla kod yazmaya odaklanan, tamamen **yerel** çalışan bir masaüstü kod
editörü. Kullanıcı bir görev verir; planlayıcı, kodlayıcı ve inceleyici ajanlar sırayla
çalışır. Kodlayıcı ajanın önerdiği değişiklikler **doğrudan dosyaya yazılmaz**: diff
görünümünde gösterilir, kullanıcı kabul ederse yazılır, geri alınabilir.

## Hızlı başlangıç

Gereksinimler: **Node.js 22.18+** ve npm (Windows, macOS veya Linux). Örnek projenin test
betiği TypeScript dosyasını doğrudan çalıştırdığı için Node'un tip ayıklama desteği gerekir
(22.18+ / 24).

```bash
npm install
npm run dev        # Vite + Electron geliştirme modu (sıcak yenileme)
```

Üretim derlemesini çalıştırmak için:

```bash
npm run build      # arayüz (Vite) + ana süreç (esbuild)
npm start          # derler ve Electron'u açar
```

Doğrulama komutları:

```bash
npm run typecheck  # arayüz + ana süreç tip kontrolü
npm run smoke      # uygulamayı açar, renderer hatalarını kontrol eder, ekran görüntüsü alır
npm run smoke -- --basic
```

`npm run smoke` uygulamayı **ayrı bir test profilinde** (`.smoke/profile`) ve görünmez pencerede
çalıştırır; gerçek sohbet/kullanım verisine dokunmaz. Örnek projeyi indeksler, görev grafiğini baştan sona sürer
(onay → diff → kabul) ve ekran görüntülerini `.smoke/` klasörüne yazar (uygulama içi
`capturePage`). `--basic` yalnızca açılışı kontrol eder.

> Not: npm bu makinede kurulum betiklerini engelliyorsa Electron ikilisi inmemiş olabilir.
> Bu durumda bir kez `node node_modules/electron/install.js` çalıştırın.

## İlk deneme (demo modu)

1. Uygulamayı açın.
2. Üst çubuktan **Örnek projeyi aç** (veya Dosya → Örnek projeyi aç).
3. Sağdaki sohbet panelinde bir görev yazın, örn. `Görev başlığını kısalt ve yardımcı fonksiyon ekle`.
4. **Görevi başlat** düğmesine basın.
5. Görev Grafiği'nde planlayıcının ürettiği kodlama görevini **onaylayın**.
6. Kodlayıcı diff'i üretir; **Değişiklikleri incele** ile dosya dosya kabul edin, reddedin veya geri alın.
7. İnceleyici test komutu önerirse **Çalıştırmayı onayla** diyerek terminalde çalıştırın.

Demo modunda hiçbir ağ bağlantısı kurulmaz ve hiçbir model çağrılmaz. Üretilen plan, diff
ve inceleme metinleri kurallı olarak hazırlanır; arayüzde her yanıt **demo** etiketiyle
ayrılır. Token değerleri karakter uzunluğundan **tahmin edilir** ve Kullanım görünümünde
"tahmini" olarak sayılır.

## Gerçek sağlayıcı (OpenAI)

1. **Ayarlar → Sağlayıcı → OpenAI**'yi seçin.
2. API anahtarını girin ve **Kaydet**'e basın.
3. Model kimliğini seçin veya yazın (varsayılan: `gpt-4.1-mini`).

Anahtar `safeStorage` ile işletim sisteminin güvenli kasasında (Windows DPAPI / macOS
Keychain / Linux secret service) şifrelenir. Diske yalnızca şifreli blob yazılır. Anahtar
arayüze geri okunmaz; sohbete, günlüklere veya hata mesajlarına yazılmaz. Güvenli kasa
kullanılamıyorsa anahtar **kaydedilmez** (düz metin yazma yolu yoktur).

Yeni sağlayıcı eklemek için `electron/services/providers/` altında `ProviderAdapter`
arayüzünü uygulayıp `providers/index.ts` kayıt defterine ekleyin. Arayüz sağlayıcı
listesini bu kayıt defterinden okur.

## Özellikler

- **Editör:** proje klasörü açma, dosya ağacı, sekmeli Monaco editörü, kaydetme
  (Ctrl+S), dil desteği (TS/TSX/JS/JSX/Python), satır vurgusu, parantez eşleştirme.
- **Terminal:** yerel kabuk (Windows'ta PowerShell), komut geçmişi akışı, oturum
  yenileme. PTY yoktur; `vim`/`top` gibi tam ekran programlar desteklenmez.
- **AI sohbeti:** proje özeti + seçilen bağlamla sohbet; bağlam göndermeden önce
  görüntülenebilir. Demo ve gerçek sağlayıcı arayüzde ayrı etiketlenir.
- **Görev grafiği:** planlayıcı → kodlayıcı → inceleyici akışı, ajan kartlarında ad, rol,
  model, durum ve yaklaşık token kullanımı. Kenarlar görev devrini gösterir. Ajan adı,
  rolü ve modeli düzenlenebilir. Ajanların ürettiği yeni görevler ve komutlar
  **onaylanmadan yürütülmez**; görev durdurulabilir.
- **Proje haritası:** dosya taraması, Tree-sitter (WASM) ile fonksiyon/sınıf/metot/
  değişken/tür/import çıkarımı, tanım–kullanım ilişkileri, sembol arama, tek tıkla AI
  bağlamına ekleme, artımlı güncelleme (dosya izleme), ilerleme göstergesi.
- **Diff incelemesi:** dosya listesi, satır bazlı diff, kabul / red / geri al, tümünü
  kabul et / reddet, yazma hatalarının gösterimi.
- **Kullanım:** istek başına sağlayıcı token kullanımı SQLite'a kaydedilir; görev, ajan,
  sağlayıcı ve model bazında özetlenir. Ölçülen ve tahmini değerler ayrıdır. Kalan kota
  bilinmiyorsa gösterilmez.
- **Güvenlik:** gizli dosyalar, `.env*`, anahtarlar, sertifikalar, ikili ve 512 KB üzeri
  dosyalar indekslenmez ve bağlama eklenmez; tüm dosya erişimleri ana süreçte açılmış
  proje köküyle sınırlandırılır.

## Mimari

```
electron/
  main.ts                   pencere, protokol (app://), menü, IPC kaydı, smoke modu
  preload.ts                contextBridge ile tipli API (sandbox açık)
  services/
    workspace.ts            dosya ağacı, güvenli okuma/yazma, gizli dosya kuralları
    indexer.ts              Tree-sitter taraması, sembol/ilişki indeksi, dosya izleme
    lsp.ts                  isteğe bağlı LSP istemcisi (typescript-language-server)
    db.ts                   SQLite (kullanım, ayarlar, sohbet)
    secrets.ts              safeStorage tabanlı gizli anahtar kasası
    providers/              adaptör kayıt defteri, OpenAI ve demo adaptörleri
    terminal.ts             yerel kabuk oturumları ve tek seferlik komut çalıştırma
src/
  shared/                   ana süreç + arayüz arasında paylaşılan tipler, diff, IPC adları
  core/                     görev yürütücüsü, istem kurulumu, onay kapısı, iptal denetimi
  state/store.ts            uygulama durumu (zustand) ve eylemler
  components/               arayüz bileşenleri
```

Katmanlar birbirinden ayrıdır: arayüz yalnızca preload API'sini ve kendi durumunu bilir;
görev yürütücüsü sağlayıcı/bağlam/iş akışını yönetir; indeks ve dosya erişimi ana süreçte
kalır; anahtarlar arayüze hiç dönmez.

## Bilinen sınırlamalar

- **LSP isteğe bağlıdır.** `typescript-language-server` projede (veya PATH'te) kuruluysa
  TypeScript/JavaScript tanılamaları alınır. Kurulu değilse Sorunlar paneli bunu açıkça
  "kullanılamıyor" olarak gösterir; Adiutor sunucuyu otomatik kurmaz.
- **Terminal PTY kullanmaz**; etkileşimli tam ekran programlar çalışmaz. Komutlar ve
  çıktı akışı çalışır.
- **İndeks oturum içinde tutulur**, diske kalıcı yazılmaz; uygulama açılışında yeniden
  taranır. Dosya değişikliklerinde yalnızca ilgili dosya yeniden indekslenir.
- **Tree-sitter WASM gramerleri** `tree-sitter-wasms` paketinden gelir (ABI 14). Gramer
  yüklenemezse indeks, bunu arayüzde bildirerek sadeleştirilmiş regex çıkarımına düşer.
- **Kullanım kaydı** yalnızca bu uygulamanın yaptığı istekleri kapsar; sağlayıcı
  hesabının toplam kullanımını veya kalan kotasını göstermez.
- Kodlayıcı ajan değişiklikleri **tam dosya içeriği** olarak önerir (ilk sürüm); büyük
  dosyalarda bağlam 8000 karakterle sınırlanır.
- Paketleme (installer/`.exe` üretimi) bu sürümde yoktur; uygulama kaynak ağacından
  `npm run dev` / `npm start` ile çalışır.
