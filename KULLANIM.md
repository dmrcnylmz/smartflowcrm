# 📖 SmartFlow CRM - Kullanım Kılavuzu

## 🚀 Hızlı Başlangıç

### 1. Firebase Setup

```bash
# 1. Firebase Console'dan proje oluştur
# 2. Firestore Database'i Test mode'da başlat
# 3. Web app ekle ve config kopyala

cd /Users/pc/Desktop/smartflow-crm
cp .env.local.example .env.local
# .env.local dosyasını düzenle ve Firebase bilgilerini yapıştır
```

### 2. Firestore Collections Oluştur

```bash
npm run setup:firestore
```

**Çıktı:**
```
🚀 Firestore Collections Setup Başlıyor...
📦 Proje: your-project-id

✅ customers collection initialized
✅ calls collection initialized
✅ appointments collection initialized
✅ complaints collection initialized
✅ info_requests collection initialized
✅ activity_logs collection initialized
✅ documents collection initialized

✨ Tüm collections başarıyla oluşturuldu!
```

### 3. Projeyi Başlat

```bash
npm run dev
```

Tarayıcı: http://localhost:3000

---

## 📱 Sayfalar ve Özellikler

### Dashboard (`/`)
- Günlük KPI'lar (çağrılar, şikayetler, randevular)
- Son aktiviteler feed'i
- Hızlı aksiyonlar

### Çağrılar (`/calls`)
- Tüm çağrı kayıtları
- Intent classification görüntüleme
- Çağrı detayları ve transcript

### Randevular (`/appointments`)
- Yaklaşan randevular listesi
- Randevu oluşturma/düzenleme
- Google Calendar entegrasyonu

### Biletler (`/tickets`)
- Bilgi talepleri ve şikayetler
- Kanban görünümü
- Atama ve durum takibi

### Şikayetler (`/complaints`)
- Şikayet yönetimi
- SLA takibi
- Çözüm durumu

### Müşteriler (`/customers`)
- Müşteri listesi
- İletişim bilgileri
- İşlem geçmişi

### Raporlar (`/reports`)
- Günlük/haftalık özetler
- CSV/PDF export

### Ayarlar (`/admin`)
- n8n yapılandırması
- Twilio ayarları
- Google Calendar OAuth
- AI Provider seçimi

---

## 🔌 API Endpoints

### Webhooks (n8n için)

**POST /api/webhook/call**
```json
{
  "from": "+905551234567",
  "transcript": "Merhaba, randevu almak istiyorum",
  "durationSec": 120
}
```

### REST APIs

**GET /api/appointments**
```bash
curl http://localhost:3000/api/appointments?status=scheduled
```

**POST /api/appointments**
```json
{
  "customerId": "customer_id",
  "dateTime": "2024-01-15T10:00:00Z",
  "durationMin": 30,
  "notes": "Kontrol randevusu"
}
```

**GET /api/tickets?type=complaint**
```bash
curl http://localhost:3000/api/tickets?type=complaint&status=open
```

### AI Endpoints

**POST /api/ai/intent**
```json
{
  "text": "Randevu almak istiyorum",
  "useLLM": false,
  "provider": "local"
}
```

**POST /api/ai/rag-search**
```json
{
  "query": "Ödeme nasıl yapılır?",
  "category": "faq",
  "generateAnswer": true
}
```

---

## 🔄 n8n Workflow'ları

### Import Etme

1. n8n'e giriş yap: http://localhost:5678
2. "Import from File" butonuna tıkla
3. `n8n-workflows/` klasöründeki JSON dosyalarını import et

### Workflow'lar

1. **call-handler.json** - Ana çağrı router
2. **appointment-flow.json** - Randevu oluşturma
3. **complaint-tracker.json** - Şikayet takibi
4. **info-handler.json** - Bilgi talepleri
5. **daily-report.json** - Günlük rapor

### Webhook URL'leri

Her workflow için webhook URL'lerini yapılandırın:
- Call Handler: `http://localhost:3000/api/webhook/call`
- Diğerleri otomatik tetiklenir

---

## 🧪 Test Verisi Ekleme

### Seed Script ile

```bash
npm run seed
```

Bu script örnek müşteriler ve FAQ dokümanları oluşturur.

### Manuel

**Firebase Console'dan:**
1. `customers` collection'a git
2. "Add document" → İsim, telefon, email ekle

**API ile:**
```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Müşteri",
    "phone": "+905551234567",
    "email": "test@example.com"
  }'
```

---

## 🔧 Yapılandırma

### Environment Variables (.env.local)

```env
# Firebase (ZORUNLU)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# n8n (OPSİYONEL)
N8N_BASE_URL=http://localhost:5678

# AI Providers (OPSİYONEL)
OLLAMA_URL=http://localhost:11434
OPENAI_API_KEY=sk-...
LLM_PROVIDER=local

# Twilio (OPSİYONEL)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

### Firebase Security Rules

**Development:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Production:** Daha sıkı kurallar uygulayın!

---

## 🐛 Sorun Giderme

### Firebase Bağlantı Hatası

1. `.env.local` dosyasını kontrol edin
2. Firebase Console'da Firestore'un aktif olduğunu kontrol edin
3. Browser console'da hata mesajlarını kontrol edin

### Collections Oluşturulamıyor

1. Security Rules'un yazma izni verdiğini kontrol edin
2. Firebase Console'da Firestore'un aktif olduğunu kontrol edin
3. `.env.local` dosyasındaki config'i kontrol edin

### n8n Webhook Çalışmıyor

1. n8n'in çalıştığını kontrol edin: `docker ps`
2. Webhook URL'lerini doğrulayın
3. Network bağlantısını kontrol edin

---

## 📚 Sonraki Adımlar

1. ✅ Firebase Authentication ekle
2. ✅ Real-time updates için listener'lar ekle
3. ✅ Twilio Voice entegrasyonu
4. ✅ Vector search (RAG için)
5. ✅ Unit ve integration testler
6. ✅ Production deployment

---

**Sorularınız için:** README.md ve TODO.md dosyalarına bakın.

