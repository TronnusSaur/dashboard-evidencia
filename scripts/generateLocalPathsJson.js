import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const TABLE_NAME = 'bacheo';
const STAGE_NAME_MAPPING = {
    'E1': '1 ETAPA',
    'E2': '2 ETAPA',
    'E3': '3 ETAPA',
};

const DB_PATH = path.join(process.cwd(), '.incremental-state', 'audit.db');
const PUBLIC_DIR = path.join(process.cwd(), 'public', 'contratos');
const MOCK_PATH = path.join(process.cwd(), 'src', 'dataMock.js');

function normalizeFolio(f) {
    if (!f) return '';
    let trimmed = String(f).trim().replace(/\s*-\s*/g, '-');
    if (/^\d+$/.test(trimmed)) return trimmed.padStart(3, '0');
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        return `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }
    return trimmed;
}

async function main() {
    console.log("🚀 Iniciando generador de JSONs con rutas locales NGINX...");

    if (!fs.existsSync(DB_PATH)) {
        console.error(`❌ No se encontró la base de datos de auditoría en: ${DB_PATH}`);
        process.exit(1);
    }

    const db = new Database(DB_PATH, { readonly: true });
    
    // Consultar folios auditados de la base de datos
    const records = db.prepare(`
        SELECT stage, empresa, contrato, folio, status, photos_json, folder_id
        FROM folio_status
        WHERE photos_json IS NOT NULL AND photos_json != '' AND photos_json != '{}'
    `).all();

    console.log(`📦 Se encontraron ${records.length} folios con registros fotográficos.`);

    // Agrupar por contrato
    const grupos = {};
    const globalTotals = {};
    const errorTypesSet = new Set(["OK"]);
    const filtersMap = {};
    const resumenData = [];

    records.forEach(row => {
        if (row.stage === 'E3_SUP') return; // Omitir supervisores

        let photos = {};
        try {
            photos = JSON.parse(row.photos_json);
        } catch (e) {
            return;
        }
        if (!photos) return;

        const folioStr = normalizeFolio(row.folio);
        const stageName = STAGE_NAME_MAPPING[row.stage] || row.stage;
        const contractFolder = `${row.empresa}_${row.contrato}`;
        
        // Construir rutas NGINX
        const photosMap = {};
        if (photos.INICIAL) {
            photosMap["INICIAL"] = {
                view: `Imágenes/${stageName}/${contractFolder}/${folioStr}/${folioStr}_inicial.jpg`
            };
        }
        if (photos.CAJA) {
            photosMap["CAJA"] = {
                view: `Imágenes/${stageName}/${contractFolder}/${folioStr}/${folioStr}_caja.jpg`
            };
        }
        if (photos.TERMINADO) {
            photosMap["FINAL"] = {
                view: `Imágenes/${stageName}/${contractFolder}/${folioStr}/${folioStr}_terminado.jpg`
            };
        }

        const recordObj = {
            FOLIO: folioStr,
            RESULTADO_AUDITORIA: row.status || "SIN CARPETA",
            CALLE: "", // Se completará después o quedará vacío si no hay metadata
            COLONIA: "",
            DELEGACION: "",
            _company: row.empresa,
            _stage: row.stage,
            _folderId: row.folder_id,
            PHOTOS: photosMap
        };

        const key = `${row.stage}_${row.empresa}_${row.contrato}`;
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(recordObj);

        globalTotals[row.status] = (globalTotals[row.status] || 0) + 1;
        errorTypesSet.add(row.status);
    });

    // Limpiar carpeta de salida
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    
    console.log("📂 Escribiendo archivos JSON por contrato...");
    for (const [key, records] of Object.entries(grupos)) {
        const [stage, emp, ...idParts] = key.split('_');
        const id = idParts.join('_');

        if (!filtersMap[emp]) filtersMap[emp] = [];
        if (!filtersMap[emp].includes(id)) filtersMap[emp].push(id);

        const summaryRow = {
            EMPRESA_RAIZ_MASTER: emp,
            ID: id,
            _stage: stage,
            TOTAL_OMISIONES: records.length,
        };
        errorTypesSet.forEach(t => summaryRow[t] = 0);

        records.forEach(r => {
            const st = r.RESULTADO_AUDITORIA || "SIN CARPETA";
            summaryRow[st]++;
        });

        resumenData.push(summaryRow);

        let fileName = `${key}.json`.replace(/[\/\\]/g, '-').replace(/ /g, '_');
        fs.writeFileSync(path.join(PUBLIC_DIR, fileName), JSON.stringify(records, null, 2));
    }

    console.log("Consolidando archivos Master por Etapa...");
    const stages = ['E1', 'E2', 'E3'];
    for (const stage of stages) {
        const files = fs.readdirSync(PUBLIC_DIR).filter(f => 
            f.startsWith(`${stage}_`) && f.endsWith('.json') && !f.includes('_Master')
        );
        
        let masterData = [];
        for (const file of files) {
            try {
                const filePath = path.join(PUBLIC_DIR, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                masterData = masterData.concat(content);
            } catch (e) {
                console.error(`❌ Error en ${file}:`, e.message);
            }
        }
        
        const outputPath = path.join(PUBLIC_DIR, `${stage}_Master.json`);
        fs.writeFileSync(outputPath, JSON.stringify(masterData, null, 2));
        console.log(`  ✅ ${stage}_Master.json creado con ${masterData.length} folios.`);
    }

    // Generar dataMock.js
    const errorTypes = Array.from(errorTypesSet);
    const mockContent = `// Archivo Auto-generado por Antigravity
export const ERROR_TYPES = ${JSON.stringify(errorTypes, null, 2)};
export const GLOBAL_TOTALS = ${JSON.stringify(globalTotals, null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;
    fs.writeFileSync(MOCK_PATH, mockContent, 'utf8');
    console.log("✨ Misión cumplida. Archivos locales generados con éxito.");
}

main().catch(err => {
    console.error("❌ Error:", err);
});
