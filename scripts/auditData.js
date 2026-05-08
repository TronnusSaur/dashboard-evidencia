import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';

dotenv.config();

// CONFIGURACIÓN 
const SHEET_ID = process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8';

const STAGES_CONFIG = [
    {
        id: 'E1',
        name: '1 - ETAPA 1 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE_E1 || '1RJrTrWIp7sYZDyAYhmsq_5xqaLCj3CYN',
        sheetId: process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
        driveType: 'ADMIN'
    },
    {
        id: 'E2',
        name: '2 - ETAPA 2 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE || '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik',
        sheetId: process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
        driveType: 'ADMIN'
    },
    {
        id: 'E3',
        name: '3 - ETAPA 3 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE_E3 || '1EqejY8Bm2c3NvQ0PEOh7DNUEABuJmHMr',
        sheetId: process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU',
        driveType: 'ADMIN'
    },
    {
        id: 'E3_SUP',
        name: '3 - ETAPA 3 MASTER', // Misma hoja de cálculo
        driveId: '1B54IJmRS_D2J_FECE75RRo3UejfzUPU6', // Raíz de Supervisores
        sheetId: process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU',
        driveType: 'SUPERVISOR'
    }
];

const SUPERVISOR_ROOT_ID = '1B54IJmRS_D2J_FECE75RRo3UejfzUPU6';

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'contratos');
const MOCK_PATH = path.join(process.cwd(), 'src', 'dataMock.js');
const CACHE_FILE = path.join(process.cwd(), 'audit_cache.json');

const PATRONES = {
    "INICIAL": ["_inicial"],
    "FOLIO": ["_folio"],
    "CORTE": ["_corte"],
    "DEMOLICION": ["_demolicion"],
    "CAJA": ["_caja"],
    "LIGA": ["_liga"],
    "MEZCLA": ["_mezcla"],
    "TERMINADO": ["_terminado"],
    "LIMPIEZA": ["_limpieza"]
};

// Fecha de corte: folios con FECHA anterior al 20 de abril 2025 se consideran Legacy (3 fotos)
const LEGACY_CUTOFF_DATE = new Date('2025-04-20');

const CATEGORIAS_LEGACY = ["INICIAL", "CAJA", "TERMINADO"];
const CATEGORIAS_NUEVO = ["INICIAL", "FOLIO", "CORTE", "DEMOLICION", "CAJA", "LIGA", "MEZCLA", "TERMINADO", "LIMPIEZA"];

/**
 * Determina si un folio es Legacy basándose en su fecha.
 * Si la fecha no es parseable, cae al heurístico de archivos.
 */
function isLegacyByDate(fechaStr) {
    if (!fechaStr || !String(fechaStr).trim()) return null; // null = indeterminado
    const str = String(fechaStr).trim();
    // Intentar parseo DD/MM/AAAA o DD/MM/AA
    const parts = str.split('/');
    if (parts.length === 3) {
        const [d, m, y] = parts;
        let year = parseInt(y, 10);
        if (year < 100) year += 2000;
        const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
        if (!isNaN(date.getTime())) {
            return date < LEGACY_CUTOFF_DATE;
        }
    }
    // Intentar parseo nativo como fallback
    const native = new Date(str);
    if (!isNaN(native.getTime())) {
        return native < LEGACY_CUTOFF_DATE;
    }
    return null; // No se pudo parsear
}

/**
 * Genera el detalle de auditoría en texto legible.
 */
function generarAuditDetail(folioStr, fechaStr, isLegacy, categoriasRequeridas, encontradas) {
    const fechaLabel = fechaStr ? ` - ${String(fechaStr).trim()}` : '';
    const setLabel = isLegacy ? 'LEGACY' : '9 FOTOS';
    let lines = [`Folio ${folioStr}${fechaLabel} (${setLabel})`];
    for (const cat of categoriasRequeridas) {
        const found = encontradas.has(cat);
        lines.push(`  → ${folioStr}_${cat.toLowerCase()} ${found ? '✅' : '❌'}`);
    }
    return lines.join('\n');
}

// Normalizar Folio: Asegurar 3 dígitos para numéricos y remover espacios extraños en subdivisiones (ej: "8041 - 1" -> "8041-1")
const normalizeFolio = (f) => {
    if (!f) return f;
    let trimmed = String(f).trim().replace(/\s*-\s*/g, '-'); // "8041 - 1" -> "8041-1"

    // Si es un número puro, asegurar 3 dígitos
    if (/^\d+$/.test(trimmed)) {
        return trimmed.padStart(3, '0');
    }

    // Si tiene un guion pero la primera parte es número (ej: "1-1"), asegurar 3 dígitos del primer número
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        return `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }

    return trimmed;
};

// Autenticación con Google Service Account
async function getAuth() {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        if (fs.existsSync('service-account.json')) {
            credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
        } else {
            console.warn("⚠️ No se encontró GOOGLE_SERVICE_ACCOUNT_KEY.");
            const defaultAuth = new google.auth.GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            return await defaultAuth.getClient();
        }
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    return await auth.getClient();
}

async function obtenerPaginado(drive, query) {
    let items = [];
    let pageToken = null;
    do {
        const res = await drive.files.list({
            q: query,
            fields: "nextPageToken, files(id, name)",
            pageToken: pageToken,
            pageSize: 1000,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });
        items.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return items;
}

// Optimized in-memory auditor
function auditarFotosInMemory(filesInFolio, fechaStr) {
    if (!filesInFolio || filesInFolio.length === 0) return { status: 'SIN CARPETA', photos: null, isNewSet: false };

    const esLegacy = isLegacyByDate(fechaStr);
    const categorias = esLegacy ? CATEGORIAS_LEGACY : CATEGORIAS_NUEVO;
    const esSetNuevo = !esLegacy;

    const photosMap = {};
    const encontradas = new Set();

    filesInFolio.forEach(f => {
        const fileName = f.name.toLowerCase();
        for (const [cat, patrones] of Object.entries(PATRONES)) {
            if (patrones.some(p => fileName.includes(p))) {
                encontradas.add(cat);
                if (!photosMap[cat]) {
                    photosMap[cat] = {
                        thumbnail: f.thumbnailLink,
                        view: f.webViewLink
                    };
                }
                break;
            }
        }
    });

    const faltantes = categorias.filter(cat => !encontradas.has(cat));
    const extraFilesCount = Math.max(0, filesInFolio.length - encontradas.size);

    let status = 'OK';
    if (encontradas.size === 0) {
        status = 'CARPETA VACÍA';
    } else if (faltantes.length > 0) {
        status = `FALTA: ${faltantes.join(', ').toUpperCase()}`;
    }

    // Generar detalle legible
    let detail = `Folio - ${fechaStr || 'Sin Fecha'} (${esSetNuevo ? '9 FOTOS' : 'LEGACY'})\n`;
    const catLabels = esSetNuevo ? CATEGORIAS_NUEVO : CATEGORIAS_LEGACY;
    catLabels.forEach(cat => {
        const ok = encontradas.has(cat) ? '✅' : '❌';
        detail += `  → ${cat} ${ok}\n`;
    });

    return { status, photos: photosMap, extraFilesCount, isNewSet: esSetNuevo, detail };
}

async function procesarEtapa(drive, sheets, config, auditCache) {
    console.log(`\n📂 Procesando ${config.id}: ${config.name}...`);

    // 1. Mapeo de Drive
    let dictMap = {};
    if (config.driveType === 'ADMIN') {
        console.log(`  🗺️ Mapeando carpetas en Drive Admin para ${config.id}...`);
        dictMap = await mapearDriveAdmin(drive, config.driveId);
    } else {
        console.log(`  🔍 Mapeando carpetas en Drive Supervisor (Recursivo) para ${config.id}...`);
        dictMap = await mapearDriveSupervisor(drive, config.driveId);
    }
    console.log(`  ✅ ${Object.keys(dictMap).length} Carpetas mapeadas.`);

    // 2. Cargar Sheets
    console.log(`  📊 Cargando registros de Sheets (${config.name})...`);
    const currentSheetId = config.sheetId || SHEET_ID;
    const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: currentSheetId,
        range: config.name
    });

    const rows = sheetData.data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().toUpperCase());
    const df = rows.slice(1).map(row => {
        const obj = { _stage: config.id, _driveType: config.driveType };
        headers.forEach((h, i) => obj[h] = row[i] || "");
        return obj;
    });

    // 3. Auditoría Real
    const auditLimit = pLimit(10);
    let auditadosNuevos = 0;
    let completados = 0;

    const saveCache = () => {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(auditCache, null, 2));
        } catch (err) {
            console.error("  ⚠️ Error guardando caché intermedia:", err.message);
        }
    };

    const auditTasks = df.map((row) => auditLimit(async () => {
        const folioStr = normalizeFolio(String(row['FOLIO']).trim());
        const folioIds = dictMap[folioStr]?.ids;
        const fechaStr = row['FECHA'] || row['FECHA_REPORTE'] || '';

        const cacheKey = `${config.id}_${folioStr}_${folioIds ? folioIds.join('-') : 'null'}`;
        const cached = auditCache[cacheKey];
        if (cached && typeof cached === 'object' && cached.photos && folioIds && folioIds.length > 0) {
            row['RESULTADO_AUDITORIA'] = cached.status;
            row['PHOTOS'] = cached.photos;
            row['_folderId'] = folioIds[0];
            row['_isNewSet'] = cached.isNewSet || false;
            row['EXTRA_PHOTOS'] = cached.extraFilesCount || 0;
            row['_auditDetail'] = cached.detail || `Folio ${row.FOLIO} - OK`;
            return;
        }

        const filesInFolio = dictMap[folioStr]?.files || [];
        const resultado = auditarFotosInMemory(filesInFolio, fechaStr);
        row['RESULTADO_AUDITORIA'] = resultado.status;
        row['PHOTOS'] = resultado.photos;
        row['EXTRA_PHOTOS'] = resultado.extraFilesCount || 0;
        row['_isNewSet'] = resultado.isNewSet || false;
        
        // Detalle legible solo para errores o por contrato
        if (resultado.status !== 'OK') {
            row['_auditDetail'] = resultado.detail;
        } else {
            row['_auditDetail'] = `Folio ${row.FOLIO} - OK`;
        }

        // Cache both OK and error results (saves re-auditing unchanged folios)
        if (folioIds && folioIds.length > 0) {
            auditCache[cacheKey] = {
                status: resultado.status,
                photos: resultado.photos,
                extraFilesCount: resultado.extraFilesCount || 0,
                isNewSet: resultado.isNewSet || false,
                detail: resultado.detail
            };
        }

        auditadosNuevos++;
        completados++;
        
        if (completados % 100 === 0 || completados === df.length) {
            const porcentaje = ((completados / df.length) * 100).toFixed(1);
            console.log(`  [Progreso] ${config.name}: ${completados} / ${df.length} folios auditados (${porcentaje}%)`);
        }

        // Checkpoint cada 500 folios o al final de la etapa
        if (completados % 500 === 0) {
            saveCache();
        }
        
        row['_folderId'] = folioIds && folioIds.length > 0 ? folioIds[0] : null;
    }));

    await Promise.all(auditTasks);
    console.log(`  ✅ ${df.length} registros auditados para ${config.id} (${config.driveType}).`);
    return df;
}

async function mapearDriveAdmin(drive, rootId) {
    const dictMap = {};
    const contratos = await obtenerPaginado(drive, `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const limit = pLimit(5);
    await Promise.all(contratos.map(c => limit(async () => {
        const fols = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        for (const f of fols) {
            const cleanName = f.name.split('_')[0].replace(/folio/ig, '').trim();
            const folioKey = normalizeFolio(cleanName.replace(/\s*-\s*/g, '-'));
            if (!dictMap[folioKey]) dictMap[folioKey] = { ids: [], files: [] };
            dictMap[folioKey].ids.push(f.id);

            // Fetch files in this folio immediately to avoid later calls
            const resFiles = await drive.files.list({
                q: `'${f.id}' in parents and trashed = false`,
                fields: 'files(id, name)'
            });
            dictMap[folioKey].files.push(...resFiles.data.files);
        }
    })));
    return dictMap;
}

async function mapearDriveSupervisor(drive, rootId) {
    const dictMap = {};
    const contratos = await obtenerPaginado(drive, `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const limit = pLimit(3);
    await Promise.all(contratos.map(c => limit(async () => {
        const weeks = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        for (const w of weeks) {
            const fols = await obtenerPaginado(drive, `'${w.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            for (const f of fols) {
                const folioKey = normalizeFolio(f.name.trim());
                if (!dictMap[folioKey]) dictMap[folioKey] = { ids: [], files: [] };
                dictMap[folioKey].ids.push(f.id);

                // Fetch files for this folio
                const resFiles = await drive.files.list({
                    q: `'${f.id}' in parents and trashed = false`,
                    fields: 'files(id, name)'
                });
                dictMap[folioKey].files.push(...resFiles.data.files);
            }
        }
    })));
    return dictMap;
}

async function main() {
    console.log("👑 Kinger: Iniciando la Auditoría Magistral (E1 + E2 + E3 Admin + E3 RAW)...");
    const authClient = await getAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    let auditCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        auditCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }

    let allData = [];
    for (const config of STAGES_CONFIG) {
        const stageData = await procesarEtapa(drive, sheets, config, auditCache);
        allData.push(...stageData);
    }

    // Guardar Caché
    fs.writeFileSync(CACHE_FILE, JSON.stringify(auditCache, null, 2));

    // Generación de Salidas
    console.log("\n📂 Generando archivos consolidados...");
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

    // Limpiar folder
    const oldFiles = fs.readdirSync(PUBLIC_DIR);
    oldFiles.forEach(f => {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(PUBLIC_DIR, f));
    });

    const globalTotals = {};
    const errorTypesSet = new Set(["OK"]);
    const filtersMap = {};
    const resumenData = [];

    const grupos = {};
    allData.forEach(row => {
        const emp = row['EMPRESA'];
        const id = row['ID'];
        const stage = row['_stage'];
        if (!emp || !id) return;

        // Use '||' as delimiter to avoid collision with 'E3_SUP' stage name
        const key = `${stage}||${emp}||${id}`;
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(row);

        const resAud = row['RESULTADO_AUDITORIA'] || "SIN CARPETA";
        globalTotals[resAud] = (globalTotals[resAud] || 0) + 1;
        errorTypesSet.add(resAud);
    });

    for (const [key, records] of Object.entries(grupos)) {
        const [stage, emp, id] = key.split('||');

        if (!filtersMap[emp]) filtersMap[emp] = [];
        if (!filtersMap[emp].includes(id)) filtersMap[emp].push(id);

        const summaryRow = {
            EMPRESA_RAIZ_MASTER: emp,
            ID: id,
            _stage: stage,
            TOTAL_OMISIONES: records.length,
        };
        errorTypesSet.forEach(t => summaryRow[t] = 0);

        const pendientes = [];
        records.forEach(r => {
            const st = r.RESULTADO_AUDITORIA || "SIN CARPETA";
            summaryRow[st]++;

            const fechaStr = r['FECHA'] || r['FECHA_REPORTE'] || '';
            const isLegacy = r._isNewSet === false;
            const categoriasReq = isLegacy ? CATEGORIAS_LEGACY : CATEGORIAS_NUEVO;
            // Build encontradas set from PHOTOS
            const encontradasSet = new Set();
            if (r.PHOTOS) {
                for (const [cat, val] of Object.entries(r.PHOTOS)) {
                    if (val) encontradasSet.add(cat);
                }
            }
            const folioNorm = normalizeFolio(String(r.FOLIO).trim());
            const auditDetail = generarAuditDetail(folioNorm, fechaStr, isLegacy, categoriasReq, encontradasSet);

            pendientes.push({
                FOLIO: r.FOLIO,
                FECHA: fechaStr,
                RESULTADO_AUDITORIA: st,
                CALLE: r.CALLE,
                COLONIA: r.COLONIA,
                DELEGACION: r.DELEGACION,
                _company: emp,
                _stage: stage,
                _folderId: r._folderId,
                PHOTOS: r.PHOTOS,
                EXTRA_PHOTOS: r.EXTRA_PHOTOS || 0,
                _isNewSet: r._isNewSet || false,
                _auditDetail: auditDetail
            });
        });

        resumenData.push(summaryRow);

        // Para E3_SUP, el nombre del archivo debe ser E3_SUP_EMPRESA_ID.json
        let fileName = `${stage}_${emp}_${id}.json`.replace(/[\/\\]/g, '-').replace(/ /g, '_');
        fs.writeFileSync(path.join(PUBLIC_DIR, fileName), JSON.stringify(pendientes, null, 2));
    }

    const errorTypes = Array.from(errorTypesSet);
    const mockContent = `// Archivo Auto-generado por Kinger
export const ERROR_TYPES = ${JSON.stringify(errorTypes, null, 2)};
export const GLOBAL_TOTALS = ${JSON.stringify(globalTotals, null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;
    fs.writeFileSync(MOCK_PATH, mockContent, 'utf8');

    console.log("\n✅ ¡Misión Cumplida! La corona brilla sobre ambas etapas.");
}

main().catch(console.error);

