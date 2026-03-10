#!/usr/bin/env node

/**
 * Setup Admin User Script
 *
 * Sets custom claims (tenantId, role) on a Firebase Auth user.
 * This is needed for Firestore Security Rules to work properly.
 *
 * Usage:
 *   node scripts/setup-admin.mjs <user-email> <tenant-id> <role>
 *
 * Examples:
 *   node scripts/setup-admin.mjs admin@company.com default owner
 *   node scripts/setup-admin.mjs agent@company.com acme-corp admin
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS env var set
 *   - Or run from a GCP environment with Application Default Credentials
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================
// Parse Arguments
// =============================================

const [,, email, tenantId, role = 'owner'] = process.argv;

if (!email || !tenantId) {
    console.error(`
╔══════════════════════════════════════════╗
║  Callception - Admin Setup Script     ║
╚══════════════════════════════════════════╝

Kullanım:
  node scripts/setup-admin.mjs <email> <tenant-id> [role]

Parametreler:
  email      - Firebase Auth'daki kullanıcı e-postası
  tenant-id  - Tenant ID (örn: "default", "acme-corp")
  role       - Rol: owner | admin | agent | viewer (varsayılan: owner)

Örnekler:
  node scripts/setup-admin.mjs admin@example.com default owner
  node scripts/setup-admin.mjs user@company.com my-company admin

Gereksinimler:
  - FIREBASE_SERVICE_ACCOUNT_KEY_PATH env var set edilmeli
    VEYA
  - GOOGLE_APPLICATION_CREDENTIALS env var set edilmeli
`);
    process.exit(1);
}

const validRoles = ['owner', 'admin', 'agent', 'viewer'];
if (!validRoles.includes(role)) {
    console.error(`Geçersiz rol: "${role}". Geçerli roller: ${validRoles.join(', ')}`);
    process.exit(1);
}

// =============================================
// Initialize Firebase Admin
// =============================================

function getCredential() {
    // Option 1: Service account key file path
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
        try {
            const absolutePath = resolve(process.cwd(), keyPath);
            const keyFile = JSON.parse(readFileSync(absolutePath, 'utf-8'));
            return cert(keyFile);
        } catch (err) {
            console.error('Service account key dosyası okunamadı:', err.message);
        }
    }

    // Option 2: Inline JSON
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (keyJson) {
        try {
            const jsonString = keyJson.trim().startsWith('{')
                ? keyJson
                : Buffer.from(keyJson, 'base64').toString('utf-8');
            const certData = JSON.parse(jsonString);
            if (certData.private_key) {
                certData.private_key = certData.private_key.replace(/\\n/g, '\n');
            }
            return cert(certData);
        } catch (err) {
            console.error('FIREBASE_SERVICE_ACCOUNT_KEY parse edilemedi:', err.message);
        }
    }

    // Option 3: Application Default Credentials (GCP)
    console.log('⚠️  Service account bulunamadı, Application Default Credentials kullanılıyor...');
    return undefined;
}

const app = initializeApp({
    credential: getCredential(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'smartflowcrm',
});

const authAdmin = getAuth(app);
const db = getFirestore(app);

// =============================================
// Main
// =============================================

async function main() {
    console.log(`\n🔧 Callception - Admin Setup`);
    console.log(`   Email:    ${email}`);
    console.log(`   Tenant:   ${tenantId}`);
    console.log(`   Role:     ${role}\n`);

    // 1. Find user by email
    let user;
    try {
        user = await authAdmin.getUserByEmail(email);
        console.log(`✅ Kullanıcı bulundu: ${user.uid} (${user.displayName || 'isimsiz'})`);
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            console.error(`❌ "${email}" e-postasıyla kayıtlı kullanıcı bulunamadı.`);
            console.error(`   Önce Firebase Console'dan veya uygulamadan kayıt olun.`);
            process.exit(1);
        }
        throw err;
    }

    // 2. Set custom claims
    await authAdmin.setCustomUserClaims(user.uid, {
        tenantId,
        role,
    });
    console.log(`✅ Custom claims set edildi: { tenantId: "${tenantId}", role: "${role}" }`);

    // 3. Check if tenant document exists, create if not
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists) {
        console.log(`⚠️  Tenant "${tenantId}" Firestore'da bulunamadı, oluşturuluyor...`);
        await tenantRef.set({
            companyName: tenantId === 'default' ? 'Callception Demo' : tenantId,
            sector: 'Genel',
            language: 'tr',
            agent: {
                name: 'Asistan',
                role: 'Müşteri Temsilcisi',
                traits: ['profesyonel', 'nazik'],
                greeting: 'Merhaba, hoş geldiniz. Size nasıl yardımcı olabilirim?',
                farewell: 'Aradığınız için teşekkür ederiz. İyi günler.',
            },
            business: {
                workingHours: '09:00-18:00',
                workingDays: 'Pazartesi-Cuma',
                services: [],
            },
            voice: {
                voiceId: 'EXAVITQu4vr4xnSDxMaL',
                ttsModel: 'eleven_flash_v2_5',
                sttLanguage: 'tr',
                stability: 0.5,
                similarityBoost: 0.75,
            },
            guardrails: {
                forbiddenTopics: [],
                competitorNames: [],
                allowPriceQuotes: false,
                allowContractTerms: false,
                maxResponseLength: 500,
                escalationRules: [],
            },
            quotas: {
                dailyMinutes: 60,
                monthlyCalls: 500,
                maxConcurrentSessions: 3,
            },
            active: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Tenant "${tenantId}" oluşturuldu.`);
    } else {
        console.log(`✅ Tenant "${tenantId}" zaten mevcut.`);
    }

    // 4. Add user to tenant members
    await tenantRef.collection('members').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        role,
        assignedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Kullanıcı tenant members'a eklendi.`);

    // 5. Done
    console.log(`
╔══════════════════════════════════════════╗
║  ✅ Setup tamamlandı!                    ║
╠══════════════════════════════════════════╣
║                                          ║
║  Kullanıcı yeniden giriş yapmalıdır      ║
║  (logout → login) yeni custom claims'in  ║
║  JWT token'a yansıması için.             ║
║                                          ║
╚══════════════════════════════════════════╝
`);

    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Hata:', err.message);
    process.exit(1);
});
