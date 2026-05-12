import { getGoogleServices } from './googleClient.js';
import { STAGES_CONFIG } from './config.js';
import { mapearDriveAdmin, mapearDriveSupervisor, listarArchivosFolio } from './driveIndex.js';
import { normalizeFolio, sanitizeFileName } from './utils.js';
import { auditFolioFromFiles, generarAuditDetail } from './auditEngine.js';
import { initDb, upsertFolioStatus, saveSyncToken } from './stateStore.js';
import { saveContractJson, updateDataMock, clearPublicDir } from './outputStore.js';
import pLimit from 'p-limit';

async function main() {
    console.log("🚀 Iniciando Reconstrucción Completa del Índice...");
    const { drive, sheets } = await getGoogleServices();
    
    initDb();
    clearPublicDir();

    const globalTotals = {};
    const filtersMap = {};
    const errorTypesSet = new Set(["OK"]);
    const allRecordsByContract = {};

    for (const stage of STAGES_CONFIG) {
        console.log(`\n📂 Procesando Etapa: ${stage.id}...`);
        
        let folderMap = {};
        if (stage.driveType === 'ADMIN') {
            folderMap = await mapearDriveAdmin(drive, stage.driveId);
        } else {
            folderMap = await mapearDriveSupervisor(drive, stage.driveId);
        }

        const tokenRes = await drive.changes.getStartPageToken({ supportsAllDrives: true, includeItemsFromAllDrives: true });
        saveSyncToken(stage.id, tokenRes.data.startPageToken);

        const sheetRes = await sheets.spreadsheets.values.get({
            spreadsheetId: stage.sheetId,
            range: stage.name
        });
        const rows = sheetRes.data.values;
        if (!rows || rows.length < 2) continue;

        const headers = rows[0].map(h => h.trim().toUpperCase());
        const dataRows = rows.slice(1);

        const limit = pLimit(20);
        let count = 0;

        await Promise.all(dataRows.map(rowValues => limit(async () => {
            const row = {};
            headers.forEach((h, i) => row[h] = rowValues[i] || "");
            
            const folioStr = normalizeFolio(String(row['FOLIO']).trim());
            const folderInfos = folderMap[folioStr];
            const folderId = folderInfos ? folderInfos[0].id : null;
            
            const auditResult = folderId 
                ? await auditFolioFromFiles(await listarArchivosFolio(drive, folderId), row['FECHA'] || row['FECHA_REPORTE'], stage.id)
                : { status: "SIN CARPETA", photos: null, isNewSet: false, encontradas: [], faltanEnSetCompleto: [] };

            const empresa = row['EMPRESA'] || "DESCONOCIDA";
            const contrato = row['ID'] || "SIN_ID";
            const folioKey = `${stage.id}_${empresa}_${contrato}_${folioStr}`;

            const auditDetail = generarAuditDetail(folioStr, row['FECHA'] || row['FECHA_REPORTE'], auditResult.isNewSet === false, auditResult.encontradas);

            const record = {
                FOLIO: row['FOLIO'],
                FECHA: row['FECHA'] || row['FECHA_REPORTE'] || '',
                RESULTADO_AUDITORIA: auditResult.status,
                CALLE: row['CALLE'],
                COLONIA: row['COLONIA'],
                DELEGACION: row['DELEGACION'],
                _company: empresa,
                _stage: stage.id,
                _folderId: folderId,
                PHOTOS: auditResult.photos,
                EXTRA_PHOTOS: auditResult.extraFilesCount || 0,
                _isNewSet: auditResult.isNewSet || false,
                _auditDetail: auditDetail,
                _faltanNEO: auditResult.faltanEnSetCompleto || [],
                _uploadEmail: stage.uploadEmail || null,
                ID: contrato // Mantener el ID de contrato para el JSON
            };

            // Guardar en DB
            upsertFolioStatus.run(
                folioKey, stage.id, empresa, contrato, folioStr,
                auditResult.status, JSON.stringify(auditResult.photos),
                auditResult.isNewSet ? 1 : 0, JSON.stringify(auditResult.encontradas),
                JSON.stringify(auditResult.faltanEnSetCompleto), stage.uploadEmail || null, folderId
            );

            // Agrupar para archivos de salida
            const contractKey = `${stage.id}||${empresa}||${contrato}`;
            if (!allRecordsByContract[contractKey]) allRecordsByContract[contractKey] = [];
            allRecordsByContract[contractKey].push(record);

            count++;
            if (count % 100 === 0) process.stdout.write(".");
        })));
    }

    console.log("\n\n💾 Generando archivos de salida...");
    const resumenData = [];

    for (const [key, records] of Object.entries(allRecordsByContract)) {
        const [stage, empresa, contrato] = key.split('||');
        
        // Totales por contrato
        const summary = {
            EMPRESA_RAIZ_MASTER: empresa,
            ID: contrato,
            _stage: stage,
            TOTAL_OMISIONES: records.length
        };

        records.forEach(r => {
            const st = r.RESULTADO_AUDITORIA;
            summary[st] = (summary[st] || 0) + 1;
            globalTotals[st] = (globalTotals[st] || 0) + 1;
            errorTypesSet.add(st);
        });

        resumenData.push(summary);
        saveContractJson(stage, empresa, contrato, records);

        if (!filtersMap[empresa]) filtersMap[empresa] = [];
        if (!filtersMap[empresa].includes(contrato)) filtersMap[empresa].push(contrato);
    }

    updateDataMock({
        errorTypes: Array.from(errorTypesSet),
        globalTotals,
        resumenData,
        filtersMap
    });

    console.log("✅ Reconstrucción completa exitosa.");
}

main().catch(console.error);
