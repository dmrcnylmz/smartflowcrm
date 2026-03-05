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

const sampleCustomers = [
  { name: 'Ahmet Yılmaz', phone: '+905551234567', email: 'ahmet@example.com', status: 'active' },
  { name: 'Ayşe Demir', phone: '+905551234568', email: 'ayse@example.com', status: 'active' },
  { name: 'Mehmet Kaya', phone: '+905551234569', email: 'mehmet@example.com', status: 'active' },
  { name: 'Fatma Çelik', phone: '+905551234570', email: 'fatma@example.com', status: 'active' },
  { name: 'Ali Öztürk', phone: '+905551234571', email: 'ali@example.com', status: 'active' },
];

async function addSampleData() {
  console.log('🚀 Sample data ekleniyor...');
  
  try {
    // Add customers
    const customerIds = [];
    for (const customer of sampleCustomers) {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customer,
        createdAt: Timestamp.now(),
      });
      customerIds.push(docRef.id);
      console.log(`✅ Müşteri eklendi: ${customer.name}`);
    }

    // Add sample calls
    for (let i = 0; i < 3; i++) {
      const customer = sampleCustomers[i];
      const customerId = customerIds[i];
      await addDoc(collection(db, 'calls'), {
        customerPhone: customer.phone,
        customerName: customer.name,
        customerId,
        duration: Math.floor(Math.random() * 300) + 60,
        status: 'answered',
        intent: i === 0 ? 'appointment' : i === 1 ? 'complaint' : 'info',
        summary: `${customer.name} ile görüşme yapıldı`,
        direction: 'inbound',
        createdAt: Timestamp.now(),
        timestamp: Timestamp.now(),
      });
      console.log(`✅ Çağrı kaydı eklendi: ${customer.name}`);
    }

    // Add sample appointments
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    for (let i = 0; i < 2; i++) {
      const customerId = customerIds[i];
      const appointmentDate = new Date(tomorrow);
      appointmentDate.setHours(10 + i * 2, 0, 0, 0);
      
      await addDoc(collection(db, 'appointments'), {
        customerId,
        dateTime: Timestamp.fromDate(appointmentDate),
        durationMin: 30,
        notes: `${sampleCustomers[i].name} için randevu`,
        status: 'scheduled',
        createdAt: Timestamp.now(),
      });
      console.log(`✅ Randevu eklendi: ${sampleCustomers[i].name}`);
    }

    // Add sample complaints
    for (let i = 0; i < 2; i++) {
      const customerId = customerIds[i + 2];
      await addDoc(collection(db, 'complaints'), {
        customerId,
        category: i === 0 ? 'Ürün Kalitesi' : 'Teslimat',
        description: `${sampleCustomers[i + 2].name} şikayet kaydı`,
        priority: i === 0 ? 'high' : 'medium',
        status: 'open',
        createdAt: Timestamp.now(),
      });
      console.log(`✅ Şikayet eklendi: ${sampleCustomers[i + 2].name}`);
    }

    // Add activity logs
    for (let i = 0; i < 5; i++) {
      await addDoc(collection(db, 'activity_logs'), {
        type: i % 2 === 0 ? 'call' : 'appointment',
        description: `Aktivite ${i + 1}`,
        relatedId: customerIds[i % customerIds.length],
        createdAt: Timestamp.now(),
      });
    }
    console.log(`✅ Aktivite kayıtları eklendi`);

    console.log('\n✨ Sample data başarıyla eklendi!\n');
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

addSampleData();

