# Callception — Uptime Monitoring Kurulum Rehberi

## Genel Bakis

Callception'in 7/24 erisilebilirligini izlemek icin harici uptime monitoring servisleri kullanilir.
Mevcut `/api/system/go-live-check` endpoint'i tum alt sistemleri kontrol eder.

---

## Izlenecek Endpoint'ler

| URL | Yontem | Beklenen Status | Interval | Aciklama |
|-----|--------|-----------------|----------|----------|
| `https://callception.com/api/system/go-live-check` | GET | 200 | 5 dk | Ana saglik kontrolu |
| `https://callception.com/api/health` | GET | 200 | 5 dk | Basit health check |
| `https://callception.com/landing` | GET | 200 | 10 dk | Landing sayfasi erisimi |
| `https://callception.com/api/voice/health` | GET | 200 | 5 dk | Ses pipeline sagligi |

### Go-Live Check Detaylari

`/api/system/go-live-check` asagidaki alt sistemleri kontrol eder:

- **Firestore** — Veritabani baglantisi
- **Firebase Auth** — Kimlik dogrulama servisi
- **Resend** — E-posta gonderim servisi
- **Twilio** — Telefon altyapisi
- **Voice Pipeline** — Ses isleme pipeline'i
- **Rate Limiter** — Hiz sinirlandirici

**Beklenen Yanit:**
```json
{
  "verdict": "GO",
  "checks": {
    "firestore": { "status": "ok" },
    "auth": { "status": "ok" },
    "resend": { "status": "ok" },
    "twilio": { "status": "ok" },
    "voice": { "status": "ok" },
    "rateLimiter": { "status": "ok" }
  }
}
```

`verdict: "NO_GO"` gelirse — bir veya daha fazla alt sistem calismiyordur.

---

## Onerilen Servisler

### 1. BetterUptime (Onerilen)

1. [betteruptime.com](https://betteruptime.com) hesabi olustur
2. **Monitors → Create Monitor** tikla
3. Ayarlar:
   - **URL:** `https://callception.com/api/system/go-live-check`
   - **Check interval:** 5 minutes
   - **Request method:** GET
   - **Expected status code:** 200
   - **Keyword (body contains):** `"verdict":"GO"`
4. Alert kanallari ekle (asagida)
5. Ayni adimlari diger endpoint'ler icin tekrarla

### 2. UptimeRobot (Ucretsiz Alternatif)

1. [uptimerobot.com](https://uptimerobot.com) hesabi olustur
2. **Add New Monitor** tikla
3. Ayarlar:
   - **Monitor Type:** HTTP(S)
   - **URL:** `https://callception.com/api/system/go-live-check`
   - **Monitoring Interval:** 5 minutes
4. **Alert Contacts** ekle

---

## Alert Kanallari

### Slack Webhook

Mevcut Slack entegrasyonu kullanilabilir:

1. Slack'te **Apps → Incoming Webhooks** ekle
2. Webhook URL'yi monitoring servisine ekle
3. Kanal: `#ops-alerts` veya benzeri

### Telegram Bot

Mevcut Telegram bot altyapisi kullanilabilir:

1. Telegram Bot Token: `TELEGRAM_BOT_TOKEN` env
2. Chat ID: `TELEGRAM_CHAT_ID` env
3. BetterUptime → **Integrations → Telegram** ile bagla

### E-posta

1. Monitoring servisinde e-posta alert ekle
2. Hedef: Operasyon ekibi e-posta adresi

---

## Onerilen Alert Kurallari

| Durum | Alert | Kanal |
|-------|-------|-------|
| Endpoint DOWN (2 ardisik basarisizlik) | Acil | Slack + Telegram + E-posta |
| Response time > 5000ms | Uyari | Slack |
| SSL sertifikasi 14 gun icinde bitiyor | Bilgi | E-posta |
| `verdict: "NO_GO"` | Acil | Slack + Telegram |

---

## Cron Job Izleme

Vercel cron job'lari icin ayri izleme:

| Cron | Schedule | Kontrol |
|------|----------|---------|
| `/api/cron/appointment-reminders` | Gunluk 00:00 | Son calisma zamani |
| `/api/cron/gpu-shutdown` | Gunluk 03:00 | Son calisma zamani |
| `/api/cron/webhook-retry` | Her 5 dk | Pending retry sayisi |

**BetterUptime Heartbeat Monitoring:**
1. Her cron job'in sonunda BetterUptime heartbeat URL'sine ping at
2. Heartbeat gelmezse alert olustur

---

## Dashboard & Raporlama

### Status Page (Opsiyonel)

BetterUptime ile public status page olusturulabilir:
- URL: `status.callception.com`
- Gosterilecek: API, Web, Voice Pipeline, E-posta
- Incident yonetimi icin BetterUptime Incidents kullan

### Haftalik Rapor

Monitoring servisinin haftalik rapor ozelligini ac:
- Uptime yuzdeleri
- Ortalama response time
- Incident sayisi ve suresi

---

## Kontrol Listesi

- [ ] BetterUptime veya UptimeRobot hesabi olusturuldu
- [ ] Go-live-check monitor eklendi (5dk interval)
- [ ] Health check monitor eklendi (5dk interval)
- [ ] Landing page monitor eklendi (10dk interval)
- [ ] Voice health monitor eklendi (5dk interval)
- [ ] Slack alert kanali baglandi
- [ ] Telegram alert kanali baglandi
- [ ] E-posta alert eklendi
- [ ] SSL sertifika izleme aktif
- [ ] Cron heartbeat izleme kuruldu
