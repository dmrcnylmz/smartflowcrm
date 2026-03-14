/**
 * Firestore Collections Auto-Setup Script (ESM Version)
 * Run: npm run setup:firestore
 * 
 * Bu script tüm gerekli Firestore collections'ları otomatik oluşturur
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// .env.local dosyasını yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env.local');

// .env.local dosyasını manuel parse et (Node.js native için)
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
  console.error('⚠️  .env.local dosyası bulunamadı, environment variables kullanılacak');
}

// Environment variables'ı process.env'e ekle
Object.assign(process.env, envVars);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

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
  console.error('   Örnek: cp .env.local.example .env.local');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
        const ref = doc(collection(db, name), 'init_placeholder');
        await setDoc(ref, {
          createdAt: new Date().toISOString(),
          _setup: true,
          _note: 'Bu document setup scripti tarafından oluşturuldu. Silinebilir.',
        });
        console.log(`✅ ${name} collection initialized`);
      } catch (error) {
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
    console.log('\n💡 İpucu: Firebase Console\'dan "init_placeholder" document\'lerini silebilirsiniz.');
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

