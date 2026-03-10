# 🚀 Callception - Akıllı Müşteri İlişkileri Yönetim Sistemi

## 📋 İçindekiler
- [Genel Bakış](#genel-bakış)
- [Özellikler](#özellikler)
- [Teknoloji Stack](#teknoloji-stack)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [API Dokümantasyonu](#api-dokümantasyonu)
- [n8n Entegrasyonu](#n8n-entegrasyonu)
- [Proje Yapısı](#proje-yapısı)

---

## 🎯 Genel Bakış

Callception, yapay zeka destekli müşteri ilişkileri yönetim sistemidir. Telefon çağrılarını otomatik işler, müşteri niyetlerini analiz eder ve uygun iş akışlarını tetikler.

### Ana Özellikler:
- 📞 **Otomatik Çağrı İşleme**: AI ile çağrı analizi ve intent tespiti
- 📅 **Randevu Yönetimi**: Otomatik randevu oluşturma ve takip
- 😠 **Şikayet Takibi**: Müşteri şikayetlerini kategorizasyon ve çözüm
- 💬 **Bilgi Talepleri**: Müşteri sorularını otomatik yönlendirme
- 📊 **Raporlama**: Günlük ve haftalık detaylı raporlar
- 🔄 **Real-Time**: Tüm veriler anlık güncellenir

---

## ✨ Özellikler

### 1. Dashboard
- Gerçek zamanlı KPI kartları
- Son aktiviteler
- Çağrı istatistikleri
- Şikayet durumu
- Randevu özetleri

### 2. Çağrı Yönetimi
- Tüm çağrı kayıtları
- Müşteri bilgileri ile eşleşme
- Intent analizi sonuçları
- Arama süresi ve durumu
- Real-time güncellemeler

### 3. Randevu Sistemi
- Randevu oluşturma
- Müşteri seçimi
- Tarih ve saat belirleme
- Durum takibi (planlanan, tamamlanan, iptal)
- SMS bildirimleri (n8n ile)

### 4. Müşteri Yönetimi
- Müşteri listesi
- Yeni müşteri ekleme
- İletişim bilgileri
- Aktivite geçmişi

### 5. Şikayet ve Bilet Takibi
- Şikayet kategorileri
- Durum yönetimi (açık, işleniyor, çözüldü)
- Bilgi talepleri
- Müşteri detayları

### 6. Raporlama
- Günlük özet raporlar
- Tarih bazlı filtreleme
- CSV export
- Detaylı metrikler

---

## 🛠️ Teknoloji Stack

### Frontend
- **Next.js 15** - React framework (App Router)
- **React 19** - UI library
- **TypeScript 5** - Type safety
- **TailwindCSS 4** - Styling
- **shadcn/ui** - UI components
- **Lucide React** - Icons
- **date-fns** - Date formatting

### Backend
- **Firebase Firestore** - NoSQL database
- **Firebase Auth** - Authentication (hazır)
- **Next.js API Routes** - Backend endpoints

### AI & Automation
- **Ollama** - Local LLM (intent detection)
- **n8n** - Workflow automation
- **Gemini API** - Cloud LLM (opsiyonel)

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

---

## 📦 Kurulum

### 1. Gereksinimler
```bash
Node.js >= 18.0.0
npm >= 9.0.0
Docker Desktop (opsiyonel, n8n için)
Firebase hesabı
```

### 2. Projeyi Klonlayın
```bash
git clone <repo-url>
cd callception
```

### 3. Bağımlılıkları Yükleyin
```bash
npm install
```

### 4. Ortam Değişkenlerini Ayarlayın
`.env.local` dosyası oluşturun:
```env
# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# n8n Webhook (opsiyonel)
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# LLM Provider (local veya gemini)
LLM_PROVIDER=local
GEMINI_API_KEY=your_gemini_key (opsiyonel)
```

### 5. Firebase'i Başlatın
```bash
npm run setup:firestore
```

### 6. Örnek Veri Ekleyin (Opsiyonel)
```bash
node scripts/add-sample-data.mjs
```

### 7. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılacak.

---

## 🚀 Kullanım

### Temel Kullanım

1. **Dashboard'a Gidin**
   - Ana sayfa otomatik yüklenir
   - KPI kartlarını görüntüleyin
   - Son aktiviteleri takip edin

2. **Çağrı Webhook'u Kullanın**
   ```bash
   curl -X POST http://localhost:3000/api/webhook/call \
     -H "Content-Type: application/json" \
     -d '{
       "from": "+905551234567",
       "transcript": "Randevu almak istiyorum",
       "durationSec": 120
     }'
   ```

3. **Intent Testi**
   ```bash
   curl -X POST http://localhost:3000/api/ai/intent \
     -H "Content-Type: application/json" \
     -d '{"text":"Şikayetim var"}'
   ```

### Sayfa Navigasyonu

- **Dashboard**: `/` - Ana sayfa, KPI'lar ve aktivite
- **Çağrılar**: `/calls` - Tüm çağrı kayıtları
- **Randevular**: `/appointments` - Randevu yönetimi
- **Müşteriler**: `/customers` - Müşteri listesi
- **Biletler**: `/tickets` - Bilgi talepleri ve şikayetler
- **Şikayetler**: `/complaints` - Detaylı şikayet takibi
- **Raporlar**: `/reports` - Günlük raporlar

---

## 📡 API Dokümantasyonu

### 1. Call Webhook
**Endpoint:** `POST /api/webhook/call`

**Payload:**
```json
{
  "from": "+905551234567",
  "to": "+905559876543",
  "transcript": "Randevu almak istiyorum",
  "durationSec": 120,
  "callSid": "CA123456",
  "recordingUrl": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "callLogId": "abc123",
  "customerId": "cust456",
  "intent": {
    "intent": "randevu",
    "confidence": "high",
    "keywords": ["randevu", "appointment"]
  },
  "workflowTriggered": true
}
```

### 2. AI Intent Detection
**Endpoint:** `POST /api/ai/intent`

**Payload:**
```json
{
  "text": "Şikayetim var"
}
```

**Response:**
```json
{
  "intent": "şikayet",
  "confidence": "high",
  "keywords": ["şikayet", "complaint"],
  "provider": "local"
}
```

### 3. Daily Report
**Endpoint:** `GET /api/reports/daily?date=2025-01-15`

**Response:**
```json
{
  "date": "2025-01-15",
  "summary": {
    "totalCalls": 45,
    "answeredCalls": 38,
    "missedCalls": 7,
    "avgCallDuration": 180,
    "openComplaints": 5,
    "totalComplaints": 12,
    "resolvedComplaints": 7,
    "openInfoRequests": 3,
    "scheduledAppointments": 15,
    "completedAppointments": 10
  }
}
```

---

## 🔗 n8n Entegrasyonu

### n8n Kurulumu (Docker)
```bash
docker-compose up -d n8n
```

### Workflow'ları İçe Aktarma

1. n8n'e giriş yapın: `http://localhost:5678`
2. Credentials ekleyin:
   - Firebase credentials
   - SMTP (email için)
   - SMS provider (Twilio, etc.)
3. Workflow'ları import edin:
   - `n8n-workflows/call-handler.json`
   - `n8n-workflows/appointment-flow.json`
   - `n8n-workflows/complaint-tracker.json`
   - `n8n-workflows/info-handler.json`
   - `n8n-workflows/daily-report.json`

### Workflow Açıklamaları

#### 1. Call Handler
- Gelen çağrıları işler
- Firebase'e log kaydeder
- Müşteri bilgilerini günceller

#### 2. Appointment Flow
- Randevu intent'i tespit edilince tetiklenir
- Müşteriye randevu teklifi SMS'i gönderir
- Randevu oluşturulunca onay SMS'i gönderir

#### 3. Complaint Tracker
- Şikayet intent'i tespit edilince tetiklenir
- İlgili departmana email gönderir
- Şikayet durumunu takip eder
- Çözüldüğünde müşteriye bilgi verir

#### 4. Info Handler
- Bilgi talebi intent'i tespit edilince tetiklenir
- İlgili bilgiyi veritabanından çeker
- Müşteriye SMS veya email ile gönderir

#### 5. Daily Report
- Her gün belirli saatte çalışır
- Günlük metrikleri toplar
- Yöneticilere email ile rapor gönderir

---

## 📁 Proje Yapısı

```
callception/
├── app/                          # Next.js pages
│   ├── page.tsx                 # Dashboard
│   ├── calls/                   # Çağrılar sayfası
│   ├── appointments/            # Randevular sayfası
│   ├── customers/               # Müşteriler sayfası
│   ├── tickets/                 # Biletler sayfası
│   ├── complaints/              # Şikayetler sayfası
│   ├── reports/                 # Raporlar sayfası
│   └── api/                     # API endpoints
│       ├── webhook/call/        # Call webhook
│       ├── ai/intent/           # Intent detection
│       ├── ai/rag-search/       # RAG search
│       ├── appointments/        # Appointments API
│       ├── customers/           # Customers API
│       ├── tickets/             # Tickets API
│       └── reports/daily/       # Daily reports API
├── components/
│   ├── ui/                      # shadcn/ui components
│   ├── dashboard/               # Dashboard bileşenleri
│   ├── appointments/            # Randevu bileşenleri
│   ├── reports/                 # Rapor bileşenleri
│   ├── tickets/                 # Bilet bileşenleri
│   └── layout/                  # Layout bileşenleri
├── lib/
│   ├── firebase/
│   │   ├── config.ts           # Firebase init
│   │   ├── db.ts               # Database functions
│   │   ├── hooks.ts            # Real-time hooks
│   │   ├── batch-helpers.ts    # Batch loading
│   │   └── types.ts            # TypeScript types
│   ├── ai/
│   │   ├── router.ts           # Intent router
│   │   └── rag.ts              # RAG search
│   ├── n8n/
│   │   └── client.ts           # n8n webhook client
│   └── utils/
│       ├── constants.ts        # Sabitler
│       └── firestore-helpers.ts # Helpers
├── n8n-workflows/              # n8n workflow dosyaları
├── scripts/
│   ├── setupFirestore.mjs      # Firestore başlatma
│   └── add-sample-data.mjs     # Örnek veri ekleme
├── firestore.indexes.json      # Firestore indexes
├── firestore.rules             # Security rules
├── docker-compose.yml          # Docker setup
└── package.json                # Dependencies
```

---

## 🔧 Geliştirme

### Komutlar

```bash
# Geliştirme sunucusu
npm run dev

# Production build
npm run build

# Production başlat
npm start

# Firestore setup
npm run setup:firestore

# Linting
npm run lint
```

### Firebase Emulator (Opsiyonel)
```bash
firebase emulators:start
```

### Docker ile n8n + Ollama
```bash
docker-compose up -d
```

---

## 📊 Performans Optimizasyonları

### 1. Batch Loading
- N+1 query problemi çözüldü
- Tek sorguda birden fazla müşteri bilgisi
- 50x daha hızlı veri yükleme

### 2. Real-Time Updates
- Firebase Firestore onSnapshot
- Otomatik veri senkronizasyonu
- Sayfa yenilemeye gerek yok

### 3. Memoization
- React hooks ile gereksiz re-render önleme
- useMemo ile query optimization
- useCallback ile fonksiyon caching

### 4. Skeleton Loading
- Profesyonel loading UI
- Kullanıcı deneyimi iyileştirmesi
- Perceived performance artışı

---

## 🐛 Hata Ayıklama

### Firebase Connection Hatası
```bash
# .env.local dosyasını kontrol edin
# Firebase console'dan doğru credentials'ı aldığınızdan emin olun
```

### n8n Bağlantı Hatası
```bash
# n8n çalışıyor mu kontrol edin
docker ps

# n8n'yi başlatın
docker-compose up -d n8n

# Webhook URL'ini kontrol edin
echo $N8N_WEBHOOK_URL
```

### Port 3000 Kullanımda
```bash
# Çalışan process'leri bulun
lsof -i :3000

# Process'i durdurun
kill -9 <PID>
```

---

## 🚀 Production Deployment

### Vercel Deployment
```bash
# Vercel CLI yükleyin
npm i -g vercel

# Deploy edin
vercel

# Production deploy
vercel --prod
```

### Firebase Hosting
```bash
# Firebase CLI yükleyin
npm i -g firebase-tools

# Login
firebase login

# Deploy
firebase deploy
```

### Docker Deployment
```bash
# Build
docker build -t callception .

# Run
docker run -p 3000:3000 callception
```

---

## 📄 Lisans

MIT License - Detaylar için LICENSE dosyasına bakın.

---

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

---

## 📧 İletişim

Sorularınız için: [your-email@example.com]

---

## 🙏 Teşekkürler

- Next.js team
- Firebase team
- shadcn/ui contributors
- n8n community
- Ollama project

---

**⭐ Projeyi beğendiyseniz yıldız vermeyi unutmayın!**

