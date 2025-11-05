# SmartFlow CRM v1.0.0

AI destekli çağrı yönetimi, randevu takibi, şikayet yönetimi ve müşteri hizmetleri otomasyonu platformu.

## 🎉 v1.0.0 Release

İlk stabil sürüm yayında! Bu sürüm aşağıdaki özellikleri içerir:
- ✅ Tam fonksiyonel CRM dashboard
- ✅ AI destekli intent detection
- ✅ Real-time veri senkronizasyonu (Firestore)
- ✅ Randevu yönetimi (CRUD)
- ✅ Şikayet ve ticket takibi
- ✅ Günlük raporlar
- ✅ Müşteri yönetimi
- ✅ Webhook entegrasyonu (n8n için hazır)

## 🏗️ Mimari

- **Frontend**: Next.js 16 + TypeScript + TailwindCSS + shadcn/ui
- **Backend/Automation**: n8n (self-hosted)
- **Database**: Firebase Firestore
- **AI**: Ollama (local) + OpenAI/Claude (premium)
- **Voice**: OpenAI TTS (demo), ElevenLabs (premium)
- **Communication**: Twilio (Voice/SMS/WhatsApp)

## 📁 Proje Yapısı

```
smartflow-crm/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── webhook/              # n8n webhook endpoints
│   │   ├── appointments/         # Appointment CRUD
│   │   ├── tickets/              # Ticket management
│   │   └── ai/                   # AI endpoints (intent, RAG)
│   ├── calls/                    # Calls page
│   ├── appointments/             # Appointments page
│   ├── tickets/                  # Tickets page
│   ├── complaints/               # Complaints page
│   ├── customers/                # Customers page
│   ├── reports/                  # Reports page
│   └── admin/                    # Admin settings
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   └── layout/                   # Layout components
├── lib/                          # Shared libraries
│   ├── firebase/                 # Firestore integration
│   ├── ai/                       # AI router & RAG logic
│   └── n8n/                      # n8n webhook client
├── n8n-workflows/                # n8n workflow JSON files
│   ├── call-handler.json
│   ├── appointment-flow.json
│   ├── complaint-tracker.json
│   ├── info-handler.json
│   └── daily-report.json
├── docker-compose.yml            # Docker setup
└── README.md
```

## 🚀 Kurulum

### Gereksinimler

- Node.js 20+
- Docker & Docker Compose
- Firebase project (Firestore enabled)
- (Opsiyonel) Ollama kurulumu için local LLM

### 1. Projeyi Klonlayın

```bash
cd /Users/pc/Desktop/smartflow-crm
```

### 2. Environment Variables

`.env.local` dosyası oluşturun (`.env.example` dosyasından kopyalayın):

```bash
cp .env.example .env.local
```

Firebase ve diğer servis bilgilerini doldurun. Minimum gereksinimler:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### 3. Dependencies Kurulumu

```bash
npm install
```

### 4. Development Server

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde çalışacak.

### 5. Docker Compose (n8n + Ollama)

```bash
docker-compose up -d
```

- n8n: `http://localhost:5678` (admin/changeme)
- Ollama: `http://localhost:11434`

## 📋 n8n Workflow Setup

1. n8n'e giriş yapın (`http://localhost:5678`)
2. `n8n-workflows/` klasöründeki JSON dosyalarını import edin
3. Her workflow için webhook URL'lerini yapılandırın
4. Credentials ekleyin:
   - Twilio (SMS/Voice)
   - Google Calendar OAuth
   - Slack Webhook (opsiyonel)
   - Email SMTP

### Workflow Listesi

- **call-handler**: Ana çağrı router
- **appointment-flow**: Randevu oluşturma ve Google Calendar entegrasyonu
- **complaint-tracker**: Şikayet takibi ve SLA yönetimi
- **info-handler**: Bilgi talepleri ve FAQ (RAG)
- **daily-report**: Günlük rapor oluşturma

## 🔧 Firebase Firestore Setup

### Collections

1. `customers` - Müşteri bilgileri
2. `calls` - Çağrı kayıtları
3. `appointments` - Randevular
4. `info_requests` - Bilgi talepleri
5. `complaints` - Şikayetler
6. `activity_logs` - Aktivite logları
7. `documents` - FAQ/Dokümantasyon (RAG için)

### Firestore Security Rules (Örnek)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Not**: Production için daha sıkı kurallar uygulayın!

## 🎯 Temel Özellikler

### 1. AI Call Router

- Keyword-based intent detection
- LLM fallback (Ollama/OpenAI/Claude)
- Otomatik yönlendirme (randevu/şikayet/destek)

### 2. Appointment Management

- Google Calendar entegrasyonu
- Otomatik SMS onayı
- Hatırlatma sistemi (24h ve 1h önce)

### 3. Complaint Tracking

- Otomatik ticket oluşturma
- SLA takibi (24 saat)
- Slack/Email bildirimleri

### 4. RAG FAQ System

- Dokümandan arama
- LLM ile otomatik cevap üretme
- Keyword-based relevance scoring

### 5. Dashboard

- Günlük KPI'lar
- Son aktiviteler
- Çağrı geçmişi
- Raporlar

## 📡 API Endpoints

### Webhooks (n8n için)

- `POST /api/webhook/call` - Çağrı kaydı ve intent detection
  - Body: `{ customerPhone, customerName, duration, status, intent, summary, direction }`
  - Response: `{ success, callLogId, customerId, message }`

### REST APIs

#### Appointments
- `GET /api/appointments?customerId=&status=&dateFrom=&dateTo=` - Randevu listesi
- `POST /api/appointments` - Yeni randevu
  - Body: `{ customerId, dateTime, durationMin, notes, googleCalendarEventId }`
- `PATCH /api/appointments` - Randevu güncelle
  - Body: `{ id, status, dateTime, notes, ... }`

#### Tickets (Complaints & Info Requests)
- `GET /api/tickets?type=complaint|info&customerId=&status=` - Ticket listesi
- `POST /api/tickets` - Yeni ticket
  - Body: `{ type: 'complaint'|'info', customerId, category, description, topic, details }`
- `PATCH /api/tickets` - Ticket güncelle
  - Body: `{ id, type, status, assignedTo, ... }`

#### Customers
- `GET /api/customers` - Müşteri listesi
- `POST /api/customers` - Yeni müşteri
  - Body: `{ name, phone, email, notes }`

#### Reports
- `GET /api/reports/daily?date=YYYY-MM-DD` - Günlük rapor

### AI Endpoints

- `POST /api/ai/intent` - Intent classification
  - Body: `{ text, useLLM, provider }`
  - Response: `{ intent, confidence, route }`
- `POST /api/ai/rag-search` - FAQ arama ve cevap üretme
  - Body: `{ query, category, generateAnswer, provider }`
  - Response: `{ results, answer? }`

## 🧪 Test

```bash
# Lint
npm run lint

# Build
npm run build

# Production
npm start
```

## 📝 TODO / Geliştirme Notları

- [ ] Firebase Authentication entegrasyonu
- [ ] Customer phone number ile arama geliştirme
- [ ] Vector search (Pinecone/Qdrant) RAG için
- [ ] Twilio Voice call handling (TTS/STT)
- [ ] WhatsApp Business API entegrasyonu
- [ ] Java Spring Boot microservice (opsiyonel)
- [ ] Unit ve integration testler
- [ ] E2E testler (Playwright)

## 🚢 Deployment

### Vercel (Frontend)

```bash
vercel deploy
```

### Docker Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Production için `.env.production` dosyası oluşturun ve tüm API key'leri ekleyin.

## 📞 Destek

Sorularınız için issue açabilir veya dokümantasyona bakabilirsiniz.

## 📄 Lisans

MIT

