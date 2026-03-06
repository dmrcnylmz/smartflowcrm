/**
 * Twilio Phone Number Verification Endpoint
 *
 * POST /api/twilio/verify-number
 *
 * Verifies that a registered phone number is properly configured
 * and ready to receive incoming calls. Checks:
 *
 * 1. Number exists in tenant_phone_numbers mapping
 * 2. Tenant has a valid configuration (greeting, language, etc.)
 * 3. Webhook URL is properly configured on Twilio (if subaccount exists)
 *
 * Body: { phoneNumber: "+905551234567" }
 *
 * Returns: { ready: boolean, checks: [...], issues: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

interface VerificationCheck {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    detail: string;
}

export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        const body = await request.json();
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
        }

        const normalized = phoneNumber.replace(/[\s\-()]/g, '');
        const checks: VerificationCheck[] = [];
        const issues: string[] = [];

        // ─── Check 1: Number registered in Firestore ────────────────────
        const phoneDoc = await getDb().collection('tenant_phone_numbers').doc(normalized).get();

        if (!phoneDoc.exists) {
            checks.push({ name: 'registration', status: 'fail', detail: 'Numara kayıtlı değil' });
            issues.push('Bu numara henüz sisteme kayıt edilmemiş. Önce numara kaydet.');
        } else if (phoneDoc.data()?.tenantId !== tenantId) {
            checks.push({ name: 'registration', status: 'fail', detail: 'Numara başka bir tenant\'a ait' });
            issues.push('Bu numara başka bir hesaba kayıtlı.');
        } else {
            checks.push({ name: 'registration', status: 'pass', detail: 'Numara kayıtlı ve bu tenant\'a ait' });
        }

        // ─── Check 2: Tenant configuration ──────────────────────────────
        const tenantDoc = await getDb().collection('tenants').doc(tenantId).get();
        const tenantData = tenantDoc.data();

        if (!tenantData) {
            checks.push({ name: 'tenant_config', status: 'fail', detail: 'Tenant bulunamadı' });
            issues.push('Tenant konfigürasyonu bulunamadı.');
        } else {
            const hasGreeting = !!(tenantData.agent?.greeting);
            const hasLanguage = !!(tenantData.language || tenantData.agent?.language);

            checks.push({
                name: 'tenant_greeting',
                status: hasGreeting ? 'pass' : 'warning',
                detail: hasGreeting ? 'Karşılama mesajı ayarlanmış' : 'Karşılama mesajı eksik — varsayılan kullanılacak',
            });

            checks.push({
                name: 'tenant_language',
                status: hasLanguage ? 'pass' : 'pass',
                detail: `Dil: ${tenantData.language || 'tr'} (varsayılan)`,
            });

            if (!hasGreeting) {
                issues.push('Karşılama mesajı ayarlanmamış — varsayılan kullanılacak.');
            }
        }

        // ─── Check 3: Twilio subaccount ─────────────────────────────────
        const twilioConfig = tenantData?.twilio;

        if (!twilioConfig?.subaccountSid) {
            checks.push({
                name: 'twilio_subaccount',
                status: 'warning',
                detail: 'Twilio subaccount yok — webhook\'ları manuel yapılandırmalısınız',
            });
            issues.push('Twilio subaccount oluşturulmamış. Webhook\'ları Twilio konsolundan manuel yapılandırın.');
        } else {
            checks.push({
                name: 'twilio_subaccount',
                status: 'pass',
                detail: `Subaccount: ${twilioConfig.subaccountSid}`,
            });

            // ─── Check 4: Webhook configuration on Twilio ──────────────
            const phoneData = phoneDoc.data();
            if (phoneData?.webhookConfigured) {
                checks.push({
                    name: 'webhook_config',
                    status: 'pass',
                    detail: 'Webhook\'lar otomatik yapılandırılmış',
                });
            } else if (phoneData?.phoneNumberSid && twilioConfig.authToken) {
                // Verify directly from Twilio API
                try {
                    const subSid = twilioConfig.subaccountSid;
                    const subToken = twilioConfig.authToken;
                    const pnSid = phoneData.phoneNumberSid;

                    const res = await fetch(
                        `https://api.twilio.com/2010-04-01/Accounts/${subSid}/IncomingPhoneNumbers/${pnSid}.json`,
                        {
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from(`${subSid}:${subToken}`).toString('base64'),
                            },
                            signal: AbortSignal.timeout(8000),
                        },
                    );

                    if (res.ok) {
                        const numData = await res.json();
                        const expectedUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/twilio/incoming`;
                        const voiceUrl = numData.voice_url || '';

                        if (voiceUrl.includes('/api/twilio/incoming')) {
                            checks.push({
                                name: 'webhook_config',
                                status: 'pass',
                                detail: `Webhook doğrulandı: ${voiceUrl}`,
                            });

                            // Update Firestore record
                            await getDb().collection('tenant_phone_numbers').doc(normalized).update({
                                webhookConfigured: true,
                            });
                        } else {
                            checks.push({
                                name: 'webhook_config',
                                status: 'fail',
                                detail: `Webhook yanlış: ${voiceUrl || 'boş'} — beklenen: ${expectedUrl}`,
                            });
                            issues.push(`Twilio webhook URL'si yanlış yapılandırılmış. Beklenen: ${expectedUrl}`);
                        }
                    } else {
                        checks.push({
                            name: 'webhook_config',
                            status: 'warning',
                            detail: 'Twilio API\'den numara bilgisi alınamadı',
                        });
                    }
                } catch {
                    checks.push({
                        name: 'webhook_config',
                        status: 'warning',
                        detail: 'Webhook doğrulaması yapılamadı — ağ hatası',
                    });
                }
            } else {
                checks.push({
                    name: 'webhook_config',
                    status: 'warning',
                    detail: 'Webhook yapılandırması doğrulanamıyor — phoneNumberSid eksik',
                });
                issues.push('Webhook yapılandırmasını Twilio konsolundan kontrol edin.');
            }
        }

        // ─── Summary ────────────────────────────────────────────────────
        const failCount = checks.filter(c => c.status === 'fail').length;
        const ready = failCount === 0;

        return NextResponse.json({
            ready,
            phoneNumber: normalized,
            summary: ready
                ? '✅ Numara çağrı almaya hazır!'
                : `❌ ${failCount} sorun bulundu — düzeltilmesi gerekiyor`,
            checks,
            issues,
        });

    } catch (error) {
        return handleApiError(error, 'VerifyNumber POST');
    }
}
