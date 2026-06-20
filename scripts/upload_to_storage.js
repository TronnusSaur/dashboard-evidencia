import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { uploadJsonToStorage, uploadManifestToStorage } from './incremental/firebaseAdmin.js';

async function main() {
    console.log("🚀 Iniciando subida de JSONs a Firebase Storage...");
    const dir = join(process.cwd(), 'public', 'contratos');
    
    if (!existsSync(dir)) {
        console.error(`❌ El directorio ${dir} no existe.`);
        process.exit(1);
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'sync_manifest.json');
    console.log(`Found ${files.length} JSON files to upload.`);

    let count = 0;
    for (const file of files) {
        try {
            const raw = readFileSync(join(dir, file), 'utf8');
            if (!raw.trim()) {
                console.warn(`⚠️ Archivo vacío omitido: ${file}`);
                continue;
            }
            const data = JSON.parse(raw);
            await uploadJsonToStorage(file, data);
            count++;
        } catch (e) {
            console.error(`❌ Falló la subida de ${file}:`, e.message);
        }
    }
    
    console.log(`Successfully uploaded ${count} out of ${files.length} files.`);
    
    // Subir el manifest al final para asegurar atomicidad en el frontend
    console.log("📤 Subiendo sync_manifest.json...");
    try {
        await uploadManifestToStorage();
        console.log("✅ Manifest subido exitosamente.");
    } catch (e) {
        console.error("❌ Falló la subida del manifest:", e.message);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error("❌ Error fatal en la subida:", err);
    process.exit(1);
});
