# Terminal Setup - Cursor vs Mac Terminal

## 🎯 Sorun: Cursor Terminal'de Server Başlamıyor

Cursor bazen sandbox terminal kullanır ve bu localhost bağlantısını engelleyebilir.

## ✅ Çözüm: Mac Terminal.app Kullan

### Adım 1: Terminal.app'i Açın

1. Spotlight'ı açın (Cmd+Space)
2. "Terminal" yazın ve Enter
3. YENİ bir Terminal penceresi açılacak

### Adım 2: Projeye Gidin

```bash
cd /Users/pc/Desktop/smartflow-crm
```

### Adım 3: Server'ı Başlatın

```bash
npm run dev
```

### Adım 4: "Ready" Mesajını Bekleyin

Terminal'de şunu göreceksiniz:
```
▲ Next.js 16.0.1
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000
✓ Ready in Xs
```

### Adım 5: Tarayıcıda Açın

http://localhost:3000

## 🔄 Live Development Workflow

1. **Terminal.app'de:** `npm run dev` çalışıyor (bırakın çalışsın)
2. **Cursor'da:** Kod yazın ve değiştirin
3. **Kaydedin:** Cmd+S
4. **Tarayıcıda:** Otomatik güncellenir (Fast Refresh)

## 🛑 Server'ı Durdurma

Terminal.app'de: `Ctrl+C`

## 📝 Alternatif: Cursor Terminal Ayarları

Eğer Cursor terminal kullanmak istiyorsanız:

1. Cursor → Settings → Terminal
2. "Terminal > Integrated > Allow Workspace Shell" → ✅ Aktif
3. "Terminal > Integrated > Shell: Osx" → `/bin/zsh`
4. Terminal'i yeniden başlatın

## ⚠️ Önemli Notlar

- Cursor terminal'de background process'ler bazen suspend olabilir
- Mac Terminal.app her zaman güvenilir çalışır
- İki terminal açık tutabilirsiniz:
  - Terminal.app: Server için
  - Cursor Terminal: Git komutları için

