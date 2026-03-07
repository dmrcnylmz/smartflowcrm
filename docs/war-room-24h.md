# CALLCEPTION WAR ROOM - Lansman Gunu Operasyonel Plan

**Tarih:** ____/____/2026
**War Room Saatleri:** T-1 saat ~ T+24 saat
**Komuta Merkezi:** Slack #callception-warroom + Telegram Ops grubu

---

## 1. Roller ve Sorumluluklar

| Rol | Sorumlu | Erisilebilirlik |
|-----|---------|-----------------|
| **Incident Commander (IC)** | ___________ | Telefon + Slack + Telegram |
| **Backend Engineer** | ___________ | Terminal + Vercel access |
| **Customer Comms** | ___________ | E-posta + WhatsApp hazir |

> **Tek kural:** 24 saat boyunca telefon sessiz moda ALINMAZ.

---

## 2. Monitoring Dashboard Kurulumu (T-1 saat)

### Acik Tutulacak Sekmeler

1. **Vercel Dashboard** > Functions > Realtime Logs
2. **Slack** #callception-warroom kanali
3. **Telegram** Ops grubu (bildirimler ON)
4. **Terminal** - her 5 dk calistir:
   ```bash
   export APP_URL="https://YOUR-APP.vercel.app"
   curl -s $APP_URL/api/system/go-live-check | python3 -c "
   import json,sys; d=json.load(sys.stdin)
   s=d['summary']
   print(f'{d[\"verdict\"]} | OK:{s[\"ok\"]} Warn:{s[\"warnings\"]} Err:{s[\"errors\"]} | {s[\"checkDurationMs\"]}ms')
   if d.get('blockers'): [print(f'  BLOCKER: {b}') for b in d['blockers']]
   "
   ```
5. **Firestore Console** > `call_metrics` collection (canli veri akisi)

### Alarm Sesleri Kontrolu
```bash
# Test: Tum kanallara bildirim gonder
curl -s -X POST $APP_URL/api/billing/alert-test \
  -H "Content-Type: application/json" \
  -d '{"type":"emergency"}'
```
- [ ] Slack alindi
- [ ] Telegram alindi
- [ ] Ses acik, bildirim kacirilmayacak

---

## 3. Eskalasyon Matrisi

### Seviye 1: SARI ALARM (Warning)
**Tetikleyici:** Advisory uyarilari, tek basarisiz cagri, yuksek latency spike

| Aksiyon | Kimin | Suresi |
|---------|-------|--------|
| Vercel loglarini kontrol et | Backend | 5 dk |
| go-live-check calistir | Backend | 1 dk |
| Durum notu Slack'e yaz | IC | 2 dk |
| Musteri etkisi var mi? | Comms | 5 dk |

**Karar:** Etki yoksa izle. Tekrarlanirsa Seviye 2.

---

### Seviye 2: TURUNCU ALARM (Degraded)
**Tetikleyici:** 5xx hata orani > %1, pipeline latency > 4s, Emergency Mode tetiklendi, provider down

| Aksiyon | Kimin | Suresi |
|---------|-------|--------|
| Hatanin kaynagini bul | Backend | 10 dk |
| Etkilenen tenant'lari belirle | Backend | 5 dk |
| IC'ye brief ver | Backend | 2 dk |
| Musteri bilgilendirme hazirla | Comms | 5 dk |
| Gecici cozum uygula (asagidaki playbook) | Backend | 15 dk |

**Karar:** 30 dk icinde cozulmezse Seviye 3.

---

### Seviye 3: KIRMIZI ALARM (Critical)
**Tetikleyici:** Sistemin tamamen erisilemez olmasi, veri kaybi riski, 30+ dk cozumsuz Seviye 2

| Aksiyon | Kimin | Suresi |
|---------|-------|--------|
| `vercel rollback` calistir | Backend | 2 dk |
| Tum musteri iletisimini baslat | Comms | 5 dk |
| Pazarlama kanallarini durdur | IC | 5 dk |
| Post-mortem baslat | IC | Sorun cozuldukten sonra |

---

## 4. Hizli Mudahale Playbook'lari

### PB-1: 5xx Cascade
```bash
# 1. Son hatanin stack trace'i
# Vercel Dashboard > Functions > Logs > filtre: "error"

# 2. Rollback
vercel rollback

# 3. Rollback sonrasi kontrol
curl -s $APP_URL/api/system/go-live-check | jq '.verdict'
# Beklenen: "GO"
```

### PB-2: Emergency Mode Beklenmedik Tetiklendi
```bash
# 1. Dashboard'dan kapat
# /billing > Ses Pipeline > "Normal Moda Don"

# 2. API ile kapat (Dashboard erisim yoksa)
# Firestore Console > tenants/{TENANT_ID}/config/cost_monitoring
# emergencyModeActive: false
# ttsMonthlyCharBudget: 1000000  (gecici artis)

# 3. Sebebi arastir
curl -s "$APP_URL/api/billing/analytics?type=summary" \
  -H "x-user-tenant: TENANT_ID" | jq '.latencyStats, .costStats'
```

### PB-3: Provider Down (Groq/Deepgram/ElevenLabs)
```bash
# Circuit breaker otomatik calisiyor — mudahale gerekmez
# Ancak kontrol et:

# Hangi provider'lar aktif?
curl -s $APP_URL/api/voice/health | jq '.capabilities'

# Provider status sayfalari:
# - Groq:       https://status.groq.com
# - Deepgram:   https://status.deepgram.com
# - ElevenLabs: https://status.elevenlabs.io
# - Twilio:     https://status.twilio.com

# 30dk+ surerse: Provider'a destek talebi ac
```

### PB-4: Yuksek Latency (Pipeline > 4s)
```bash
# 1. Hangi stage yavas?
curl -s "$APP_URL/api/billing/analytics?type=summary" \
  -H "x-user-tenant: TENANT_ID" | jq '.latencyStats'

# Stage bazli hedefler:
# STT (Deepgram): < 1.2s
# LLM (Groq):     < 0.5s
# TTS (ElevenLabs): < 0.8s

# 2. Groq yavasliyorsa -> Circuit breaker otomatik fallback yapar
# 3. ElevenLabs yavasliyorsa -> TTS model'i kontrol et (Turbo v2 kullaniliyor mu?)
# 4. Deepgram yavasliyorsa -> model, language parametreleri kontrol et
```

### PB-5: Firestore Baglanti Hatasi
```bash
# 1. Firebase Console > Firestore > Status kontrol
# https://console.firebase.google.com

# 2. Health check
curl -s $APP_URL/api/health | jq '.services.firestore'

# 3. Firebase status
# https://status.firebase.google.com

# 4. Gecici cozum: Vercel'i redeploy et (cold start temizler)
vercel --prod
```

### PB-6: Rate Limit Patlamasi
```bash
# Belirtiler: Cok sayida 429 response
# Vercel Logs > filtre: "Rate limit"

# Kontrol:
# - DDoS/bot saldirisi mi?
# - Musteri entegrasyonunda dongu mu?
# - Test script unutuldu mu?

# Gecici: Vercel > Settings > Serverless > Rate limit ayarlari kontrol
# Kalici: IP'yi blokla veya musteriye bildir
```

---

## 5. Musteri Iletisim Sablonlari

### Sablon A: Bilinen Sorun (Cozum Devam Ediyor)
> Merhaba, Callception ekibinden bilgilendirme:
>
> Sistemimizde kisa sureli bir teknik kesinti yasanmaktadir.
> Ekibimiz sorunu tespit etmis olup cozum uzerinde calismaktadir.
> Tahmini cozum suresi: ~15 dakika.
>
> Ozur dileriz, en kisa surede bilgi verecegiz.
> — Callception Destek

### Sablon B: Sorun Cozuldu
> Merhaba, Callception ekibinden guncelleme:
>
> Daha once bildirdigimiz teknik sorun basariyla cozulmustur.
> Tum sistemler normal sekilde calismaktadir.
>
> Yasanan aksaklik icin ozur dileriz.
> Herhangi bir sorunuz varsa bize ulasabilirsiniz.
> — Callception Destek

### Sablon C: Uzun Sureli Kesinti (>30dk)
> Merhaba, Callception ekibinden onemli bilgilendirme:
>
> Sistemimizde devam eden bir teknik sorun bulunmaktadir.
> Ekibimiz tam kadrolu olarak cozum uzerinde calismaktadir.
>
> Mevcut durum: [DETAY]
> Sonraki guncelleme: [SAAT]
>
> Bu sure zarfinda cagralariniz [otomatik yonlendirme/voicemail] ile yonetilmektedir.
> — Callception Destek

---

## 6. Zaman Cizelgesi Kontrol Listesi

### T-1 Saat: Pre-Flight
- [ ] War Room Slack kanali acildi
- [ ] Tum monitoring sekmeleri acik
- [ ] go-live-check: `GO` verdikti
- [ ] Alert test: Slack + Telegram alindi
- [ ] Emergency Mode test: Ac/kapat calisti
- [ ] Rollback planlamasi: Son stable deploy hash not edildi
  ```bash
  vercel ls --prod | head -5
  # Son stable deploy ID: _______________
  ```

### T+0: Lansman
- [ ] Pazarlama kanallari acildi
- [ ] Vercel Realtime Logs izleniyor
- [ ] IC Slack'te "CANLI" mesaji yazdi

### T+1 Saat: Ilk Kontrol
- [ ] go-live-check calistirildi
- [ ] Ilk cagri geldi mi? Basarili mi?
- [ ] 5xx hatasi var mi? (Vercel > Logs)
- [ ] Alert gelmedi (iyi haber)

### T+4 Saat: Stabilite Kontrolu
- [ ] Pipeline latency < 2.5s (ortalama)
- [ ] Emergency Mode tetiklenmedi
- [ ] TTS butce kullanimi < %60
- [ ] Musteri sikayeti yok

### T+8 Saat: Gece Nobeti
- [ ] Telefon sesi acik
- [ ] Otomatik health check crontab'a eklendi (opsiyonel):
  ```bash
  # Her 15 dk'da bir kontrol (opsiyonel local crontab)
  */15 * * * * curl -s $APP_URL/api/system/go-live-check | jq -r '.verdict' >> /tmp/golive.log
  ```
- [ ] Sonraki nobet saati belirlendi

### T+12 Saat: Yari Yol
- [ ] Maliyet raporu cikartildi
- [ ] Performans metrikleri not edildi:
  - Toplam cagri: ___
  - Basarili cagri orani: ____%
  - Ortalama pipeline: ___s
  - TTS kullanim: ___/500,000 char

### T+24 Saat: Degerlendirme
- [ ] Tum metriklerin ekran goruntuleri alindi
- [ ] Post-mortem (sorun yasilandiysa) yazildi
- [ ] Musteri geri bildirimleri toplandi
- [ ] Go/No-Go kararinda tum "Go" sutunu yesil mi?
- [ ] KARAR: [ ] Pazarlama devam / [ ] 24 saat daha izle

---

## 7. Acil Iletisim Bilgileri

| Servis | Destek Kanali | SLA |
|--------|---------------|-----|
| Vercel | support.vercel.com | Pro: 4 saat |
| Firebase | firebase.google.com/support | Blaze: 4 saat |
| Twilio | twilio.com/help | 1 saat (Urgent) |
| Groq | groq.com/support | Best effort |
| Deepgram | deepgram.com/contact | Growth: 24 saat |
| ElevenLabs | elevenlabs.io/contact | Scale: 24 saat |

---

## 8. Post-Mortem Sablonu

Sorun yasandiysa, 48 saat icinde doldur:

```
## Olay Ozeti
- Tarih/Saat: ___
- Sure: ___
- Etki: ___ tenant, ___ cagri
- Seviye: Sari / Turuncu / Kirmizi

## Kronoloji
- HH:MM - Sorun tespit edildi
- HH:MM - IC bilgilendirildi
- HH:MM - Gecici cozum uygulandi
- HH:MM - Kalici cozum uygulandi
- HH:MM - Normal operasyona donuldu

## Kök Neden
[Teknik detay]

## Alinan Dersler
1. Ne iyi gitti?
2. Ne kotu gitti?
3. Sans eseri ne olmadi?

## Aksiyon Itemleri
- [ ] [AKSIYON] - Sorumlu: ___ - Deadline: ___
```

---

*Bu plan, go-live-runbook.md'nin tamamlayicisidir. Runbook prosedurlu checklist, bu belge olay aninda hizli karar ve eskalasyon rehberidir.*
*Her iki belge de lansmanin saglikli gecmesini garanti eder.*
