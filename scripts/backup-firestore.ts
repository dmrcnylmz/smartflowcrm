#!/usr/bin/env tsx
/**
 * Firestore Backup Script
 *
 * Exports all Firestore collections to local JSON files.
 * Optionally uploads to Google Cloud Storage if BACKUP_GCS_BUCKET is set.
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- --collections tenants,leads
 *   npm run backup -- --output ./my-backups
 *
 * Requirements:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env (or GOOGLE_APPLICATION_CREDENTIALS)
 *   - tsx installed (dev dependency)
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_OUTPUT_DIR = './backups';
const BATCH_SIZE = 500;

// Known top-level collections
const ALL_COLLECTIONS = [
    'tenants',
    'leads',
    'webhook_retry_queue',
    'system',
];

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    let collections: string[] | null = null;
    let outputDir = DEFAULT_OUTPUT_DIR;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--collections' && args[i + 1]) {
            collections = args[i + 1].split(',').map(c => c.trim());
            i++;
        }
        if (args[i] === '--output' && args[i + 1]) {
            outputDir = args[i + 1];
            i++;
        }
    }

    return { collections, outputDir };
}

// ─── Firebase Init ──────────────────────────────────────────────────────────

function initFirebase(): admin.firestore.Firestore {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
        try {
            const credential = JSON.parse(serviceAccountKey);
            admin.initializeApp({
                credential: admin.credential.cert(credential),
            });
        } catch {
            console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY JSON parse hatasi');
            process.exit(1);
        }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
    } else {
        console.error('❌ Firebase credentials bulunamadi.');
        console.error('   FIREBASE_SERVICE_ACCOUNT_KEY veya GOOGLE_APPLICATION_CREDENTIALS ayarlayin.');
        process.exit(1);
    }

    return admin.firestore();
}

// ─── Collection Export ──────────────────────────────────────────────────────

interface ExportResult {
    collection: string;
    documentCount: number;
    subcollectionDocs: number;
}

async function exportCollection(
    db: admin.firestore.Firestore,
    collectionName: string,
): Promise<{ data: Record<string, unknown>[]; result: ExportResult }> {
    const docs: Record<string, unknown>[] = [];
    let subcollectionDocs = 0;

    // Fetch all documents in batches
    let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
    let hasMore = true;

    while (hasMore) {
        let query = db.collection(collectionName)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(BATCH_SIZE);

        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            hasMore = false;
            break;
        }

        for (const doc of snapshot.docs) {
            const docData: Record<string, unknown> = {
                _id: doc.id,
                _path: doc.ref.path,
                ...doc.data(),
            };

            // Export subcollections (1 level deep)
            const subcollections = await doc.ref.listCollections();
            for (const subcol of subcollections) {
                const subSnap = await subcol.get();
                const subDocs = subSnap.docs.map(subDoc => ({
                    _id: subDoc.id,
                    ...subDoc.data(),
                }));
                docData[`_sub_${subcol.id}`] = subDocs;
                subcollectionDocs += subDocs.length;
            }

            docs.push(docData);
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < BATCH_SIZE) {
            hasMore = false;
        }
    }

    return {
        data: docs,
        result: {
            collection: collectionName,
            documentCount: docs.length,
            subcollectionDocs,
        },
    };
}

// ─── GCS Upload (Optional) ─────────────────────────────────────────────────

async function uploadToGCS(filePath: string, bucketName: string): Promise<string> {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    const destination = `firestore-backups/${path.basename(filePath)}`;
    await bucket.upload(filePath, { destination });

    return `gs://${bucketName}/${destination}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    const { collections, outputDir } = parseArgs();
    const targetCollections = collections || ALL_COLLECTIONS;

    console.log('🔥 Firestore Backup Basladi');
    console.log(`   Collections: ${targetCollections.join(', ')}`);
    console.log(`   Output: ${outputDir}`);
    console.log('');

    // Init Firebase
    const db = initFirebase();

    // Create output directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(outputDir, `backup-${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    const results: ExportResult[] = [];
    let totalDocs = 0;

    // Export each collection
    for (const collectionName of targetCollections) {
        process.stdout.write(`   📦 ${collectionName}...`);

        try {
            const { data, result } = await exportCollection(db, collectionName);

            // Write JSON file
            const filePath = path.join(backupDir, `${collectionName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

            results.push(result);
            totalDocs += result.documentCount + result.subcollectionDocs;

            console.log(` ✅ ${result.documentCount} doc${result.subcollectionDocs > 0 ? ` + ${result.subcollectionDocs} sub-doc` : ''}`);
        } catch (err) {
            console.log(` ❌ ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
            results.push({
                collection: collectionName,
                documentCount: 0,
                subcollectionDocs: 0,
            });
        }
    }

    // Write metadata
    const metadata = {
        timestamp: new Date().toISOString(),
        collections: results,
        totalDocuments: totalDocs,
        backupDir,
    };
    fs.writeFileSync(
        path.join(backupDir, '_metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8',
    );

    console.log('');
    console.log(`✅ Backup tamamlandi: ${totalDocs} dokuman → ${backupDir}`);

    // Optional: Upload to GCS
    const gcsBucket = process.env.BACKUP_GCS_BUCKET;
    if (gcsBucket) {
        console.log(`☁️  GCS'e yukleniyor: ${gcsBucket}...`);
        try {
            // Create a tar-like single JSON with all data
            const allDataPath = path.join(backupDir, '_all.json');
            const allData: Record<string, unknown> = { _metadata: metadata };
            for (const collectionName of targetCollections) {
                const filePath = path.join(backupDir, `${collectionName}.json`);
                if (fs.existsSync(filePath)) {
                    allData[collectionName] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                }
            }
            fs.writeFileSync(allDataPath, JSON.stringify(allData), 'utf-8');

            const gcsPath = await uploadToGCS(allDataPath, gcsBucket);
            console.log(`✅ GCS upload tamamlandi: ${gcsPath}`);

            // Clean up _all.json
            fs.unlinkSync(allDataPath);
        } catch (err) {
            console.error(`❌ GCS upload hatasi: ${err instanceof Error ? err.message : err}`);
        }
    }

    // Exit cleanly
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Backup hatasi:', err);
    process.exit(1);
});
