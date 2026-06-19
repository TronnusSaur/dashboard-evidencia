import fs from 'fs';
import path from 'path';
import { uploadFolioToFirebase, uploadJsonToStorage } from './firebaseAdmin.js';
import { PUBLIC_DIR, MOCK_PATH } from './config.js';
import { sanitizeFileName } from './utils.js';

/**
 * Guarda el archivo JSON de un contrato específico.
 */
export function saveContractJson(stage, empresa, contratoId, data) {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    const safeEmp = sanitizeFileName(empresa);
    const safeId = sanitizeFileName(contratoId);
    const fileName = `${stage}_${safeEmp}_${safeId}.json`;
    const filePath = path.join(PUBLIC_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    // Subir a Firebase Storage en segundo plano
    uploadJsonToStorage(fileName, data).catch(e => console.error("Error subiendo contrato a Storage:", e.message));
}

/**
 * Regenera el archivo src/dataMock.js con los agregados globales.
 */
export function updateDataMock({ errorTypes, globalTotals, resumenData, filtersMap }) {
    const mockContent = `// Archivo Auto-generado - Sincronización Incremental
export const ERROR_TYPES = ${JSON.stringify(errorTypes, null, 2)};
export const GLOBAL_TOTALS = ${JSON.stringify(globalTotals, null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;
    fs.writeFileSync(MOCK_PATH, mockContent, 'utf8');
    // console.log(`✨ dataMock.js actualizado.`);
}

/**
 * Limpia el directorio de contratos (útil para rebuild completo).
 */
export function clearPublicDir() {
    if (fs.existsSync(PUBLIC_DIR)) {
        const files = fs.readdirSync(PUBLIC_DIR);
        files.forEach(f => {
            if (f.endsWith('.json')) {
                fs.unlinkSync(path.join(PUBLIC_DIR, f));
            }
        });
    }
}

/**
 * Actualiza un solo folio en su archivo JSON de contrato correspondiente.
 */
export function updateSingleFolioInOutput(folioStr, stage, empresa, contratoId, newData) {
    const safeEmp = sanitizeFileName(empresa);
    const safeId = sanitizeFileName(contratoId);
    
    // 1. Actualizar el archivo de contrato específico (ej: E1_ALSAFI_10.json)
    const contractFileName = `${stage}_${safeEmp}_${safeId}.json`;
    const contractPath = path.join(PUBLIC_DIR, contractFileName);

    if (fs.existsSync(contractPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
            const index = data.findIndex(r => String(r.FOLIO) === String(folioStr));
            if (index !== -1) {
                data[index] = { ...data[index], ...newData };
                fs.writeFileSync(contractPath, JSON.stringify(data, null, 2));

                // 3. Sincronizar con Firebase para tiempo real global
                const folioKey = `${stage}_${empresa}_${contratoId}_${folioStr}`;
                uploadFolioToFirebase(folioKey, {
                    status: newData.RESULTADO_AUDITORIA,
                    photos: Object.keys(newData.PHOTOS || {}).map(k => ({ id: newData.PHOTOS[k].id, cat: k })),
                    folio: folioStr,
                    stage: stage,
                    empresa: empresa,
                    contrato: contratoId
                }).catch(e => console.error("Firebase sync error:", e.message));
                
                // Subir archivo de contrato modificado a Storage
                uploadJsonToStorage(contractFileName, data).catch(e => console.error("Error subiendo a Storage:", e.message));
            }
        } catch (e) {
            console.error(`Error actualizando contrato JSON: ${e.message}`);
        }
    }

    // 2. Actualizar el Master global de la etapa (ej: E1_Master.json)
    const masterPath = path.join(PUBLIC_DIR, `${stage}_Master.json`);
    if (fs.existsSync(masterPath)) {
        try {
            const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
            const mIndex = masterData.findIndex(r => String(r.FOLIO) === String(folioStr));
            if (mIndex !== -1) {
                masterData[mIndex] = { ...masterData[mIndex], ...newData };
                fs.writeFileSync(masterPath, JSON.stringify(masterData, null, 2));
                
                // Subir archivo Master modificado a Storage
                uploadJsonToStorage(`${stage}_Master.json`, masterData).catch(e => console.error("Error subiendo a Storage:", e.message));
            }
        } catch (e) {
            console.error(`Error actualizando Master JSON: ${e.message}`);
        }
    }
}
