/**
 * Sample Data Script - Test verisi ekler
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env.local');

const envVars = {};
try {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      envVars[key] = value;
    }
  });
} catch (error) {
  console.error('⚠️ .env.local bulunamadı');
}

Object.assign(process.env, envVars);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

(async () => {
  console.log('📊 Test verisi ekleniyor...\n');

  try {
    // 1. Müşteriler
    console.log('👥 Müşteriler ekleniyor...');
    const customers = [
      { name: 'Ahmet Yılmaz', phone: '+905551234567', email: 'ahmet@example.com', tags: ['vip'] },
      { name: 'Ayşe Demir', phone: '+905559876543', email: 'ayse@example.com', tags: ['yeni'] },
      { name: 'Mehmet Kaya', phone: '+905555555555', email: 'mehmet@example.com', tags: [] },
    ];

    for (const customer of customers) {
      await addDoc(collection(db, 'customers'), {
        ...customer,
        createdAt: Timestamp.now(),
      });
      console.log(`  ✅ ${customer.name}`);
    }

    // 2. Çağrılar
    console.log('\n📞 Çağrılar ekleniyor...');
    const calls = [
      { customerPhone: '+905551234567', customerName: 'Ahmet Yılmaz', duration: 180, status: 'answered', intent: 'randevu', summary: 'Randevu talebi' },
      { customerPhone: '+905559876543', customerName: 'Ayşe Demir', duration: 0, status: 'missed', intent: 'unknown', summary: 'Kaçırılan çağrı' },
      { customerPhone: '+905555555555', customerName: 'Mehmet Kaya', duration: 120, status: 'answered', intent: 'bilgi', summary: 'Ürün bilgisi sordu' },
    ];

    for (const call of calls) {
      await addDoc(collection(db, 'calls'), {
        ...call,
        createdAt: Timestamp.now(),
      });
      console.log(`  ✅ ${call.customerName} - ${call.status}`);
    }

    // 3. Randevular
    console.log('\n📅 Randevular ekleniyor...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    await addDoc(collection(db, 'appointments'), {
      customerName: 'Ahmet Yılmaz',
      customerPhone: '+905551234567',
      dateTime: Timestamp.fromDate(tomorrow),
      service: 'Ürün Danışmanlığı',
      status: 'scheduled',
      notes: 'Yeni ürünler hakkında bilgi almak istiyor',
      createdAt: Timestamp.now(),
    });
    console.log('  ✅ Ahmet Yılmaz - Yarın 14:00');

    // 4. Şikayetler
    console.log('\n⚠️  Şikayetler ekleniyor...');
    await addDoc(collection(db, 'complaints'), {
      customerName: 'Ayşe Demir',
      customerPhone: '+905559876543',
      category: 'Ürün Kalitesi',
      description: 'Satın aldığım ürün beklentimi karşılamadı',
      status: 'open',
      priority: 'high',
      createdAt: Timestamp.now(),
    });
    console.log('  ✅ Ayşe Demir - Ürün Kalitesi');

    // 5. Aktivite Logları
    console.log('\n📝 Aktivite logları ekleniyor...');
    const activities = [
      { type: 'call', desc: 'Ahmet Yılmaz aradı - Randevu talebi' },
      { type: 'appointment', desc: 'Ahmet Yılmaz için randevu oluşturuldu' },
      { type: 'complaint', desc: 'Ayşe Demir şikayet etti' },
    ];

    for (const activity of activities) {
      await addDoc(collection(db, 'activity_logs'), {
        ...activity,
        createdAt: Timestamp.now(),
      });
      console.log(`  ✅ ${activity.desc}`);
    }

    console.log('\n✨ Test verisi başarıyla eklendi!');
    console.log('🌐 Tarayıcıda http://localhost:3000 adresini yenileyin\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    process.exit(1);
  }
})();

