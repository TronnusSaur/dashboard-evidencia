import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env.local') });

// Intentar cargar la cuenta de servicio
let serviceAccount;

if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
        console.error("❌ Error parseando GOOGLE_SERVICE_ACCOUNT_KEY desde variables de entorno:", e.message);
    }
}

if (!serviceAccount) {
    const defaultPath = join(process.cwd(), 'service-account.json');
    if (existsSync(defaultPath)) {
        try {
            const raw = readFileSync(defaultPath, 'utf8');
            serviceAccount = JSON.parse(raw);
        } catch (e) {
            console.warn("⚠️ No se pudo leer service-account.json de forma local.");
        }
    }
}

if (serviceAccount) {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'real-time-sync-5967a.firebasestorage.app'
        });
    }
}

export const adminDb = serviceAccount ? admin.firestore() : null;
export const adminStorage = serviceAccount ? admin.storage().bucket() : null;

export async function uploadFolioToFirebase(folioKey, data) {
    if (!adminDb) return;
    try {
        await adminDb.collection('audit_results').doc(folioKey).set({
            ...data,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error(`❌ Error subiendo a Firebase (${folioKey}):`, e.message);
    }
}

import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
const gzipAsync = promisify(zlib.gzip);

export async function uploadJsonToStorage(filename, data) {
    if (!adminStorage) {
        console.warn("⚠️ Firebase Storage no inicializado. No se pudo subir:", filename);
        return;
    }
    try {
        const file = adminStorage.file(`contratos/${filename}`);
        const jsonString = JSON.stringify(data);
        const gzippedBuffer = await gzipAsync(jsonString);
        
        await file.save(gzippedBuffer, {
            metadata: {
                contentType: 'application/json',
                contentEncoding: 'gzip',
                cacheControl: 'public, max-age=31536000'
            }
        });
        
        // Hacer el archivo público
        await file.makePublic();
        console.log(`✅ Subido (GZIP) y publicado en Storage: contratos/${filename} (${(gzippedBuffer.length / 1024).toFixed(2)} KB)`);

        // Actualizar manifest
        // Actualizar manifest local
        updateManifest(filename);
    } catch (e) {
        console.error(`❌ Error subiendo ${filename} a Storage:`, e.message);
    }
}

function updateManifest(filename) {
    const manifestPath = join(process.cwd(), 'public', 'contratos', 'sync_manifest.json');
    let manifest = {};
    if (existsSync(manifestPath)) {
        try {
            manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        } catch(e) {}
    }
    manifest[filename] = Date.now();
    writeFileSync(manifestPath, JSON.stringify(manifest));
}

export async function uploadManifestToStorage() {
    if (!adminStorage) return;
    try {
        const manifestPath = join(process.cwd(), 'public', 'contratos', 'sync_manifest.json');
        if (!existsSync(manifestPath)) return;
        
        const manifestContent = readFileSync(manifestPath);
        const file = adminStorage.file(`contratos/sync_manifest.json`);
        await file.save(manifestContent, {
            metadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=0, must-revalidate'
            }
        });
        await file.makePublic();
        console.log(`✅ Subido y publicado en Storage: contratos/sync_manifest.json`);
    } catch (err) {
        console.error("❌ Error subiendo manifest:", err.message);
    }
}
