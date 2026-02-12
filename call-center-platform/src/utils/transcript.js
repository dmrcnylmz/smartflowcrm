/**
 * Mock transcript generator
 * Generates realistic Turkish/English call transcripts
 */

const INBOUND_TEMPLATES = {
    sales: [
        { agent: 'Merhaba, {company} Satış departmanına hoş geldiniz. Ben {agent_name}, size nasıl yardımcı olabilirim?', customer: 'Merhaba, ürünleriniz hakkında bilgi almak istiyorum.' },
        { agent: 'Tabii, hangi ürün grubumuz hakkında bilgi almak istersiniz?', customer: 'Online mağazanızdaki kampanyalı ürünleri merak ediyorum.' },
        { agent: 'Şu anda %30\'a varan indirimlerimiz var. Size özel bir teklif hazırlayabilirim.', customer: 'Bu çok güzel, detayları paylaşabilir misiniz?' },
        { agent: 'Elbette, e-posta adresinizi alabilir miyim? Detaylı teklifi göndereceğim.', customer: 'Tabii, e-posta adresim test@example.com.' },
        { agent: 'Teşekkürler, teklifinizi hemen hazırlayıp göndereceğim. Başka bir sorunuz var mı?', customer: 'Hayır, teşekkür ederim. İyi günler.' },
        { agent: 'Size de iyi günler, bizi tercih ettiğiniz için teşekkürler. İyi günler!', customer: '' }
    ],
    technical: [
        { agent: 'Merhaba, {company} Teknik Destek hattı. Ben {agent_name}, nasıl yardımcı olabilirim?', customer: 'Merhaba, siparişimle ilgili bir sorun yaşıyorum.' },
        { agent: 'Anlıyorum, sipariş numaranızı paylaşır mısınız?', customer: 'Sipariş numaram 45892.' },
        { agent: 'Teşekkürler, sisteme bakıyorum... Siparişinizi buldum. Tam olarak ne tür bir sorun yaşıyorsunuz?', customer: 'Ürün hasarlı geldi, kutusu ezilmişti.' },
        { agent: 'Çok üzgünüm bu durum için. Hemen ücretsiz değişim işlemi başlatıyorum. Kurye yarın gelecek.', customer: 'Çok teşekkür ederim, çok hızlı çözüm buldunuz.' },
        { agent: 'Rica ederim, müşteri memnuniyeti bizim önceliğimiz. Başka sorunuz var mı?', customer: 'Hayır, çok memnunum. Teşekkürler!' },
        { agent: 'Biz teşekkür ederiz, iyi günler dilerim!', customer: '' }
    ],
    billing: [
        { agent: 'Merhaba, {company} Fatura departmanı. Ben {agent_name}, nasıl yardımcı olabilirim?', customer: 'Merhaba, geçen ayki faturamda bir hata olduğunu düşünüyorum.' },
        { agent: 'Anlıyorum, hesap numaranızı verir misiniz lütfen?', customer: 'Hesap numaram 78234.' },
        { agent: 'Teşekkürler, faturanızı inceliyorum... Evet, fazla bir tutar yansımış görünüyor.', customer: 'Evet, normalde 150 TL olan paketim 280 TL olarak yansımış.' },
        { agent: 'Haklısınız, bu bir sistem hatasından kaynaklanmış. Hemen düzeltme yapıyorum ve fark iade edilecek.', customer: 'Ne kadar sürede iade edilir?' },
        { agent: '3-5 iş günü içinde hesabınıza yansıyacaktır. Özür dileriz bu durum için.', customer: 'Tamam, teşekkür ederim.' },
        { agent: 'Rica ederim, iyi günler dilerim!', customer: '' }
    ]
};

const OUTBOUND_TEMPLATES = [
    { agent: 'Merhaba, ben {agent_name}, {company}\'den arıyorum. {customer_name} Bey/Hanım ile görüşebilir miyim?', customer: 'Evet, ben {customer_name}.' },
    { agent: 'Geçen hafta bize ulaştığınız konu hakkında sizi bilgilendirmek istiyoruz.', customer: 'Evet, merak ediyordum ne oldu.' },
    { agent: 'Talebiniz onaylandı ve işleminiz tamamlandı. Size bir onay e-postası gönderdik.', customer: 'Harika, çok teşekkürler.' },
    { agent: 'Rica ederiz. Başka bir konuda yardımcı olabilir miyiz?', customer: 'Hayır, her şey tamam. İyi günler.' },
    { agent: 'Size de iyi günler, teşekkür ederiz!', customer: '' }
];

const CUSTOMER_NAMES = [
    'Ali Yılmaz', 'Fatma Öztürk', 'Hasan Çelik', 'Elif Şahin', 'Mustafa Kara',
    'Cem Aydın', 'Leyla Koç', 'Burak Arslan', 'Seda Yıldız', 'Emre Can',
    'Deniz Aktaş', 'Gül Erdoğan', 'Mehmet Çetin', 'Aslı Korkmaz', 'Onur Doğan',
    'Nida Polat', 'Selim Özkan', 'İrem Durmaz', 'Can Güler', 'Hazal Aksoy'
];

function generateTranscript(type, queueName, agentName, companyName) {
    let template;

    if (type === 'inbound') {
        const queueKey = queueName?.toLowerCase().includes('sales') ? 'sales'
            : queueName?.toLowerCase().includes('technical') ? 'technical'
                : 'billing';
        template = INBOUND_TEMPLATES[queueKey];
    } else {
        template = OUTBOUND_TEMPLATES;
    }

    const customerName = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];

    const lines = template.map(turn => {
        let agentLine = turn.agent
            .replace('{agent_name}', agentName || 'Temsilci')
            .replace('{company}', companyName || 'Şirket')
            .replace('{customer_name}', customerName);

        let customerLine = turn.customer
            .replace('{customer_name}', customerName);

        let result = `Temsilci: ${agentLine}`;
        if (customerLine) {
            result += `\nMüşteri: ${customerLine}`;
        }
        return result;
    });

    return lines.join('\n\n');
}

function generateCallSummary(queueName, resolutionStatus) {
    const summaries = {
        sales: [
            'Müşteri ürün bilgisi talep etti. Kampanya detayları paylaşıldı.',
            'Yeni müşteri kaydı oluşturuldu. Teklif gönderildi.',
            'Mevcut müşteri yenileme talebi. Özel indirim uygulandı.'
        ],
        technical: [
            'Hasarlı ürün bildirimi. Ücretsiz değişim başlatıldı.',
            'Teknik arıza bildirimi. Uzaktan çözüm sağlandı.',
            'Kurulum desteği verildi. Müşteri memnun ayrıldı.'
        ],
        billing: [
            'Fatura düzeltme talebi. Fazla ödeme iade edildi.',
            'Ödeme planı güncellendi. Taksit seçenekleri sunuldu.',
            'Hesap bakiye sorgusu yapıldı. Bilgilendirme sağlandı.'
        ]
    };

    const key = queueName?.toLowerCase().includes('sales') ? 'sales'
        : queueName?.toLowerCase().includes('technical') ? 'technical'
            : 'billing';

    const pool = summaries[key];
    return pool[Math.floor(Math.random() * pool.length)] + ` Durum: ${resolutionStatus}`;
}

module.exports = { generateTranscript, generateCallSummary, CUSTOMER_NAMES };
