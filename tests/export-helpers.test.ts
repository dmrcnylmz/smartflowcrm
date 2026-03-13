/**
 * Export Helpers — Unit Tests
 *
 * Tests domain-specific data transformers.
 * CSV/Excel/PDF export functions are skipped as they depend on DOM APIs.
 */

import { describe, it, expect } from 'vitest';
import {
    exportCalls,
    exportAppointments,
    exportComplaints,
    exportCustomers,
    type ExportData,
} from '@/lib/utils/export-helpers';

// ─── Helper: Fake Firestore timestamp ──────────────────────────────────────

function fakeTimestamp(dateStr: string) {
    return {
        toDate: () => new Date(dateStr),
    };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Export Helpers', () => {
    // ─── exportCalls ────────────────────────────────────────────────
    describe('exportCalls()', () => {
        it('returns correct headers', () => {
            const result = exportCalls([], {});
            expect(result.headers).toContain('Tarih');
            expect(result.headers).toContain('Müşteri');
            expect(result.headers).toContain('Telefon');
            expect(result.headers).toContain('Yön');
            expect(result.headers).toContain('Durum');
        });

        it('transforms call data correctly', () => {
            const calls = [
                {
                    timestamp: fakeTimestamp('2025-01-15T10:00:00Z'),
                    customerId: 'c1',
                    direction: 'inbound',
                    intent: 'randevu',
                    status: 'answered',
                    durationSec: 45,
                    summary: 'Randevu alındı',
                },
            ];
            const customers: Record<string, Record<string, unknown>> = {
                c1: { name: 'Ahmet Yılmaz', phone: '+905551234567' },
            };

            const result = exportCalls(calls, customers);
            expect(result.rows).toHaveLength(1);

            const row = result.rows[0];
            expect(row[1]).toBe('Ahmet Yılmaz'); // customer name
            expect(row[2]).toBe('+905551234567'); // phone
            expect(row[3]).toBe('Gelen'); // inbound → Gelen
            expect(row[4]).toBe('randevu'); // intent
            expect(row[5]).toBe('Yanıtlandı'); // answered → Yanıtlandı
            expect(row[6]).toBe(45); // duration
        });

        it('handles outbound direction', () => {
            const calls = [{ direction: 'outbound', status: 'missed' }];
            const result = exportCalls(calls, {});
            expect(result.rows[0][3]).toBe('Giden');
            expect(result.rows[0][5]).toBe('Kaçırıldı');
        });

        it('handles missing customer data gracefully', () => {
            const calls = [{ customerId: 'unknown', direction: 'inbound', status: 'answered' }];
            const result = exportCalls(calls, {});
            const row = result.rows[0];
            expect(row[1]).toBe('Bilinmeyen'); // no customer found
        });

        it('handles empty calls array', () => {
            const result = exportCalls([], {});
            expect(result.rows).toHaveLength(0);
            expect(result.headers.length).toBeGreaterThan(0);
        });
    });

    // ─── exportAppointments ─────────────────────────────────────────
    describe('exportAppointments()', () => {
        it('returns correct headers', () => {
            const result = exportAppointments([], {});
            expect(result.headers).toContain('Tarih & Saat');
            expect(result.headers).toContain('Müşteri');
            expect(result.headers).toContain('Durum');
        });

        it('transforms appointment data correctly', () => {
            const appointments = [
                {
                    dateTime: fakeTimestamp('2025-02-10T14:30:00Z'),
                    customerId: 'c2',
                    durationMin: 60,
                    status: 'scheduled',
                    notes: 'Kontrol muayenesi',
                },
            ];
            const customers: Record<string, Record<string, unknown>> = {
                c2: { name: 'Fatma Demir', phone: '+905559876543' },
            };

            const result = exportAppointments(appointments, customers);
            expect(result.rows).toHaveLength(1);

            const row = result.rows[0];
            expect(row[1]).toBe('Fatma Demir');
            expect(row[3]).toBe(60);
            expect(row[4]).toBe('Planlandı');
            expect(row[5]).toBe('Kontrol muayenesi');
        });

        it('maps all status values', () => {
            const statuses = ['scheduled', 'completed', 'cancelled', 'confirmed'];
            const expected = ['Planlandı', 'Tamamlandı', 'İptal', 'Onaylandı'];

            statuses.forEach((status, i) => {
                const result = exportAppointments(
                    [{ customerId: 'x', status, dateTime: fakeTimestamp('2025-01-01') }],
                    { x: { name: 'Test' } }
                );
                expect(result.rows[0][4]).toBe(expected[i]);
            });
        });

        it('defaults duration to 30 min when missing', () => {
            const result = exportAppointments(
                [{ customerId: 'x', status: 'scheduled', dateTime: fakeTimestamp('2025-01-01') }],
                { x: { name: 'Test' } }
            );
            expect(result.rows[0][3]).toBe(30);
        });
    });

    // ─── exportComplaints ───────────────────────────────────────────
    describe('exportComplaints()', () => {
        it('returns correct headers', () => {
            const result = exportComplaints([], {});
            expect(result.headers).toContain('Tarih');
            expect(result.headers).toContain('Kategori');
            expect(result.headers).toContain('Açıklama');
        });

        it('transforms complaint data correctly', () => {
            const complaints = [
                {
                    createdAt: fakeTimestamp('2025-03-01T09:00:00Z'),
                    customerId: 'c3',
                    category: 'Fatura',
                    description: 'Yanlış fatura tutarı',
                    status: 'open',
                    notes: 'İnceleniyor',
                },
            ];
            const customers: Record<string, Record<string, unknown>> = {
                c3: { name: 'Ali Kaya', phone: '+905551112233' },
            };

            const result = exportComplaints(complaints, customers);
            expect(result.rows).toHaveLength(1);

            const row = result.rows[0];
            expect(row[1]).toBe('Ali Kaya');
            expect(row[3]).toBe('Fatura');
            expect(row[5]).toBe('Açık'); // open → Açık
        });

        it('maps all complaint statuses', () => {
            const statuses = ['open', 'investigating', 'resolved', 'closed'];
            const expected = ['Açık', 'İşlemde', 'Çözüldü', 'Kapatıldı'];

            statuses.forEach((status, i) => {
                const result = exportComplaints(
                    [{ customerId: 'x', status, createdAt: fakeTimestamp('2025-01-01') }],
                    { x: { name: 'Test' } }
                );
                expect(result.rows[0][5]).toBe(expected[i]);
            });
        });
    });

    // ─── exportCustomers ────────────────────────────────────────────
    describe('exportCustomers()', () => {
        it('returns correct headers', () => {
            const result = exportCustomers([]);
            expect(result.headers).toContain('İsim');
            expect(result.headers).toContain('Telefon');
            expect(result.headers).toContain('E-posta');
        });

        it('transforms customer data correctly', () => {
            const customers = [
                {
                    name: 'Zeynep Güneş',
                    phone: '+905554443322',
                    email: 'zeynep@example.com',
                    notes: 'VIP müşteri',
                    createdAt: fakeTimestamp('2025-01-01T00:00:00Z'),
                },
            ];

            const result = exportCustomers(customers);
            expect(result.rows).toHaveLength(1);

            const row = result.rows[0];
            expect(row[0]).toBe('Zeynep Güneş');
            expect(row[1]).toBe('+905554443322');
            expect(row[2]).toBe('zeynep@example.com');
            expect(row[3]).toBe('VIP müşteri');
        });

        it('handles missing fields gracefully', () => {
            const customers = [{}];
            const result = exportCustomers(customers);
            const row = result.rows[0];
            expect(row[0]).toBe('-'); // name
            expect(row[1]).toBe('-'); // phone
            expect(row[2]).toBe('-'); // email
            expect(row[3]).toBe('-'); // notes
        });

        it('handles multiple customers', () => {
            const customers = [
                { name: 'A', phone: '1', email: 'a@a.com' },
                { name: 'B', phone: '2', email: 'b@b.com' },
                { name: 'C', phone: '3', email: 'c@c.com' },
            ];
            const result = exportCustomers(customers);
            expect(result.rows).toHaveLength(3);
        });
    });
});
