import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Intentar cargar la cuenta de servicio
let serviceAccount;

if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
        console.error("❌ Error parseando GOOGLE_SERVICE_ACCOUNT_KEY desde variables de entorno:", e.message);
    }
} else {
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
            credential: admin.credential.cert(serviceAccount)
        });
    }
}

export const adminDb = serviceAccount ? admin.firestore() : null;

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
