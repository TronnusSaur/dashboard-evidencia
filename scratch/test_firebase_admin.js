import { adminDb } from '../scripts/incremental/firebaseAdmin.js';

async function test() {
    if (!adminDb) {
        console.error("❌ No se pudo inicializar Firebase Admin. Revisa service-account.json");
        return;
    }
    
    try {
        const collections = await adminDb.listCollections();
        console.log("✅ Conexión exitosa a Firebase!");
        console.log("Proyecto ID:", adminDb.projectId);
        console.log("Colecciones encontradas:", collections.map(c => c.id));
    } catch (e) {
        console.error("❌ Error de conexión:", e.message);
    }
}

test();
