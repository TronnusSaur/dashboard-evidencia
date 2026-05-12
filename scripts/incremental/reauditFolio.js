import { getDriveClient } from './googleClient.js';
import { listarArchivosFolio } from './driveIndex.js';
import { auditFolioFromFiles } from './auditEngine.js';
import { getFolioMetadata, upsertFolioStatus } from './stateStore.js';
import { updateSingleFolioInOutput } from './outputStore.js';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const folioToReaudit = String(args.folio || '');
const stageId = args.stage || '';

async function run() {
    if (!folioToReaudit || !stageId) {
        console.error("❌ Falta folio o stage");
        process.exit(1);
    }

    // 1. Obtener metadatos del folio desde la DB
    const meta = getFolioMetadata(folioToReaudit, stageId);
    if (!meta || !meta.drive_id) {
        console.error(`❌ No se encontró drive_id para el folio ${folioToReaudit} en la etapa ${stageId}`);
        process.exit(1);
    }

    console.log(`🩺 Re-auditando Folio ${folioToReaudit} (Folder: ${meta.drive_id})...`);

    const drive = await getDriveClient();

    // 2. Listar archivos actuales en Drive
    const files = await listarArchivosFolio(drive, meta.drive_id);
    
    // 3. Ejecutar motor de auditoría
    const auditResult = auditFolioFromFiles(files, meta.fecha_inicio, stageId);

    // 4. Actualizar base de datos local (SQLite)
    upsertFolioStatus(
        folioToReaudit,
        stageId,
        auditResult.status,
        JSON.stringify(auditResult.photos),
        auditResult.extraFilesCount,
        auditResult.isNewSet ? 1 : 0
    );

    // 5. Actualizar archivos JSON de salida (Granularmente)
    updateSingleFolioInOutput(folioToReaudit, stageId, meta.empresa, meta.contrato_id, {
        RESULTADO_AUDITORIA: auditResult.status,
        PHOTOS: auditResult.photos,
        EXTRA_PHOTOS: auditResult.extraFilesCount,
        _isNewSet: auditResult.isNewSet
    });

    console.log(`✅ Folio ${folioToReaudit} actualizado a: ${auditResult.status}`);
}

run().catch(console.error);
