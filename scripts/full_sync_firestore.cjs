const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Cargar credenciales
let serviceAccount;
if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
        console.error("❌ Error parseando GOOGLE_SERVICE_ACCOUNT_KEY:", e.message);
    }
} else {
    try {
        serviceAccount = require('../service-account.json');
    } catch (e) {
        console.error("❌ Falta service-account.json y no está definida la variable de entorno GOOGLE_SERVICE_ACCOUNT_KEY.");
        process.exit(1);
    }
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function syncToFirestore() {
    console.log('🚀 Iniciando Sincronización Maestra hacia Firestore...');
    
    // Solo sincronizaremos Etapa 3 por ahora que es la que tiene la discrepancia
    const e3Path = path.join(__dirname, '../public/contratos/E3_Master.json');
    
    if (!fs.existsSync(e3Path)) {
        console.error('❌ No se encontró el archivo E3_Master.json');
        return;
    }

    const data = JSON.parse(fs.readFileSync(e3Path, 'utf8'));
    console.log(`📊 Total de folios en local: ${data.length}`);

    // Solo subiremos los que tienen cambios o un estado específico si quisiéramos ahorrar,
    // pero para asegurar la "Verdad", subiremos los bloques de auditoría.
    
    const BATCH_SIZE = 500;
    let batch = db.batch();
    let count = 0;
    let totalSynced = 0;

    for (const record of data) {
        // Solo nos interesan los que tienen RESULTADO_AUDITORIA para sincronizar el estado
        if (!record.FOLIO) continue;

        const docRef = db.collection('audit_records').doc(String(record.FOLIO));
        
        // Preparar objeto de actualización
        const updateData = {
            RESULTADO_AUDITORIA: record.RESULTADO_AUDITORIA || 'SIN CARPETA',
            UPDATED_AT: admin.firestore.FieldValue.serverTimestamp(),
            STAGE: 'E3'
        };

        // Si tiene fotos, incluirlas para que no se pierdan en el dashboard
        if (record.PHOTOS) updateData.PHOTOS = record.PHOTOS;
        if (record.HAS_INITIAL) updateData.HAS_INITIAL = record.HAS_INITIAL;
        if (record.HAS_CAJA) updateData.HAS_CAJA = record.HAS_CAJA;
        if (record.HAS_TERMINADO) updateData.HAS_TERMINADO = record.HAS_TERMINADO;

        batch.set(docRef, updateData, { merge: true });
        
        count++;
        totalSynced++;

        if (count >= BATCH_SIZE) {
            console.log(`📤 Subiendo bloque... (${totalSynced}/${data.length})`);
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }

    console.log(`✅ Sincronización completada. ${totalSynced} folios actualizados en la nube.`);
    process.exit(0);
}

syncToFirestore().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
