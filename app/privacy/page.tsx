'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';

// ─────────────────────────────────────────────
// Privacy & KVKK Disclosure Page
// ─────────────────────────────────────────────

const SECTIONS = [
    {
        title: '1. Veri Sorumlusu',
        content: `Callception ("Şirket"), kişisel verilerinizin işlenmesinde veri sorumlusu sıfatıyla hareket etmektedir. Şirket, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında kişisel verilerinizi aşağıda açıklanan amaçlar doğrultusunda, hukuka ve dürüstlük kurallarına uygun olarak işlemektedir.`,
    },
    {
        title: '2. İşlenen Kişisel Veriler',
        content: `Hizmetlerimiz kapsamında aşağıdaki kişisel veriler işlenebilmektedir:

• **Kimlik Bilgileri:** Ad, soyad
• **İletişim Bilgileri:** Telefon numarası, e-posta adresi
• **Ses Kayıtları:** AI sesli asistan ile yapılan görüşmelerin kayıtları (onayınız dahilinde)
• **Arama Verileri:** Arama saati, süresi, yönü (gelen/giden)
• **İşlem Verileri:** Randevu bilgileri, şikayet içerikleri, bilgi talepleri
• **Teknik Veriler:** IP adresi, tarayıcı bilgileri, oturum çerezleri
• **AI İşlem Verileri:** Niyet tespiti sonuçları, duygu analizi çıktıları`,
    },
    {
        title: '3. Verilerin İşlenme Amaçları',
        content: `Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:

• Müşteri hizmetleri ve çağrı yönetimi
• Randevu oluşturma ve takibi
• Şikayet yönetimi ve çözüm süreçleri
• AI destekli sesli asistan hizmeti sunulması
• Hizmet kalitesinin ölçülmesi ve iyileştirilmesi
• Yasal yükümlülüklerin yerine getirilmesi
• İstatistiksel analiz ve raporlama (anonimleştirilmiş verilerle)`,
    },
    {
        title: '4. Verilerin Aktarılması',
        content: `Kişisel verileriniz, hizmet sunumu için aşağıdaki üçüncü taraflara aktarılabilir:

• **Google Firebase:** Veritabanı ve kimlik doğrulama hizmetleri (AB veri merkezleri)
• **ElevenLabs:** Ses sentezleme (TTS) hizmeti
• **OpenAI:** Doğal dil işleme hizmeti
• **Deepgram:** Konuşmadan metne (STT) dönüşüm hizmeti
• **Twilio:** Telefon altyapı hizmeti

Tüm veri aktarımları şifrelenmiş kanallar üzerinden gerçekleştirilir. Yurt dışına veri aktarımı, KVKK m.9 kapsamında yeterli önlemler alınarak yapılmaktadır.`,
    },
    {
        title: '5. Veri Saklama Süresi',
        content: `• **Arama kayıtları:** 2 yıl
• **Ses kayıtları:** 90 gün (veya onay geri çekilene kadar)
• **Randevu ve şikayet verileri:** İlişkinin sona ermesinden itibaren 3 yıl
• **Teknik log verileri:** 6 ay
• **Anonim analitik veriler:** Süresiz

Saklama süreleri sonunda veriler otomatik olarak silinir veya anonimleştirilir.`,
    },
    {
        title: '6. Haklarınız (KVKK m.11)',
        content: `KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:

• Kişisel verilerinizin işlenip işlenmediğini öğrenme
• İşlenmişse buna ilişkin bilgi talep etme
• İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme
• Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme
• Eksik veya yanlış işlenmişse düzeltilmesini isteme
• KVKK m.7 şartları çerçevesinde silinmesini veya yok edilmesini isteme
• Düzeltme/silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme
• İşlenen verilerin analiz edilmesiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme
• Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde tazminat talep etme`,
    },
    {
        title: '7. Ses Kaydı Onayı',
        content: `AI sesli asistan ile yapılan görüşmelerin kaydedilmesi, açık onayınıza tabidir. Görüşme başlangıcında ses kaydı hakkında bilgilendirilir ve onayınız alınır. Onay vermemeniz durumunda görüşme kaydedilmez, ancak hizmet kalitesi etkilenebilir.

Verdiğiniz onayı istediğiniz zaman geri çekebilirsiniz.`,
    },
    {
        title: '8. Çerez Politikası',
        content: `Uygulamamızda kullanılan çerezler:

• **Zorunlu Çerezler:** Oturum yönetimi ve güvenlik
• **Analitik Çerezler:** Firebase Analytics (anonimleştirilmiş kullanım verileri)

Üçüncü taraf reklam çerezleri kullanılmamaktadır.`,
    },
    {
        title: '9. İletişim',
        content: `KVKK kapsamındaki haklarınızı kullanmak için aşağıdaki kanallardan bize ulaşabilirsiniz:

📧 E-posta: kvkk@callception.com
📝 Başvuru formu: Uygulama içi "Ayarlar > Gizlilik" bölümü

Başvurularınız en geç 30 gün içinde yanıtlanacaktır.

**Son güncelleme:** Şubat 2026`,
    },
];

export default function PrivacyPage() {
    const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));

    const toggleSection = (index: number) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const expandAll = () => {
        setOpenSections(new Set(SECTIONS.map((_, i) => i)));
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
            <div className="max-w-3xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Gizlilik ve KVKK Aydınlatma Metni</h1>
                        <p className="text-sm text-muted-foreground">Callception Kişisel Verilerin Korunması</p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-6 mb-8">
                    <p className="text-sm text-muted-foreground">
                        Bu metin, 6698 sayılı KVKK ve AB Genel Veri Koruma Tüzüğü (GDPR) kapsamında hazırlanmıştır.
                    </p>
                    <button
                        onClick={expandAll}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                        Tümünü Aç
                    </button>
                </div>

                {/* Accordion */}
                <div className="space-y-3">
                    {SECTIONS.map((section, index) => {
                        const isOpen = openSections.has(index);
                        return (
                            <div
                                key={section.title}
                                className={`rounded-xl border transition-all duration-200 ${isOpen
                                        ? 'border-blue-200 dark:border-blue-900/50 bg-white dark:bg-gray-900 shadow-sm'
                                        : 'border-input bg-white/50 dark:bg-gray-900/50 hover:border-gray-300 dark:hover:border-gray-700'
                                    }`}
                            >
                                <button
                                    onClick={() => toggleSection(index)}
                                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                                >
                                    <span className="text-sm font-semibold text-foreground">{section.title}</span>
                                    {isOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    )}
                                </button>
                                {isOpen && (
                                    <div className="px-5 pb-5">
                                        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-w-none">
                                            {section.content.split(/(\*\*.*?\*\*)/).map((part, i) =>
                                                part.startsWith('**') && part.endsWith('**')
                                                    ? <strong key={i}>{part.slice(2, -2)}</strong>
                                                    : <span key={i}>{part}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="mt-10 pt-6 border-t text-center">
                    <Link
                        href="/"
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        ← Ana Sayfaya Dön
                    </Link>
                </div>
            </div>
        </div>
    );
}
