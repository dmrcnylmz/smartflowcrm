# 🚀 Development Guide - SmartFlow CRM

## ⚡ Hızlı Başlangıç

### Terminal.app'de (Önerilen - En Güvenilir)

```bash
cd /Users/pc/Desktop/smartflow-crm
./start-dev.sh
```

VEYA manuel:

```bash
cd /Users/pc/Desktop/smartflow-crm
npm run dev
```

**Bekleyin:** Terminal'de "Ready" mesajını görün
**Açın:** http://localhost:3000

## 🎯 Live Development (Fast Refresh)

Next.js 16'da Fast Refresh varsayılan olarak aktif:

- ✅ Kod değişikliğinde anında güncellenir
- ✅ Component state korunur  
- ✅ Hata varsa overlay gösterir
- ✅ 1-2 saniye içinde değişiklikler görünür

### Workflow:
1. Terminal'de `npm run dev` çalışıyor (bırakın)
2. Cursor'da kod değiştirin
3. Dosyayı kaydedin (Cmd+S)
4. Tarayıcıda otomatik güncellenir

## 🔧 Sorun Giderme

### Server Başlamıyor

```bash
# 1. Process'leri durdur
pkill -9 -f "next dev"

# 2. Cache temizle
rm -rf .next

# 3. Tekrar başlat
npm run dev
```

### Port 3000 Kullanımda

```bash
# Port kontrolü
lsof -ti:3000

# Port'u temizle
lsof -ti:3000 | xargs kill -9

# Farklı port kullan
PORT=3002 npm run dev
```

### UI Görünmüyor

1. **Terminal kontrolü:**
   - "Ready" mesajı var mı?
   - Hata var mı?

2. **Tarayıcı kontrolü:**
   - Console'u açın (F12)
   - Network tab'inde istekleri kontrol edin
   - Hata mesajlarını kontrol edin

3. **Firebase kontrolü:**
   ```bash
   # .env.local var mı?
   test -f .env.local && echo "✅ Var" || echo "❌ Yok"
   ```

### Firebase Config Hatası

```bash
# .env.local kontrolü
cat .env.local | grep FIREBASE

# Eğer eksikse
cp .env.example .env.local
# Sonra Firebase bilgilerini doldurun
```

## 📋 Script'ler

### `start-dev.sh`
Temiz başlatma yapar, terminal'de çıktı gösterir.

### `fix-dev.sh`  
Otomatik fix, background'da başlatır, tarayıcıyı açar.

## 🎨 UI Geliştirme İpuçları

### Hot Reload Testi
1. `app/page.tsx` dosyasını açın
2. Bir metni değiştirin (örn: "Dashboard" → "Ana Sayfa")
3. Kaydedin (Cmd+S)
4. Tarayıcıda 1-2 saniye içinde güncellenir

### Component Değişiklikleri
- React component'lerde state korunur
- CSS değişiklikleri anında görünür
- TypeScript hataları terminal'de gösterilir

### Debugging
- Terminal: Server log'ları
- Browser Console (F12): Client-side hatalar
- Network Tab: API istekleri

## ✅ Başarı Kontrolü

- [ ] Terminal'de "Ready" mesajı görünüyor
- [ ] http://localhost:3000 açılıyor
- [ ] Dashboard UI görünüyor
- [ ] Kod değişikliğinde anında güncelleniyor
- [ ] Terminal'de hata yok
- [ ] Browser console'da hata yok

## 📞 Yardım

Sorun devam ederse:
1. Terminal çıktısını paylaşın
2. Browser console hatalarını paylaşın
3. `tail -100 /tmp/smartflow-dev.log` çıktısını paylaşın

