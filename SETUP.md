# 🚀 SmartFlow CRM - Hızlı Kurulum Kılavuzu

## ⚡ Hızlı Başlangıç

### 1. Environment Variables Ayarlama

`.env.local` dosyası oluşturun:

```bash
cp .env.example .env.local
```

**ÖNEMLİ**: Firebase config bilgilerinizi `.env.local` dosyasına ekleyin:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 2. Dependencies Kurulumu

```bash
npm install
```

### 3. Development Server Başlatma

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000` adresini açın.

### 4. n8n Kurulumu (Opsiyonel)

Docker Compose ile:

```bash
docker-compose up -d n8n
```

n8n'e erişim: `http://localhost:5678`
- Kullanıcı: `admin`
- Şifre: `changeme` (değiştirin!)

Workflow'ları import edin:
1. n8n dashboard'a gidin
2. `n8n-workflows/` klasöründeki JSON dosyalarını import edin

### 5. Ollama Kurulumu (AI için)

Local LLM için:

```bash
docker-compose up -d ollama
```

Model indirme:
```bash
docker exec -it smartflow-crm-ollama-1 ollama pull llama3.2
```

## 📋 Firebase Firestore Setup

### Collections Oluşturma

Firebase Console'dan aşağıdaki collections'ları oluşturun:

- `customers`
- `calls`
- `info_requests`
- `complaints`
- `appointments`
- `activity_logs`
- `documents`

### Security Rules (Development)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // ⚠️ Sadece development için!
    }
  }
}
```

**Production için mutlaka güvenlik kuralları ekleyin!**

## 🧪 Test Etme

### API Endpoint Test

```bash
# Intent detection test
curl -X POST http://localhost:3000/api/ai/intent \
  -H "Content-Type: application/json" \
  -d '{"text": "Randevu almak istiyorum"}'

# RAG search test
curl -X POST http://localhost:3000/api/ai/rag-search \
  -H "Content-Type: application/json" \
  -d '{"query": "Ödeme nasıl yapılır?"}'
```

### Webhook Test (n8n için)

```bash
curl -X POST http://localhost:3000/api/webhook/call \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+905551234567",
    "transcript": "Merhaba, randevu almak istiyorum",
    "durationSec": 120
  }'
```

## 📱 n8n Workflow Entegrasyonu

Her workflow için webhook URL'lerini yapılandırın:

1. **Call Handler**: `http://localhost:3000/api/webhook/call`
2. **Appointment Flow**: Otomatik tetiklenir (call handler'dan)
3. **Complaint Tracker**: Otomatik tetiklenir
4. **Info Handler**: Otomatik tetiklenir
5. **Daily Report**: Cron ile günlük çalışır

## 🔧 Yaygın Sorunlar

### Firebase Bağlantı Hatası

- Firebase config değişkenlerini kontrol edin
- Firestore'un aktif olduğundan emin olun
- CORS ayarlarını kontrol edin

### n8n Webhook Çalışmıyor

- n8n'in çalıştığını kontrol edin: `http://localhost:5678`
- Webhook URL'lerini doğrulayın
- Network connectivity kontrol edin

### AI Intent Detection Çalışmıyor

- Ollama'nın çalıştığını kontrol edin
- Model'in indirildiğinden emin olun: `ollama pull llama3.2`
- Alternatif: OpenAI API key ekleyin (premium)

## 📚 Sonraki Adımlar

1. ✅ Firebase Authentication ekle
2. ✅ Twilio Voice entegrasyonu
3. ✅ Google Calendar OAuth
4. ✅ Vector search (RAG için Pinecone/Qdrant)
5. ✅ Unit ve integration testler
6. ✅ Production deployment

## 💡 İpuçları

- İlk test için Firebase Emulator kullanabilirsiniz
- n8n workflow'larını test modunda çalıştırın
- AI provider'ları .env'de kolayca değiştirebilirsiniz
- Dashboard'da gerçek zamanlı veri için Firestore listener'ları ekleyin

## 🆘 Destek

Sorun yaşarsanız:
1. Console loglarını kontrol edin
2. Network tab'ını inceleyin
3. Firebase Console'da Firestore'u kontrol edin
4. n8n execution log'larına bakın

