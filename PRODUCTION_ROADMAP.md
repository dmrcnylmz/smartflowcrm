# SmartFlow CRM — Production Çıkış Yol Haritası

> **Tarih:** 10 Şubat 2026  
> **Hedef:** Şirketlere özel, Türkçe/İngilizce sesli AI müşteri temsilcisi  
> **Build:** ✅ 27 route, 66 test, 0 hata  

---

## 🎯 Vizyon

Her bir şirket müşterisine özel eğitilmiş bir sesli AI asistanı sunmak. Bu asistan:
- Şirketin gerçek bir çalışanıymış gibi konuşur
- Sadece şirketin bilgi tabanını kullanarak cevap verir (halüsinasyon yok)
- Türkçe ve İngilizce doğal konuşma yapar
- Randevu, şikayet, bilgi talebi gibi iş akışlarını otomatik tetikler
- Çağrı transkriptini kaydeder ve CRM'e yazar

---

## 🏗️ Mimari: Üç Katmanlı Ses Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    KULLANICI (Telefon)                    │
│                    Müşteri arama yapar                    │
└───────────────────┬─────────────────────────────────────┘
                    │ WebSocket / SIP
                    ▼
┌─────────────────────────────────────────────────────────┐
│               KATMAN 1: STT (Speech-to-Text)            │
│                                                          │
│  Seçenek A: Deepgram Nova-3 (Türkçe, <300ms)            │
│  Seçenek B: Google Cloud Speech Chirp 3                  │
│  Seçenek C: ElevenLabs Scribe v2 (<150ms)               │
│                                                          │
│  → Streaming transkripsiyon (gerçek zamanlı)             │
│  → Türkçe + İngilizce otomatik dil algılama             │
└───────────────────┬─────────────────────────────────────┘
                    │ Metin
                    ▼
┌─────────────────────────────────────────────────────────┐
│              KATMAN 2: LLM + RAG (Beyin)                │
│                                                          │
│  ┌──────────────────────────────────────┐               │
│  │  RAG: Şirket Bilgi Tabanı           │               │
│  │  - Firestore "documents" koleksiyonu │               │
│  │  - Vektör embedding (Pinecone/pgv.) │               │
│  │  - Ürün/hizmet katalogları          │               │
│  │  - SSS dokümanları                  │               │
│  │  - Fiyat listeleri                  │               │
│  │  - Şirket politikaları              │               │
│  └──────────────┬───────────────────────┘               │
│                 │                                        │
│  ┌──────────────▼───────────────────────┐               │
│  │  LLM: GPT-4o / GPT-4.1              │               │
│  │  + Şirket System Prompt             │               │
│  │  + RAG bağlamı                      │               │
│  │  + Konuşma geçmişi                  │               │
│  │  + Tool calling (randevu/şikayet)   │               │
│  └──────────────┬───────────────────────┘               │
│                 │                                        │
│  Guardrails:                                            │
│  ✓ Sadece bilgi tabanından cevap ver                    │
│  ✓ Emin değilsen "kontrol edeyim" de                    │
│  ✓ Rakip firmaları asla önerme                          │
│  ✓ Fiyat/taahhüt verme (yetkili değilsen)               │
│  ✓ Kişisel veri paylaşma                               │
└───────────────────┬─────────────────────────────────────┘
                    │ Yanıt metni
                    ▼
┌─────────────────────────────────────────────────────────┐
│               KATMAN 3: TTS (Text-to-Speech)            │
│                                                          │
│  Seçenek A: ElevenLabs Flash v2.5 (~75ms TTFB)          │
│  Seçenek B: Deepgram Aura-2 (<200ms TTFB)              │
│  Seçenek C: Google Cloud Chirp 3 HD                     │
│                                                          │
│  → Streaming ses çıkışı (chunk-based)                   │
│  → Şirkete özel ses tonu / voice cloning                │
│  → Türkçe doğal vurgu ve tonlama                        │
└───────────────────┬─────────────────────────────────────┘
                    │ Ses
                    ▼
┌─────────────────────────────────────────────────────────┐
│                    KULLANICI (Telefon)                    │
│                  Cevabı duyar, konuşma devam eder        │
└─────────────────────────────────────────────────────────┘
```

---

## ⚠️ Önümüze Çıkabilecek Engeller ve Çözümleri

### 1. 🔴 Latency (Gecikme) — En Kritik
**Problem:** STT + LLM + TTS zinciri toplam 2-3 saniye gecikmeli olabilir. İnsan konuşmasında 200-500ms'den fazla bekleme doğal dışı hisseder.

**Çözümler:**
- **Streaming her katmanda**: STT → LLM → TTS hepsinde streaming kullan. LLM ilk token'ı ürettiğinde TTS'e gönder
- **Cümle bazlı TTS**: Tam cevabı bekleme, ilk cümle hazır olunca sesi başlat
- **Ortak cümle ön-bellekleme**: "Bir saniye bakıyorum", "Randevunuzu kontrol edeyim" gibi sık cümleleri önceden seslendir
- **Hedef:** End-to-end <800ms (1. cümle)

### 2. 🔴 Halüsinasyon (Uydurma Bilgi)
**Problem:** LLM gerçek olmayan bilgiler üretebilir. Müşteriye yanlış fiyat/tarih vermek itibar kaybı yaratır.

**Çözümler:**
- **RAG-only yanıt**: LLM'e "SADECE sana verilen bağlamdan cevap ver" talimatı
- **Confidence threshold**: RAG skoru düşükse otomatik "Bu konuda kesin bilgi veremiyorum, sizi yetkili birime bağlıyorum"
- **Guardrail fonksiyonları**: Fiyat, sözleşme, taahhüt içeren yanıtlarda otomatik insan devir
- **Cevap doğrulama**: İkinci bir LLM çağrısı ile "bu cevap verilen bağlamla tutarlı mı?" kontrolü

### 3. 🟡 Türkçe Kalitesi
**Problem:** Türkçe STT/TTS kalitesi İngilizce'ye göre zayıf olabilir. Ağız/lehçe farklılıkları tanıma doğruluğunu düşürür.

**Çözümler:**
- **Provider benchmark**: Deepgram Nova-3 vs ElevenLabs Scribe v2 vs Google Chirp 3 → Türkçe WER karşılaştırma testi yapılacak
- **Custom vocabulary**: Sektöre özel terimler (medikal, hukuk, sigorta) için özel kelime listeleri
- **Fallback mekanizması**: STT güven skoru düşükse "Sizi tam anlayamadım, tekrar eder misiniz?" yanıtı

### 4. 🟡 Barge-in (Araya Girme)
**Problem:** Asistan konuşurken müşteri araya girerse, asistanın susması ve yeni girdiyi işlemesi gerekir.

**Çözümler:**
- **VAD (Voice Activity Detection)**: Kullanıcı sesi algılandığında TTS oynatmayı anında durdur
- **WebSocket kontrol mesajı**: `{action: "interrupt"}` ile mevcut yanıtı iptal et
- **Bağlam koruması**: Yarım kalan yanıtı konuşma geçmişine kaydet

### 5. 🟡 Çoklu Firma Yönetimi (Multi-tenant)
**Problem:** Her firma farklı bilgi tabanı, farklı ses tonu, farklı iş akışları istiyor.

**Çözümler:**
- **Tenant ID bazlı yapılandırma**: Firestore'da her firma için `tenants/{tenantId}` koleksiyonu
- **Dinamik system prompt**: Firma bilgileri + RAG bağlamı çağrı başında yüklenir
- **Ayrık bilgi tabanları**: Her firma kendi `documents` alt koleksiyonuna sahip
- **Voice cloning per tenant**: ElevenLabs'da firma başına özel ses profili

### 6. 🟢 Maliyet Kontrolü
**Problem:** STT + LLM + TTS her çağrı için API maliyeti oluşturur. Yoğun kullanımda maliyet hızla artar.

**Çözümler:**
- **Cache katmanı**: Sık sorulan sorular için önbellek (aynı soruya LLM çağırmadan cevap)
- **Token optimizasyonu**: System prompt'u kısa tut, gereksiz bağlam ekleme
- **Dakika bazlı fiyatlandırma**: Kullanıcılara dakika paketi sat
- **İzleme dashboard'u**: Firma bazında kullanım takibi

---

## 📋 Uygulama Fazları

### FAZ 1: Ses Pipeline Altyapısı (1-2 hafta)
**Hedef:** STT → LLM → TTS zincirini çalışır hale getirmek

| # | İş | Dosya/Modül | Detay |
|---|-----|-------------|-------|
| 1.1 | STT Provider entegrasyonu | `lib/voice/stt-provider.ts` | Deepgram/ElevenLabs streaming API |
| 1.2 | TTS Provider entegrasyonu | `lib/voice/tts-provider.ts` | ElevenLabs/Deepgram streaming TTS |
| 1.3 | LLM entegrasyonu | `lib/ai/llm-provider.ts` | OpenAI GPT-4o streaming yanıt |
| 1.4 | Pipeline orchestrator | `lib/voice/voice-pipeline.ts` | STT→LLM→TTS akışını yöneten ana modül |
| 1.5 | WebSocket gateway upgrade | `personaplex_server/server.py` | Gerçek ses işleme (mock'tan çıkış) |
| 1.6 | Latency benchmark | `tests/voice-latency.test.ts` | End-to-end gecikme ölçümü |

### FAZ 2: RAG & Bilgi Tabanı (1 hafta)
**Hedef:** Şirket bilgileriyle grounding, halüsinasyon önleme

| # | İş | Dosya/Modül | Detay |
|---|-----|-------------|-------|
| 2.1 | Vektör embedding | `lib/ai/embeddings.ts` | OpenAI ada-002 veya Cohere embed |
| 2.2 | Vektör veritabanı | Pinecone / Firestore | Semantik arama için vektör index |
| 2.3 | RAG pipeline upgrade | `lib/ai/rag.ts` | Keyword → Vektör arama geçişi |
| 2.4 | Bilgi tabanı yönetim UI | `app/admin/knowledge/page.tsx` | Doküman yükleme/düzenleme arayüzü |
| 2.5 | Guardrail sistemi | `lib/ai/guardrails.ts` | Cevap doğrulama + güvenlik kontrolleri |

### FAZ 3: Firma Asistanı Sistemi (1-2 hafta)
**Hedef:** Şirket elemanı gibi konuşan, doğal asistan

| # | İş | Dosya/Modül | Detay |
|---|-----|-------------|-------|
| 3.1 | Tenant (firma) yapısı | `lib/firebase/types.ts` | `Tenant` tipi: firma bilgileri, ayarlar |
| 3.2 | Dinamik system prompt | `lib/ai/prompt-builder.ts` | Firma bilgisi + RAG + persona = final prompt |
| 3.3 | Şirket onboarding akışı | `app/admin/tenants/page.tsx` | Yeni firma ekleme, bilgi girişi |
| 3.4 | Ses profili yönetimi | `lib/voice/voice-profiles.ts` | ElevenLabs voice cloning per tenant |
| 3.5 | Dil algılama + geçiş | `lib/voice/language-detect.ts` | TR↔EN otomatik algılama ve yanıt |
| 3.6 | Tool calling entegrasyonu | `lib/ai/tools/` | randevu_al, sikayet_kaydet, bilgi_sorgula |

### FAZ 4: n8n İş Akışları (1 hafta)
**Hedef:** AI çağrı sonuçlarını CRM aksiyonlarına dönüştür

| # | İş | Detay |
|---|-----|-------|
| 4.1 | Call handler workflow | Çağrı tamamlandığında → transkript kaydet, intent çıkar |
| 4.2 | Randevu workflow | AI randevu aldığında → Firestore'a yaz, takvime ekle |
| 4.3 | Şikayet workflow | Şikayet tespit edildiğinde → bilet oluştur, yöneticiye bildir |
| 4.4 | Eskalasyon workflow | AI çözemezse → insan operatöre aktarma |
| 4.5 | Günlük rapor | Her gün → çağrı istatistikleri, intent dağılımı raporla |

### FAZ 5: Production Hardening (1 hafta)
**Hedef:** Canlı ortama hazırlık

| # | İş | Detay |
|---|-----|-------|
| 5.1 | Cloud GPU deploy | RunPod/Lambda Labs → Personaplex sunucu |
| 5.2 | Cloudflare Tunnel | Güvenli WSS erişimi |
| 5.3 | Firebase Admin auth | ✅ TAMAMLANDI (verifyTokenStrict) |
| 5.4 | E2E test suite | Playwright → tüm kullanıcı akışları |
| 5.5 | CI/CD pipeline | GitHub Actions → test, build, deploy |
| 5.6 | Monitoring & alerting | Uptime, latency, error rate izleme |
| 5.7 | Cost tracking | Provider bazında dakika/maliyet takibi |

---

## 🧠 System Prompt Mimarisi

Asistanın "gerçek eleman gibi" konuşması için 4 katmanlı prompt yapısı:

```
┌──────────────────────────────────────────┐
│  KATMAN 1: Temel Kişilik (Sabit)        │
│  "Sen ... firmasının müşteri            │
│   temsilcisi Ayşe'sin. Nazik,           │
│   profesyonel, çözüm odaklısın."        │
├──────────────────────────────────────────┤
│  KATMAN 2: Firma Bilgisi (Tenant'tan)   │
│  "Firma: ABC Sigorta                    │
│   Sektör: Sigorta                       │
│   Çalışma saatleri: 09:00-18:00         │
│   Hizmetler: Kasko, Trafik, Sağlık"    │
├──────────────────────────────────────────┤
│  KATMAN 3: RAG Bağlamı (Dinamik)        │
│  [Her soru için ilgili dokümanlar]      │
│  "Kasko fiyatları: ..."                 │
│  "İptal politikası: ..."               │
├──────────────────────────────────────────┤
│  KATMAN 4: Guardrails (Sabit)           │
│  "ASLA uydurma bilgi verme.            │
│   Bilmiyorsan 'kontrol edeyim' de.      │
│   Fiyat taahhüdü verme.                │
│   Rakip firma önerme."                  │
└──────────────────────────────────────────┘
```

---

## 🔑 Teknoloji Seçim Matrisi

| Katman | Birincil Seçim | Yedek | Neden |
|--------|---------------|-------|-------|
| **STT** | Deepgram Nova-3 | Google Chirp 3 | Türkçe WER en düşük, <300ms |
| **LLM** | OpenAI GPT-4o | GPT-4.1 | Tool calling + streaming + Türkçe kalite |
| **TTS** | ElevenLabs Flash v2.5 | Deepgram Aura-2 | 75ms TTFB, doğal Türkçe ses |
| **Vektör DB** | Pinecone | Firestore + pgvector | Ücretsiz tier + hızlı arama |
| **Embedding** | OpenAI text-embedding-3-small | Cohere embed-v3 | Düşük maliyet, yüksek kalite |
| **Workflow** | n8n Cloud | Self-hosted n8n | Zaten kurulu: candem.app.n8n.cloud |
| **GPU** | RunPod A40 | Lambda Labs | On-demand, Docker support |
| **Edge/CDN** | Cloudflare Tunnel | Ngrok | Üretim grade güvenlik |

---

## 📊 Başarı Metrikleri

| Metrik | Hedef | Ölçüm |
|--------|-------|-------|
| İlk yanıt süresi | <800ms | STT→LLM→TTS ilk ses çıkışı |
| STT doğruluğu (Türkçe) | >92% | WER ölçümü |
| Halüsinasyon oranı | <2% | Rastgele 100 çağrı audit |
| Müşteri memnuniyeti | >4.2/5 | Çağrı sonu anket |
| Çözüm oranı (insan devir olmadan) | >70% | Eskalasyon takibi |
| Uptime | >99.5% | Monitoring |

---

## 🚀 Hemen Başlanabilecek İlk Adım

**FAZ 1.1 — STT Provider Entegrasyonu**

Bu, tüm pipeline'ın temel taşı. Bir STT provider'ı (Deepgram veya ElevenLabs) bağlayıp gerçek zamanlı Türkçe transkripsiyon alabildiğimiz anda, geri kalan zincir (LLM + TTS) üstüne eklenir.

Gerekli API key'ler:
1. ✅ Firebase — Hazır
2. ✅ Personaplex — Hazır  
3. ✅ n8n — Hazır
4. ❓ OpenAI API key — Gerekli (LLM + Embedding)
5. ❓ Deepgram veya ElevenLabs API key — Gerekli (STT + TTS)
