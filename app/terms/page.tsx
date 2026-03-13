'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

// ─────────────────────────────────────────────
// Kullanım Şartları / Terms of Service
// ─────────────────────────────────────────────

const SECTIONS = [
    {
        title: '1. Hizmet Tanımı',
        content: `Callception ("Platform"), yapay zeka destekli sesli asistan ve müşteri hizmetleri yönetim platformudur. Platform aşağıdaki hizmetleri sunar:

• **AI Sesli Asistan:** Otomatik çağrı yanıtlama, yönlendirme ve müşteri etkileşimi
• **Randevu Yönetimi:** Otomatik randevu oluşturma, hatırlatma ve takip
• **CRM Yönetimi:** Müşteri bilgileri, iletişim geçmişi ve analitik raporlar
• **Çağrı Analizi:** Duygu analizi, niyet tespiti ve performans metrikleri
• **Bilgi Bankası:** Özelleştirilebilir bilgi kaynakları ve RAG tabanlı yanıtlar

Platform, abonelik modeli ile sunulmakta olup farklı plan seçenekleri mevcuttur.`,
    },
    {
        title: '2. Kullanım Koşulları',
        content: `Platformu kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız:

• Platform yalnızca yasal amaçlarla kullanılabilir
• Hesabınızın güvenliğinden siz sorumlusunuz
• Platformu kötüye kullanmak, tersine mühendislik yapmak veya güvenlik açıklarını istismar etmek yasaktır
• Spam, dolandırıcılık veya yanıltıcı içerik oluşturmak için kullanılamaz
• AI asistanı yasalara aykırı bilgi sunmak için yapılandıramazsınız
• Diğer kullanıcıların hizmet almasını engelleyecek şekilde aşırı kaynak kullanımı yasaktır
• Platform üzerinden üçüncü taraf haklarını ihlal eden içerik paylaşılamaz`,
    },
    {
        title: '3. Hesap Güvenliği',
        content: `• Hesap oluşturmak için geçerli bir e-posta adresi gereklidir
• Şifrenizi güvenli tutmak ve üçüncü kişilerle paylaşmamak sizin sorumluluğunuzdadır
• Hesabınızda yetkisiz erişim tespit etmeniz halinde derhal bize bildirmeniz gerekmektedir
• Şüpheli aktivite tespit edilmesi durumunda hesabınız geçici olarak askıya alınabilir
• Hesap başına bir organizasyon tanımlanabilir
• Google hesabı ile giriş yapılması halinde Google gizlilik politikası da geçerlidir`,
    },
    {
        title: '4. Ödeme ve Faturalama',
        content: `• Ücretli planlar aylık veya yıllık abonelik modeli ile sunulur
• Ödemeler Lemon Squeezy ödeme altyapısı üzerinden güvenli şekilde işlenir
• Aboneliğinizi istediğiniz zaman iptal edebilirsiniz; iptal, mevcut dönem sonunda geçerli olur
• Kullanım limitleri plan türüne göre belirlenir (çağrı dakikası, asistan sayısı vb.)
• Limit aşımı durumunda ek ücretlendirme yapılmaz; hizmet sınırlandırılır
• İade politikası: Satın alma tarihinden itibaren 14 gün içinde iade talep edilebilir
• Fiyat değişiklikleri en az 30 gün önceden bildirilir`,
    },
    {
        title: '5. Fikri Mülkiyet',
        content: `• Callception platformu, yazılımı, tasarımı ve içeriği fikri mülkiyet hakları ile korunmaktadır
• Platform üzerinde oluşturduğunuz asistan yapılandırmaları, bilgi bankası içerikleri ve müşteri verileri size aittir
• AI tarafından üretilen yanıtlar ve analizler platformun işlevselliğinin bir parçasıdır
• Platformun kaynak kodunu kopyalamak, dağıtmak veya tersine mühendislik yapmak yasaktır
• API erişimi yalnızca belgelenen amaçlarla kullanılabilir`,
    },
    {
        title: '6. Hizmet Kısıtlamaları',
        content: `• Platform "olduğu gibi" sunulmaktadır; %100 kesintisiz çalışma garantisi verilmez
• Planlı bakım çalışmaları önceden bildirilir
• Üçüncü taraf hizmetlerindeki (Twilio, OpenAI, Deepgram vb.) kesintilerden Callception sorumlu değildir
• Acil durumlarda hizmet geçici olarak kısıtlanabilir
• Sesli asistan yanıtları yapay zeka tarafından üretilir ve her zaman doğru olmayabilir
• Platformun tıbbi, hukuki veya finansal danışmanlık aracı olarak kullanılması önerilmez`,
    },
    {
        title: '7. Sorumluluk Sınırlaması',
        content: `• Callception, platformun kullanımından kaynaklanan doğrudan veya dolaylı zararlardan azami ödenen abonelik bedeli kadar sorumludur
• AI asistanın verdiği yanıtların doğruluğu garanti edilmez; kritik kararlar için profesyonel danışmanlık alınması önerilir
• Müşterilerinize sunduğunuz hizmetten siz sorumlusunuz
• Callception, yetkisiz erişim, veri kaybı veya servis kesintilerinden kaynaklanan dolaylı zararlardan sorumlu tutulamaz
• Force majeure halleri (doğal afet, savaş, yaygın internet kesintisi vb.) sorumluluk kapsamı dışındadır`,
    },
    {
        title: '8. Değişiklikler',
        content: `• Bu kullanım şartları gerektiğinde güncellenebilir
• Önemli değişiklikler en az 30 gün önceden e-posta ile bildirilir
• Değişiklik sonrası platformu kullanmaya devam etmeniz, güncel şartları kabul ettiğiniz anlamına gelir
• Şartlardaki değişiklikleri kabul etmemeniz durumunda hesabınızı kapatabilirsiniz
• Geçmiş sürümler talep üzerine sunulabilir`,
    },
    {
        title: '9. Uygulanacak Hukuk',
        content: `• Bu sözleşme Türkiye Cumhuriyeti hukukuna tabidir
• Uyuşmazlıklarda İstanbul mahkemeleri ve icra daireleri yetkilidir
• 6502 sayılı Tüketicinin Korunması Hakkında Kanun hükümleri saklıdır
• 6698 sayılı KVKK kapsamındaki veri koruma hakları için Gizlilik Politikamıza bakınız`,
    },
    {
        title: '10. İletişim',
        content: `Kullanım şartları ile ilgili sorularınız için:

📧 E-posta: destek@callception.com
🌐 Web: https://callception.com
📝 Uygulama içi destek: Ayarlar > Yardım bölümü

**Son güncelleme:** Mart 2026`,
    },
];

export default function TermsPage() {
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
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Kullanım Şartları</h1>
                        <p className="text-sm text-muted-foreground">Callception Hizmet Kullanım Koşulları</p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-6 mb-8">
                    <p className="text-sm text-muted-foreground">
                        Callception platformunu kullanarak bu şartları kabul etmiş sayılırsınız.
                    </p>
                    <button
                        onClick={expandAll}
                        className="text-xs text-violet-600 hover:text-violet-700 font-medium"
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
                                        ? 'border-violet-200 dark:border-violet-900/50 bg-white dark:bg-gray-900 shadow-sm'
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
                <div className="mt-10 pt-6 border-t flex items-center justify-center gap-6">
                    <Link
                        href="/privacy"
                        className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                    >
                        Gizlilik Politikası →
                    </Link>
                    <Link
                        href="/landing"
                        className="text-sm text-muted-foreground hover:text-foreground font-medium"
                    >
                        ← Ana Sayfaya Dön
                    </Link>
                </div>
            </div>
        </div>
    );
}
