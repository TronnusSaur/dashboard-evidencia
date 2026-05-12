import { getGoogleServices } from './googleClient.js';
import { STAGES_CONFIG } from './config.js';
import { getSyncToken, saveSyncToken, upsertFolioStatus, getFolioStatus, updateGlobalAggregate } from './stateStore.js';
import { normalizeFolio } from './utils.js';
import { auditFolioFromFiles, generarAuditDetail } from './auditEngine.js';
import { listarArchivosFolio } from './driveIndex.js';
import { saveContractJson } from './outputStore.js';
import db from './stateStore.js';

/**
 * Resuelve el folio al que pertenece un fileId subiendo por la jerarquía de padres.
 */
async function resolveFolioFromFile(drive, fileId) {
    let currentId = fileId;
    while (currentId) {
        // ¿Es una carpeta de folio conocida en nuestra DB?
        const known = db.prepare("SELECT * FROM folio_status WHERE folder_id = ?").get(currentId);
        if (known) return known;

        // Si no, subimos un nivel
        try {
            const res = await drive.files.get({
                fileId: currentId,
                fields: "id, parents, name",
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });
            currentId = (res.data.parents && res.data.parents.length > 0) ? res.data.parents[0] : null;
        } catch (e) {
            break;
        }
    }
    return null;
}

async function processStageChanges(drive, stage) {
    const pageToken = getSyncToken(stage.id);
    if (!pageToken) {
        console.log(`⚠️ No hay token para ${stage.id}. Ejecute rebuildIndex primero.`);
        return;
    }

    console.log(`\n🔄 Procesando cambios para ${stage.id}...`);
    let nextToken = pageToken;
    const affectedFolios = new Set();

    try {
        let res;
        do {
            res = await drive.changes.list({
                pageToken: nextToken,
                fields: "newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, parents, trashed))",
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                pageSize: 100
            });

            for (const change of res.data.changes) {
                const file = change.file || { id: change.fileId };
                // Resolver qué folio se ve afectado
                const folio = await resolveFolioFromFile(drive, file.id);
                if (folio) {
                    affectedFolios.add(folio.folio_key);
                }
            }
            nextToken = res.data.nextPageToken;
        } while (nextToken);

        if (res.data.newStartPageToken) {
            saveSyncToken(stage.id, res.data.newStartPageToken);
        }

        console.log(`  🎯 Folios afectados detectados: ${affectedFolios.size}`);

        // Recalcular folios afectados
        for (const folioKey of affectedFolios) {
            const f = db.prepare("SELECT * FROM folio_status WHERE folio_key = ?").get(folioKey);
            if (!f) continue;

            console.log(`    Checking ${f.folio}...`);
            const files = await listarArchivosFolio(drive, f.folder_id);
            // Necesitamos la fecha del folio (debería estar en la DB o volver a leer Sheets)
            // Para simplificar, asumimos que la fecha no cambia a menudo, pero lo ideal es tenerla en la DB
            // (Añadí 'fecha' a la lógica de rebuildIndex en mi mente, pero no en el SQL, lo corregiré)
            
            const auditResult = await auditFolioFromFiles(files, null, f.stage); // Pendiente: fecha
            
            // Actualización diferencial de agregados (Simulada para este MVP)
            // ... restar f.status de totales, sumar auditResult.status ...

            upsertFolioStatus.run(
                f.folio_key, f.stage, f.empresa, f.contrato, f.folio,
                auditResult.status, JSON.stringify(auditResult.photos),
                auditResult.is_new_set, JSON.stringify(auditResult.encontradas),
                JSON.stringify(auditResult.faltan_neo_json), f.upload_email, f.folder_id
            );

            // Regenerar JSON del contrato
            const allInContract = db.prepare("SELECT * FROM folio_status WHERE stage = ? AND empresa = ? AND contrato = ?")
                                    .all(f.stage, f.empresa, f.contrato);
            
            // Mapear de DB a formato JSON esperado
            const jsonRecords = allInContract.map(r => ({
                FOLIO: r.folio,
                RESULTADO_AUDITORIA: r.status,
                PHOTOS: JSON.parse(r.photos_json),
                _stage: r.stage,
                _company: r.empresa,
                ID: r.contrato
                // ... más campos ...
            }));
            
            saveContractJson(f.stage, f.empresa, f.contrato, jsonRecords);
        }

    } catch (e) {
        console.error(`❌ Error procesando cambios: ${e.message}`);
    }
}

async function main() {
    const { drive } = await getGoogleServices();
    for (const stage of STAGES_CONFIG) {
        await processStageChanges(drive, stage);
    }
}

main().catch(console.error);
