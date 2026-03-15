/**
 * Seed script for initial Firebase data
 * Run: npm run seed
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';

// .env.local dosyasını yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env.local');

// .env.local dosyasını manuel parse et
let envVars = {};
try {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      (envVars as Record<string, string>)[key] = value;
    }
  });
} catch (error) {
  console.error('⚠️  .env.local dosyası bulunamadı, environment variables kullanılacak');
}

// Environment variables'ı process.env'e ekle
Object.assign(process.env, envVars);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('❌ HATA: Firebase config bulunamadı!');
  console.error('💡 .env.local dosyasını oluşturup Firebase bilgilerinizi ekleyin.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedData() {
  console.log('🌱 Seeding data...');

  try {
    // 1. Sample customers
    const customer1 = await addDoc(collection(db, 'customers'), {
      name: 'Ahmet Yılmaz',
      phone: '+905551234567',
      email: 'ahmet@example.com',
      notes: 'Örnek müşteri',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Customer 1 created:', customer1.id);

    const customer2 = await addDoc(collection(db, 'customers'), {
      name: 'Ayşe Demir',
      phone: '+905559876543',
      email: 'ayse@example.com',
      notes: 'Örnek müşteri 2',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Customer 2 created:', customer2.id);

    // 2. Sample FAQ documents
    await addDoc(collection(db, 'documents'), {
      title: 'Ödeme Nasıl Yapılır?',
      content: 'Ödemelerinizi nakit, kredi kartı veya banka transferi ile yapabilirsiniz. Online ödeme için web sitemizden giriş yapabilirsiniz.',
      category: 'faq',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log('✅ FAQ document created');

    await addDoc(collection(db, 'documents'), {
      title: 'Randevu Nasıl Alınır?',
      content: 'Randevu almak için telefon numaramızı arayabilir, web sitemizden online randevu oluşturabilir veya WhatsApp üzerinden mesaj gönderebilirsiniz.',
      category: 'faq',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log('✅ FAQ document 2 created');

    // 3. Sample activity log
    await addDoc(collection(db, 'activity_logs'), {
      type: 'CALL',
      refId: 'sample',
      desc: 'İlk test aktivitesi',
      createdAt: Timestamp.now(),
    });
    console.log('✅ Activity log created');

    console.log('\n✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedData();
