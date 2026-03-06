# CALLCEPTION — 24 Saatlik Go-Live Runbook

**Amaç:** İlk canlı müşterini almadan önce ve aldıktan sonraki 24 saat boyunca sistemin sağlığını doğrulamak.

**Altın Kural:** Bu checklist'teki her madde "done" olmadan pazarlama kanallarını açma.

---

## Otomatik Kontrol Komutu

Tüm alt sistemleri tek seferde kontrol et:

```bash
# Local
curl -s http://localhost:3000/api/system/go-live-check | jq

# Production
curl -s https://your-app.vercel.app/api/system/go-live-check | jq
```

**Beklenen Sonuç:** `"verdict": "GO"` — tüm kritik kontroller geçmeli.

---

## Faz 0: Pre-Flight (Canlıya Çıkmadan 1 Saat Önce)

### Webhook Smoke Test
```bash
# 1. Kanal durumunu kontrol et
curl -s https://your-app.vercel.app/api/billing/alert-test | jq

# 2. Test bildirimi gönder (telefonuna düşmeli)
curl -s -X POST https://your-app.vercel.app/api/billing/alert-test \
  -H "Content-Type: application/json" \
  -d '{"type":"emergency"}' | jq
```

- [ ] Slack kanalında 🚨 test bildirimi geldi
- [ ] Telegram'da 🚨 test bildirimi geldi
- [ ] Console loglarında alert JSON'u görünüyor

### Environment Variables
```bash
# Tüm env var'ların production değerlerinde olduğunu kontrol et
curl -s https://your-app.vercel.app/api/system/go-live-check | jq '.checks[] | select(.name | startswith("env:"))'
```

- [ ] `OPENAI_API_KEY` — OK
- [ ] `DEEPGRAM_API_KEY` — OK
- [ ] `ELEVENLABS_API_KEY` — OK
- [ ] `GROQ_API_KEY` — OK
- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` — OK
- [ ] `ALERT_SLACK_WEBHOOK_URL` — OK
- [ ] `ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID` — OK
- [ ] `.env` dosyasında `localhost` değeri KALMADI

### Dashboard Visual Check
- [ ] `/billing` → "Ses Pipeline" tab'ı açılıyor
- [ ] `VoicePipelineStats` kartı render oluyor (0 çağrı gösterse bile)
- [ ] `EmergencyModeCard` "Normal Mod" badge'i gösteriyor
- [ ] Charts "Henüz veri yok" placeholder gösteriyor

### Emergency Mode Manuel Test
- [ ] Billing → Ses Pipeline → "Acil Durum Modunu Etkinleştir" butonuna bas
- [ ] Badge kırmızıya döndü, uyarı paneli göründü
- [ ] Slack/Telegram'a "Acil Durum Modu Aktif" bildirimi geldi
- [ ] "Normal Moda Dön" butonuna bas, badge yeşile döndü
- [ ] Slack/Telegram'a "Acil Durum Modu Kapandı" bildirimi geldi

---

## Faz 1: İlk Saatler (T+0 — T+4) — "Sessiz Gözlem"

> Balayı saatleri. İlk müşteriler içeri giriyor. Hiçbir şeye dokunma, sadece izle.

### Real-time Monitoring
- [ ] **Vercel Dashboard** → Functions → Realtime Logs açık
- [ ] 5xx hata oranı < %1 (sıfır olmalı idealde)
- [ ] Ortalama function süresi < 5s

### Firestore Data Flow
```bash
# Metrics yazılıyor mu kontrol et
curl -s https://your-app.vercel.app/api/system/go-live-check | jq '.checks[] | select(.name == "metrics:logger")'
```

- [ ] `call_metrics` collection'ına yeni doc'lar yazılıyor
- [ ] `metrics_daily` collection'ında bugünün doc'u oluştu
- [ ] `cost_alerts` collection'ında uyarı YOK (normal durum)

### Subscription Flow
- [ ] Müşteri ödeme yaptı → `subscription_status: active` oldu
- [ ] Onboarding → Knowledge Base → ilk çağrıya kadar akış tamamlandı
- [ ] Müşteri spinner'da asılı KALMADI (timeout fix'i çalışıyor)

### İlk Çağrı Kontrolü (Kritik!)
İlk gerçek çağrı geldiğinde:
- [ ] STT (Deepgram) başarılı transkripsiyon yaptı
- [ ] LLM (Groq) Türkçe yanıt üretti
- [ ] TTS (ElevenLabs) ses sentezledi
- [ ] Toplam yanıt süresi < 3 saniye

---

## Faz 2: Maliyet ve Hız Kontrolü (T+4 — T+12)

### Latency Audit
```bash
# Pipeline analytics
curl -s https://your-app.vercel.app/api/billing/analytics?type=summary \
  -H "x-user-tenant: YOUR_TENANT_ID" | jq '.latencyStats'
```

| Metrik | Hedef | Aksiyon (Hedef Aşılırsa) |
|--------|-------|--------------------------|
| Toplam Pipeline | < 2.5s | metrics_daily'dan hangi stage yavaş bak |
| STT (Deepgram) | < 1.2s | Deepgram planını kontrol et |
| LLM (Groq) | < 0.5s | Groq rate limit'e yaklaşıyor olabilir |
| TTS (ElevenLabs) | < 0.8s | ElevenLabs Turbo v2 doğrulandı mı? |

- [ ] Ortalama pipeline < 2.5s ✓
- [ ] P95 pipeline < 4.0s ✓
- [ ] 4s üstü çağrı YOK

### Cost Audit
```bash
# Maliyet durumu
curl -s https://your-app.vercel.app/api/billing/emergency \
  -H "x-user-tenant: YOUR_TENANT_ID" | jq
```

- [ ] TTS karakter kullanımı bütçenin %80'inin altında
- [ ] Emergency Mode AKTİF DEĞİL
- [ ] Tahmini maliyet beklenen aralıkta ($0.15/1000 char)

### Emergency Mode Tetiklenmedi mi?
Eğer tetiklendiyse:
- [ ] cost-monitor loglarında sebep var mı? (Vercel → Functions → Logs → `[CostMonitor]` filtrele)
- [ ] Beklenmedik yüksek trafik mi? (DDoS, loop, test script)
- [ ] ElevenLabs tarafında fiyat değişikliği mi?

---

## Faz 3: Retrospektif (T+24)

> Son durak. Bu noktada sistemi "güvenilir" ilan edip pazarlamaya açabilirsin.

### Error Log İncelemesi
Vercel Dashboard → Logs → filtre: `error` veya `failed`

- [ ] "User Error" (garip input, yanlış format) — kabul edilebilir
- [ ] "System Error" (timeout, permission, provider down) — ARAŞTIRILMALI
- [ ] Unhandled rejection YOK
- [ ] `[MetricsLogger] Flush failed` YOK
- [ ] `[CostMonitor] checkCostThresholds failed` YOK

### Performans Özeti
Dashboard'tan veya API'den:
- [ ] Toplam çağrı sayısı: ___
- [ ] Başarılı çağrı oranı: ___% (hedef: >95%)
- [ ] Ortalama yanıt süresi: ___s (hedef: <2.5s)
- [ ] TTS karakter kullanımı: ___ / 500,000
- [ ] Tahmini aylık maliyet: $___

### Kullanıcı Geri Bildirimi
- [ ] İlk müşteriye kısa mesaj/e-posta gönderildi:
  > "Sistemi kurduk, deneyiminiz nasıldı? Bir darboğaz hissettiniz mi?"
- [ ] Gelen feedback not edildi

### Edge Case Kontrolü
- [ ] Çince/Arapça input geldi mi? → Türkçe kural çalıştı mı?
- [ ] Çok uzun input (>500 kelime) geldi mi? → Timeout olmadı mı?
- [ ] Eş zamanlı çağrılar (concurrent) sorun yaratmadı mı?
- [ ] Gece saatlerinde (düşük trafik) sistem uyumadı mı?

---

## Go/No-Go Karar Matrisi

| Kriter | Go | No-Go |
|--------|----|----|
| 5xx hata oranı | < %1 | > %1 |
| Pipeline latency (P50) | < 2.5s | > 4.0s |
| Emergency Mode | Tetiklenmedi | Beklenmedik tetiklendi |
| TTS bütçe kullanımı | < %60 | > %80 |
| Unhandled errors | 0 | > 0 |
| Müşteri geri bildirimi | Pozitif/nötr | Negatif |
| Alerting çalışıyor | Evet | Hayır |

**Tüm "Go" sütunu yeşilse** → Pazarlama kanallarını aç.
**Herhangi bir "No-Go" varsa** → Sorunu çöz, 24 saati tekrar başlat.

---

## Acil Durum Playbook

### Sistem Çöktüyse (5xx Cascade)
1. Vercel Dashboard → Functions → hatayı bul
2. Son deploy'u rollback et: `vercel rollback`
3. Müşteriye bilgi ver: "Teknik bakım yapılıyor, 15 dk içinde çözülecek"

### Emergency Mode Beklenmedik Tetiklendiyse
1. Dashboard → Billing → Ses Pipeline → "Normal Moda Dön"
2. Firestore → `tenants/{id}/config/cost_monitoring` → `emergencyModeActive: false`
3. TTS bütçesini geçici olarak artır: `ttsMonthlyCharBudget: 1000000`

### Provider Down (Groq/ElevenLabs/Deepgram)
1. Circuit breaker otomatik fallback sağlar — müdahale gerekmez
2. Slack/Telegram'da "provider down" uyarısı gelir
3. Provider status sayfasını kontrol et
4. Sorun 30dk'dan uzun sürerse, provider'a destek talebi aç

---

## Hızlı Kontrol Komutları

```bash
# Tek komutla tüm sistem sağlığı
curl -s $APP_URL/api/system/go-live-check | jq '.verdict, .summary'

# Webhook testi
curl -s -X POST $APP_URL/api/billing/alert-test -H "Content-Type: application/json" -d '{"type":"info"}'

# Pipeline sağlığı
curl -s $APP_URL/api/voice/health | jq '.status, .capabilities, .mode'

# Maliyet durumu
curl -s $APP_URL/api/billing/emergency -H "x-user-tenant: TENANT_ID" | jq

# Analytics
curl -s "$APP_URL/api/billing/analytics?type=summary" -H "x-user-tenant: TENANT_ID" | jq
```

---

*Bu runbook, CALLCEPTION'ın ilk 24 saatlik canlı operasyonunu güvenle yönetmek için tasarlanmıştır.*
*Her faz tamamlandığında bu dosyayı işaretleyip ilerle.*
