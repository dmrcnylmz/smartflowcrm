/**
 * Email Notification Service
 *
 * Uses Resend for transactional emails.
 * Supports: appointment reminders, welcome emails, call summaries.
 *
 * Fallback: console.log in development when RESEND_API_KEY is not set.
 */

import { Resend } from 'resend';

// =============================================
// Types
// =============================================

export interface EmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    tags?: Array<{ name: string; value: string }>;
}

export interface AppointmentReminderData {
    customerName: string;
    customerEmail: string;
    appointmentDate: string;
    appointmentTime: string;
    companyName: string;
    companyPhone?: string;
    notes?: string;
}

export interface WelcomeEmailData {
    userName: string;
    userEmail: string;
    companyName: string;
    dashboardUrl: string;
}

export interface CallSummaryData {
    ownerEmail: string;
    callerName: string;
    callerPhone: string;
    companyName: string;
    callDuration: string;
    summary: string;
    intent: string;
    timestamp: string;
}

// =============================================
// Email Service
// =============================================

const FROM_EMAIL = process.env.EMAIL_FROM || 'SmartFlow CRM <noreply@smartflowcrm.com>';

let resend: Resend | null = null;

function getResend(): Resend | null {
    if (resend) return resend;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('[Email] RESEND_API_KEY not set, emails will be logged to console');
        return null;
    }
    resend = new Resend(apiKey);
    return resend;
}

/**
 * Send an email via Resend (or log to console in dev mode).
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
    const client = getResend();

    if (!client) {
        // Development fallback
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[Email] (DEV MODE) Would send email:');
            console.debug(`  To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
            console.debug(`  Subject: ${options.subject}`);
            console.debug(`  Body preview: ${options.text || options.html.substring(0, 200)}...`);
        }
        return { success: true, id: 'dev-' + Date.now() };
    }

    try {
        const { data, error } = await client.emails.send({
            from: FROM_EMAIL,
            to: Array.isArray(options.to) ? options.to : [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
            tags: options.tags,
        });

        if (error) {
            console.error('[Email] Send failed:', error);
            return { success: false, error: error.message };
        }

        if (process.env.NODE_ENV !== 'production') console.debug(`[Email] Sent to ${options.to} | ID: ${data?.id}`);
        return { success: true, id: data?.id };
    } catch (err) {
        console.error('[Email] Exception:', err);
        return { success: false, error: String(err) };
    }
}

// =============================================
// Template: Appointment Reminder
// =============================================

export async function sendAppointmentReminder(data: AppointmentReminderData) {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">📅 Randevu Hatırlatması</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #334155; margin: 0 0 16px; font-size: 15px;">
        Sayın <strong>${escapeHtml(data.customerName)}</strong>,
      </p>
      <p style="color: #475569; margin: 0 0 24px; font-size: 14px;">
        <strong>${escapeHtml(data.companyName)}</strong> ile olan randevunuzu hatırlatmak istiyoruz.
      </p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px; width: 80px;">Tarih:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${escapeHtml(data.appointmentDate)}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Saat:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${escapeHtml(data.appointmentTime)}</td>
          </tr>
          ${data.notes ? `
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Not:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${escapeHtml(data.notes)}</td>
          </tr>` : ''}
        </table>
      </div>
      ${data.companyPhone ? `
      <p style="color: #475569; margin: 0 0 8px; font-size: 13px;">
        Değişiklik veya iptal için: <a href="tel:${data.companyPhone}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">${escapeHtml(data.companyPhone)}</a>
      </p>` : ''}
      <p style="color: #94a3b8; margin: 24px 0 0; font-size: 12px;">
        Bu e-posta ${escapeHtml(data.companyName)} tarafından SmartFlow CRM aracılığıyla gönderilmiştir.
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `Randevu Hatırlatması\n\nSayın ${data.customerName},\n\n${data.companyName} ile olan randevunuz:\nTarih: ${data.appointmentDate}\nSaat: ${data.appointmentTime}\n${data.notes ? `Not: ${data.notes}\n` : ''}${data.companyPhone ? `\nDeğişiklik için: ${data.companyPhone}` : ''}`;

    return sendEmail({
        to: data.customerEmail,
        subject: `📅 Randevu Hatırlatması - ${data.appointmentDate} ${data.appointmentTime}`,
        html,
        text,
        tags: [
            { name: 'type', value: 'appointment-reminder' },
            { name: 'company', value: data.companyName },
        ],
    });
}

// =============================================
// Template: Welcome Email
// =============================================

export async function sendWelcomeEmail(data: WelcomeEmailData) {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">🎉 SmartFlow CRM'e Hoş Geldiniz!</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #334155; margin: 0 0 16px; font-size: 15px;">
        Merhaba <strong>${escapeHtml(data.userName)}</strong>,
      </p>
      <p style="color: #475569; margin: 0 0 24px; font-size: 14px;">
        <strong>${escapeHtml(data.companyName)}</strong> hesabınız başarıyla oluşturuldu! AI sesli asistanınız artık kullanıma hazır.
      </p>
      <div style="margin-bottom: 24px;">
        <a href="${escapeHtml(data.dashboardUrl)}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Dashboard'a Git →
        </a>
      </div>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="color: #1e293b; margin: 0 0 12px; font-size: 14px;">İlk Adımlar:</h3>
        <ol style="color: #475569; margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
          <li>Bilgi bankasını doldurun (FAQ, ürün bilgileri)</li>
          <li>Sesli asistan ayarlarını özelleştirin</li>
          <li>Twilio telefon numaranızı bağlayın</li>
          <li>Test araması yapın</li>
        </ol>
      </div>
      <p style="color: #94a3b8; margin: 0; font-size: 12px;">
        Sorularınız için: info@smartflowcrm.com
      </p>
    </div>
  </div>
</body>
</html>`;

    return sendEmail({
        to: data.userEmail,
        subject: `🎉 SmartFlow CRM'e Hoş Geldiniz - ${data.companyName}`,
        html,
        tags: [
            { name: 'type', value: 'welcome' },
            { name: 'company', value: data.companyName },
        ],
    });
}

// =============================================
// Template: Call Summary (to business owner)
// =============================================

export async function sendCallSummary(data: CallSummaryData) {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">📞 Arama Özeti</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #334155; margin: 0 0 20px; font-size: 14px;">
        <strong>${escapeHtml(data.companyName)}</strong> - Yeni bir arama tamamlandı.
      </p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px; width: 100px;">Arayan:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${escapeHtml(data.callerName)}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Telefon:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${escapeHtml(data.callerPhone)}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Süre:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${escapeHtml(data.callDuration)}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Intent:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">
              <span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(data.intent)}</span>
            </td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 13px;">Zaman:</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${escapeHtml(data.timestamp)}</td>
          </tr>
        </table>
      </div>
      <div style="margin-bottom: 16px;">
        <h3 style="color: #1e293b; margin: 0 0 8px; font-size: 14px;">Özet:</h3>
        <p style="color: #475569; margin: 0; font-size: 13px; line-height: 1.6; background: #fefce8; border-left: 3px solid #eab308; padding: 12px 16px; border-radius: 0 8px 8px 0;">
          ${escapeHtml(data.summary)}
        </p>
      </div>
      <p style="color: #94a3b8; margin: 0; font-size: 12px;">
        SmartFlow CRM - AI Sesli Asistan
      </p>
    </div>
  </div>
</body>
</html>`;

    return sendEmail({
        to: data.ownerEmail,
        subject: `📞 Arama Özeti: ${data.callerName} - ${data.intent}`,
        html,
        tags: [
            { name: 'type', value: 'call-summary' },
            { name: 'company', value: data.companyName },
        ],
    });
}

// =============================================
// Helper
// =============================================

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
