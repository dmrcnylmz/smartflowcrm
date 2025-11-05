/**
 * Firestore Collections Auto-Setup Script
 * Run: npm run setup:firestore
 * 
 * Bu script tüm gerekli Firestore collections'ları otomatik oluşturur
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// .env.local dosyasını yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

// Environment variables'dan Firebase config'i al
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Config kontrolü
if (!firebaseConfig.projectId) {
  console.error('❌ HATA: Firebase config bulunamadı!');
  console.error('💡 .env.local dosyasını oluşturup Firebase bilgilerinizi ekleyin.');
  console.error('   Örnek: cp .env.local.example .env.local');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Oluşturulacak collections listesi
const collections = [
  'customers',
  'calls',
  'appointments',
  'complaints',
  'info_requests',
  'activity_logs',
  'documents',
];

(async () => {
  console.log('🚀 Firestore Collections Setup Başlıyor...\n');
  console.log(`📦 Proje: ${firebaseConfig.projectId}\n`);

  try {
    for (const name of collections) {
      try {
        // Her collection için bir dummy document oluştur (collection'ı initialize etmek için)
        const ref = doc(collection(db, name), '__init__');
        await setDoc(ref, {
          createdAt: new Date().toISOString(),
          _setup: true,
          _note: 'Bu document setup scripti tarafından oluşturuldu. Silinebilir.',
        });
        console.log(`✅ ${name} collection initialized`);
      } catch (error) {
        // Collection zaten varsa veya başka bir hata varsa
        if (error.code === 'permission-denied') {
          console.error(`❌ ${name}: İzin hatası - Firebase Security Rules kontrol edin`);
        } else if (error.code === 'already-exists') {
          console.log(`⚠️  ${name}: Zaten mevcut`);
        } else {
          console.error(`❌ ${name}: ${error.message}`);
        }
      }
    }

    console.log('\n✨ Tüm collections başarıyla oluşturuldu!');
    console.log('\n💡 İpucu: Firebase Console\'dan "__init__" document\'lerini silebilirsiniz.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Genel hata:', error.message);
    console.error('\n🔍 Kontrol edin:');
    console.error('   1. .env.local dosyası var mı?');
    console.error('   2. Firebase config bilgileri doğru mu?');
    console.error('   3. Firestore Database aktif mi?');
    console.error('   4. Security Rules izin veriyor mu?');
    process.exit(1);
  }
})();

