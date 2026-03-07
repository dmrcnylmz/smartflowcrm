# CALLCEPTION Lansman Duyurusu

> Asagidaki metin, web sitesi, sosyal medya, e-posta ve yatirimci sunumlari icin hazirlanmis modüler bir duyurudur. Ihtiyaca gore bolumler secilerek kullanilabilir.

---

## Kisa Tanitim (Elevator Pitch)

**Callception**, isletmelerin telefon cagrilarini yapay zeka ile yoneten ilk Turkiye merkezli AI cagri merkezi platformudur. Gelen cagralarinizi 350ms-1100ms arasi yanit suresiyle, gercek bir insan gibi konusan Turkce AI asistanla karsilayin — 7/24, tatil gunleri dahil.

---

## Ana Duyuru Metni

### Cagri Merkezinizi Yapay Zekayla Donusturun

Musterileriniz aradigi anda cevap veremeyen bir isletme, her gun gelir kaybediyor. Callception, bu sorunu kokundan cozuyor.

**Ne Yapiyoruz?**

Telefonunuz caldiginda, Callception'in AI sesli asistani devreye girer:
- Musteri ne istedigini soyler (Turkce dogal dil anlama)
- Yapay zeka bilgi tabaninizdan dogru cevabi bulur
- Dogal ve akici Turkce sesle cevap verir
- Randevu olusturur, sikayet kaydeder, bilgi verir

Tum bunlar **ortalama 1 saniyenin altinda** gerceklesir.

**Nasil Calisir?**

1. **Dinler** — Deepgram STT ile Turkce konusmayi yazi ya cevirir (< 1.2s)
2. **Dusunur** — Groq LLM ile bilgi tabaninizi tarayip en dogru cevabi uretir (< 0.5s)
3. **Cevaplar** — ElevenLabs TTS ile dogal Turkce sesle konusur (< 0.8s)

Toplam: Musteriniz sorusunu sorar, 1-2 saniye icinde profesyonel bir cevap alir.

---

## Teknik Ustunlukler

### Ultra-Dusuk Latency
Ses pipeline'imiz 350ms-1100ms arasi uctan uca yanit suresi sunar. Karsilastirma: Tipik AI cagri merkezleri 3-8 saniye arasi bekletir. Callception'da musteri "yapay zekayla konustugunu hissetmez."

### Hibrit Telefon Altyapisi
Turkiye'de yerel SIP trunk operatoru ile entegrasyon, uluslararasi numaralar icin Twilio destegi. Sonuc: Turk musteriler icin yerel numara ve yerel fiyatlandirma, global olceklendirme imkani.

| Ozellik | SIP Trunk (TR) | Twilio (Global) |
|---------|----------------|-----------------|
| Numara | +90 5XX / 0XXX | +1, +44, +49... |
| Maliyet | $0.003/dk | $0.01/dk |
| Kapsam | Turkiye | 100+ ulke |

### Coklu AI Motor Destegi
Tek bir provider'a bagimli degilsiniz:
- **LLM:** Groq (hizli) > Gemini > OpenAI (fallback)
- **STT:** Deepgram (birincil)
- **TTS:** ElevenLabs Turbo v2 (birincil), OpenAI TTS (fallback)

Bir provider cokerse circuit breaker otomatik olarak digerine gecer. Sifir kesinti.

### Akilli Maliyet Yonetimi
- Gercek zamanli TTS karakter kullanim takibi
- %80 ve %95 esiklerinde otomatik uyari
- Acil Durum Modu: Butce limitine yaklasinca ucuz TTS'e otomatik gecis
- Cagri basina maliyet: ~$0.05-0.15 (3 dakikalik bir cagri)

---

## Paketler ve Fiyatlandirma

| Paket | Aylik | Icerigi |
|-------|-------|---------|
| **Starter** | $49/ay | 500 dk dahil, 1 AI asistan, temel raporlama |
| **Professional** | $149/ay | 2000 dk dahil, 5 AI asistan, gelismis analitik |
| **Enterprise** | $399/ay | 10000 dk dahil, sinirsiz asistan, ozel entegrasyon |

Yillik odemede %20 indirim. 14 gun ucretsiz deneme suresi.

---

## Hedef Kitle Mesajlari

### Kucuk Isletmeler (Doktor, Avukat, Kuafor, Restoran)
> Siz mesgulken telefonunuz calmasin. Callception, musterinizi karsilar, randevunuzu olusturur, siz isinize odaklanin. Aylik 49 dolarla kendi AI sekretiniz olsun.

### Orta Olcekli Isletmeler (E-ticaret, Servis, Sigorta)
> Cagri merkezi maliyetlerinizi %70'e kadar dusurun. Callception'in AI asistanlari 7/24 calisir, hasta olmaz, mola vermez. Musterinize her zaman ayni kalitede hizmet sunun.

### Teknik Karar Vericiler (CTO/IT Yoneticisi)
> Turkiye'de yerel SIP trunk, global Twilio entegrasyonu. Groq + OpenAI + Gemini LLM fallback chain. Deepgram STT + ElevenLabs TTS. API-first mimari, webhook destegi, tam tenant izolasyonu. Vercel Edge'de calisan Next.js 15 uzerinde insa edildi.

---

## Sosyal Medya Postlari

### LinkedIn
> Callception'i duyurmaktan heyecan duyuyoruz.
>
> Isletmelerin telefon cagrilarini yapay zeka ile yoneten ilk Turkiye merkezli platform.
>
> Temel ozellikler:
> - 350ms-1100ms yanit suresi (sektorun en hizlisi)
> - Turkce dogal konusma
> - 7/24 kesintisiz hizmet
> - Yerel TR numara + global kapsam
>
> 14 gun ucretsiz deneyin: callception.com

### Twitter/X
> Cagri merkezinizi AI'ya emanet edin.
>
> Callception: Turkce konusan yapay zeka asistan.
> 1 saniyenin altinda yanit. 7/24 aktif.
>
> callception.com

---

## E-posta (Davet)

**Konu:** Cagri merkeziniz artik uyumuyor

Merhaba [ISIM],

Isletmenizin kacirilmis cagrilarini dusunun. Her biri bir kayip musteri, bir kayip gelir.

Callception, telefonunuza cevap veren yapay zeka asistandir:
- Turkce dogal konusan ses
- Ortalama 1 saniyede yanit
- Randevu olusturma, sikayet kaydi, bilgi verme
- 7/24 aktif, tatil gunleri dahil

14 gun ucretsiz deneyin — kredi karti gerekmez.

[BASLAYALIM] butonu → callception.com/onboarding

Sorulariniz icin bize ulasin.

Callception Ekibi

---

## Basin Bulteni (Kisa)

**CALLCEPTION, TURKIYE'NIN ILK AI CAGRI MERKEZI PLATFORMUNU DUYURDU**

Istanbul, Turkiye — Callception, isletmelerin gelen telefon cagrilarini yapay zeka ile yoneten SaaS platformunu kullanilamabasladi. Platform, Turkce dogal dil isleme ve ses sentezi teknolojilerini birlestirerek 350ms-1100ms arasi yanit suresiyle sektordeki en hizli AI cagri merkezi deneyimini sunuyor.

Callception'in hibrit telefon altyapisi, Turkiye'de yerel SIP trunk operatorleri ve uluslararasi alanda Twilio ile calisiyor. Coklu AI motor destegi (Groq, OpenAI, Google Gemini, Deepgram, ElevenLabs) ile tek bir provider'a bagimlilik ortadan kaldiriliyor.

Platform, aylik $49'dan baslayan paketlerle kucuk isletmelerden kurumsal sirketlere kadar genis bir yelpazeye hitap ediyor.

Daha fazla bilgi: callception.com
Iletisim: info@callception.com

---

*Bu belge Callception'in lansman iletisim stratejisinin temelidir. Hedef kitleye gore ilgili bolumleri secip kullaniniz.*
