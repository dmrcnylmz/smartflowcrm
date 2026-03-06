# Live Development Guide - Callception

## 🎯 Sorun ve Çözüm

Cursor terminal'inde `npm run dev` çalıştırdığınızda server başlıyor ama UI görünmüyor. Bu genellikle:
- Server yanlış adrese bind oluyor
- Process suspend durumunda
- Cache sorunları
- Port çakışması

## ✅ Hızlı Çözüm (Önerilen)

### Yöntem 1: Otomatik Fix Script (En Kolay)

```bash
cd /Users/pc/Desktop/smartflow-crm
./fix-dev.sh
```

Bu script:
1. ✅ Tüm Next.js process'lerini durdurur
2. ✅ Cache'i temizler
3. ✅ Port'u kontrol eder ve seçer
4. ✅ Server'ı başlatır
5. ✅ Tarayıcıyı otomatik açar

### Yöntem 2: Manuel Temiz Başlatma

```bash
cd /Users/pc/Desktop/smartflow-crm

# 1. Process'leri durdur
pkill -9 -f "next dev"

# 2. Cache temizle
rm -rf .next

# 3. Server başlat
PORT=3000 npm run dev
```

**Terminal'de "Ready" mesajını görünce tarayıcıda açın:** http://localhost:3000

## 🔧 Cursor Terminal Ayarları

### Sorun: Sandbox Terminal
Cursor bazen sandbox terminal kullanır ve bu localhost bağlantısını engelleyebilir.

### Çözüm 1: Mac Terminal.app Kullan
1. Cursor'da Terminal → New Terminal
2. Sağ üstteki "..." menüsünden "Terminal: Select Default Profile"
3. "Terminal.app" seçin (veya zsh/bash)

### Çözüm 2: Cursor Terminal Ayarları
1. Cursor Settings → Terminal
2. "Terminal > Integrated > Allow Workspace Shell" aktif olsun
3. "Terminal > Integrated > Shell: Osx" → `/bin/zsh` veya `/bin/bash`

### Çözüm 3: External Terminal Kullan
1. Terminal.app'i açın
2. `cd /Users/pc/Desktop/smartflow-crm`
3. `npm run dev` çalıştırın
4. Bu şekilde tam localhost erişimi olur

## 🚀 Live Development Workflow

### Next.js Fast Refresh (Zaten Aktif)
Next.js 16'da Fast Refresh varsayılan olarak aktif. Kod değişikliklerinde:
- ✅ Component state korunur
- ✅ Anında UI güncellenir
- ✅ Hata varsa overlay gösterir

### Önerilen Workflow

1. **Terminal'de başlat:**
   ```bash
   cd /Users/pc/Desktop/smartflow-crm
   ./fix-dev.sh
   ```

2. **Tarayıcıda aç:**
   - http://localhost:3000 (veya script'in gösterdiği port)

3. **Kod değiştir:**
   - Dosyayı kaydedin (Cmd+S)
   - Terminal'de "compiled" mesajını görün
   - Tarayıcıda otomatik güncellenir (Fast Refresh)

4. **Log takibi:**
   ```bash
   tail -f /tmp/smartflow-dev.log
   ```

## 🔍 Sorun Giderme

### Server Başlamıyor
```bash
# Port kontrolü
lsof -ti:3000

# Eğer port kullanımdaysa
lsof -ti:3000 | xargs kill -9

# Tekrar başlat
./fix-dev.sh
```

### UI Görünmüyor
1. Tarayıcı console'u açın (F12)
2. Network tab'inde istekleri kontrol edin
3. Terminal'deki hata mesajlarını kontrol edin

### Firebase Hatası
```bash
# .env.local kontrolü
cat .env.local | grep FIREBASE

# Eğer eksikse .env.example'dan kopyalayın
cp .env.example .env.local
# Sonra Firebase bilgilerini doldurun
```

### Cache Sorunu
```bash
rm -rf .next
npm run dev
```

## 🛠️ Alternatif Araçlar

### 1. nodemon (Otomatik Restart)
```bash
npm install -D nodemon
```

`package.json`'a ekleyin:
```json
"scripts": {
  "dev:watch": "nodemon --watch . --exec 'npm run dev'"
}
```

### 2. Browser Auto-Refresh
Tarayıcı extension'ları:
- LiveReload
- Browser Refresh

### 3. Docker (İzolasyon için)
```bash
docker-compose up -d
# Port mapping: 3000:3000
```

## ✅ Onay Checklist

Dev server başladıktan sonra:

- [ ] Terminal'de "Ready" mesajı görünüyor
- [ ] `http://localhost:3000` açılıyor
- [ ] Dashboard UI görünüyor
- [ ] Kod değişikliğinde anında güncelleniyor (Fast Refresh)
- [ ] Terminal'de hata yok
- [ ] Tarayıcı console'da hata yok

## 📞 Destek

Sorun devam ederse:
1. Terminal'deki tam hata mesajını paylaşın
2. `tail -100 /tmp/smartflow-dev.log` çıktısını paylaşın
3. Tarayıcı console hatalarını paylaşın

