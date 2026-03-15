/**
 * Customer CSV Import API
 *
 * POST /api/customers/import
 *
 * Accepts a CSV file with customer data.
 * Columns: name (required), phone, email, company, notes
 * Deduplicates by phone number within the tenant.
 * Max 1000 rows per import.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

const MAX_ROWS = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface CsvCustomer {
    name: string;
    phone?: string;
    email?: string;
    company?: string;
    notes?: string;
}

function parseCSV(text: string): CsvCustomer[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return []; // Need header + at least one row

    // Parse header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const nameIdx = header.findIndex(h => ['name', 'ad', 'isim', 'nom', 'kunde'].includes(h));
    const phoneIdx = header.findIndex(h => ['phone', 'telefon', 'tel', 'téléphone', 'telefonnummer'].includes(h));
    const emailIdx = header.findIndex(h => ['email', 'e-mail', 'eposta', 'e-posta', 'courriel'].includes(h));
    const companyIdx = header.findIndex(h => ['company', 'firma', 'sirket', 'şirket', 'entreprise', 'unternehmen'].includes(h));
    const notesIdx = header.findIndex(h => ['notes', 'not', 'notlar', 'remarques', 'notizen'].includes(h));

    if (nameIdx === -1) {
        throw new Error('CSV must have a "name" column');
    }

    const customers: CsvCustomer[] = [];
    for (let i = 1; i < lines.length && i <= MAX_ROWS; i++) {
        const cols = parseCSVLine(lines[i]);
        const name = cols[nameIdx]?.trim();
        if (!name) continue; // Skip empty rows

        customers.push({
            name,
            phone: phoneIdx >= 0 ? normalizePhone(cols[phoneIdx]?.trim()) : undefined,
            email: emailIdx >= 0 ? cols[emailIdx]?.trim() : undefined,
            company: companyIdx >= 0 ? cols[companyIdx]?.trim() : undefined,
            notes: notesIdx >= 0 ? cols[notesIdx]?.trim() : undefined,
        });
    }

    return customers;
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function normalizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    // Remove common formatting
    return phone.replace(/[\s\-().]/g, '');
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
        }

        const mimeType = file.type;
        if (!['text/csv', 'text/plain', 'application/vnd.ms-excel'].includes(mimeType) && !file.name.endsWith('.csv')) {
            return NextResponse.json({ error: 'Only CSV files are accepted' }, { status: 400 });
        }

        const text = await file.text();
        let customers: CsvCustomer[];
        try {
            customers = parseCSV(text);
        } catch (err) {
            return NextResponse.json(
                { error: err instanceof Error ? err.message : 'Failed to parse CSV' },
                { status: 400 },
            );
        }

        if (customers.length === 0) {
            return NextResponse.json({ error: 'No valid customer rows found' }, { status: 400 });
        }

        const database = getDb();
        const tenantRef = database.collection('tenants').doc(auth.tenantId);
        const customersRef = tenantRef.collection('customers');

        // Fetch existing phone numbers for deduplication
        const existingPhones = new Set<string>();
        const existingSnap = await customersRef.select('phone').get();
        existingSnap.docs.forEach(doc => {
            const phone = doc.data()?.phone;
            if (phone) existingPhones.add(phone);
        });

        // Filter out duplicates and create new customers
        let imported = 0;
        let skipped = 0;
        let errors = 0;
        const batch = database.batch();
        const batchSize = 500;
        let currentBatchCount = 0;

        for (const customer of customers) {
            // Skip if phone already exists
            if (customer.phone && existingPhones.has(customer.phone)) {
                skipped++;
                continue;
            }

            try {
                const docRef = customersRef.doc();
                batch.set(docRef, {
                    id: docRef.id,
                    name: customer.name,
                    phone: customer.phone || '',
                    email: customer.email || '',
                    company: customer.company || '',
                    notes: customer.notes || '',
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'csv-import',
                });

                if (customer.phone) existingPhones.add(customer.phone);
                imported++;
                currentBatchCount++;

                // Firestore batch limit is 500 operations
                if (currentBatchCount >= batchSize) {
                    await batch.commit();
                    currentBatchCount = 0;
                }
            } catch {
                errors++;
            }
        }

        // Commit remaining
        if (currentBatchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            total: customers.length,
            imported,
            skipped,
            errors,
        });
    } catch (error) {
        return handleApiError(error, 'Customer CSV import');
    }
}
