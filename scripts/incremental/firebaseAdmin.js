import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Intentar cargar la cuenta de servicio
let serviceAccount;
try {
    const raw = readFileSync(join(process.cwd(), 'service-account.json'));
    serviceAccount = JSON.parse(raw);
} catch (e) {
    console.warn("⚠️ No se encontró service-account.json. La sincronización con Firebase estará desactivada.");
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
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
