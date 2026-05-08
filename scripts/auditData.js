import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';

dotenv.config();

// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════
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

// Tiempo máximo de ejecución: 8 minutos (deja margen para commit + push)
const MAX_RUNTIME_MS = 8 * 60 * 1000;
const START_TIME = Date.now();
let TIMED_OUT = false;

function checkTimeout() {
    if (Date.now() - START_TIME > MAX_RUNTIME_MS) {
        TIMED_OUT = true;
        return true;
    }
    return false;
}

// ══════════════════════════════════════════════════════════════
// PATRONES Y CATEGORÍAS (UNIFICADO: solo TERMINADO, nunca FINAL)
// ══════════════════════════════════════════════════════════════
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
 * Retorna null si no se puede determinar.
 */
function isLegacyByDate(fechaStr) {
    if (!fechaStr || !String(fechaStr).trim()) return null;
    const str = String(fechaStr).trim();
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
    const native = new Date(str);
    if (!isNaN(native.getTime())) {
        return native < LEGACY_CUTOFF_DATE;
    }
    return null;
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

// Normalizar Folio
const normalizeFolio = (f) => {
    if (!f) return f;
    let trimmed = String(f).trim().replace(/\s*-\s*/g, '-');
    if (/^\d+$/.test(trimmed)) return trimmed.padStart(3, '0');
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        return `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }
    return trimmed;
};

// ══════════════════════════════════════════════════════════════
// GOOGLE AUTH
// ══════════════════════════════════════════════════════════════
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
        credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
        scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return await auth.getClient();
}

// ══════════════════════════════════════════════════════════════
// DRIVE HELPERS (ORIGINAL SPEED — SOLO FOLDER IDs)
// ══════════════════════════════════════════════════════════════
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

/**
 * Audita fotos de un folio consultando la API de Drive.
 * SOLO se llama si el folio NO está en caché.
 */
async function auditarFotos(drive, folderIds, fechaStr) {
    if (!folderIds || folderIds.length === 0) return { status: "SIN CARPETA", photos: null, isNewSet: false };
    try {
        let todasLasFotos = [];
        for (const folderId of folderIds) {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: "files(name, webViewLink, thumbnailLink)",
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                pageSize: 100
            });
            todasLasFotos.push(...(res.data.files || []).map(f => ({
                name: f.name.toLowerCase(),
                webViewLink: f.webViewLink,
                thumbnailLink: f.thumbnailLink
            })));
        }

        if (todasLasFotos.length === 0) return { status: "CARPETA VACÍA", photos: null, isNewSet: false };

        const encontradas = new Set();
        const photosMap = {};
        for (const cat of Object.keys(PATRONES)) { photosMap[cat] = null; }

        for (const f of todasLasFotos) {
            for (const [cat, patrones] of Object.entries(PATRONES)) {
                if (patrones.some(p => f.name.includes(p))) {
                    encontradas.add(cat);
                    if (!photosMap[cat]) {
                        photosMap[cat] = { thumbnail: f.thumbnailLink, view: f.webViewLink };
                    }
                    break;
                }
            }
        }

        const extraFilesCount = todasLasFotos.length - encontradas.size;

        // Legacy detection por fecha, fallback por heurístico
        const legacyByDate = isLegacyByDate(fechaStr);
        let esSetNuevo;
        if (legacyByDate !== null) {
            esSetNuevo = !legacyByDate;
        } else {
            const nuevosSufijos = ["_folio", "_corte", "_demolicion", "_liga", "_mezcla", "_limpieza"];
            esSetNuevo = todasLasFotos.some(f => nuevosSufijos.some(s => f.name.includes(s)));
        }

        const categoriasRequeridas = esSetNuevo ? CATEGORIAS_NUEVO : CATEGORIAS_LEGACY;
        const faltan = categoriasRequeridas.filter(c => !encontradas.has(c));
        const status = faltan.length === 0 ? "OK" : "FALTA: " + faltan.join(" + ");

        return { status, photos: photosMap, extraFilesCount, isNewSet: esSetNuevo, encontradas };
    } catch (e) {
        console.error(`Error accediendo a folio: ${e.message}`);
        return { status: "ERROR DE ACCESO", photos: null, isNewSet: false };
    }
}

// ══════════════════════════════════════════════════════════════
// MAPEO DE DRIVES — SOLO FOLDER IDs (RÁPIDO)
// ══════════════════════════════════════════════════════════════
async function mapearDriveAdmin(drive, rootId) {
    const dictMap = {};
    const contratos = await obtenerPaginado(drive, `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const limit = pLimit(5);
    await Promise.all(contratos.map(c => limit(async () => {
        const fols = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        for (const f of fols) {
            const cleanName = f.name.split('_')[0].replace(/folio/ig, '').trim();
            const folioKey = normalizeFolio(cleanName.replace(/\s*-\s*/g, '-'));
            if (!dictMap[folioKey]) dictMap[folioKey] = [];
            dictMap[folioKey].push(f.id);
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
                if (!dictMap[folioKey]) dictMap[folioKey] = [];
                dictMap[folioKey].push(f.id);
            }
        }
    })));
    return dictMap;
}

// ══════════════════════════════════════════════════════════════
// PROCESAMIENTO POR ETAPA
// ══════════════════════════════════════════════════════════════
async function procesarEtapa(drive, sheets, config, auditCache) {
    console.log(`\n📂 Procesando ${config.id}: ${config.name}...`);

    if (checkTimeout()) {
        console.log(`  ⏰ TIMEOUT: Saltando ${config.id} para guardar progreso.`);
        return [];
    }

    // 1. Mapeo de Drive (RÁPIDO — solo folder IDs)
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

    // 3. Auditoría con caché + timeout
    const auditLimit = pLimit(20);
    let completados = 0;
    let cacheHits = 0;
    let apiCalls = 0;

    const auditTasks = df.map((row) => auditLimit(async () => {
        // Abort si timeout
        if (TIMED_OUT) return;

        const folioStr = normalizeFolio(String(row['FOLIO']).trim());
        const folioIds = dictMap[folioStr];
        const fechaStr = row['FECHA'] || row['FECHA_REPORTE'] || '';

        const cacheKey = `${config.id}_${folioStr}_${folioIds ? folioIds.join('-') : 'null'}`;
        const cached = auditCache[cacheKey];

        // CACHE HIT — no API call needed
        if (cached && typeof cached === 'object' && cached.photos && folioIds && folioIds.length > 0) {
            row['RESULTADO_AUDITORIA'] = cached.status;
            row['PHOTOS'] = cached.photos;
            row['_folderId'] = folioIds[0];
            row['_isNewSet'] = cached.isNewSet || false;
            row['EXTRA_PHOTOS'] = cached.extraFilesCount || 0;
            cacheHits++;
            completados++;
            return;
        }

        // CACHE MISS — API call
        const resultado = await auditarFotos(drive, folioIds, fechaStr);
        row['RESULTADO_AUDITORIA'] = resultado.status;
        row['PHOTOS'] = resultado.photos;
        row['EXTRA_PHOTOS'] = resultado.extraFilesCount || 0;
        row['_isNewSet'] = resultado.isNewSet || false;
        row['_folderId'] = folioIds && folioIds.length > 0 ? folioIds[0] : null;

        // Cache the result (OK and errors both)
        if (folioIds && folioIds.length > 0) {
            auditCache[cacheKey] = {
                status: resultado.status,
                photos: resultado.photos,
                extraFilesCount: resultado.extraFilesCount || 0,
                isNewSet: resultado.isNewSet || false
            };
        }

        apiCalls++;
        completados++;

        if (completados % 200 === 0) {
            const porcentaje = ((completados / df.length) * 100).toFixed(1);
            const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(0);
            console.log(`  [${config.id}] ${completados}/${df.length} (${porcentaje}%) | Cache: ${cacheHits} | API: ${apiCalls} | ${elapsed}s`);
        }

        // Check timeout periodically
        if (completados % 100 === 0) checkTimeout();
    }));

    await Promise.all(auditTasks);
    console.log(`  ✅ ${config.id}: ${completados} registros (Cache: ${cacheHits}, API: ${apiCalls})`);
    return df;
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
    console.log("👑 Kinger: Iniciando la Auditoría Magistral...");
    const authClient = await getAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Cargar caché
    let auditCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            auditCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            console.log(`📦 Caché cargada: ${Object.keys(auditCache).length} entradas.`);
        } catch (e) {
            console.warn("⚠️ Caché corrupta, iniciando limpia.");
            auditCache = {};
        }
    } else {
        console.log("📦 Sin caché previa — cold start.");
    }

    let allData = [];
    for (const config of STAGES_CONFIG) {
        const stageData = await procesarEtapa(drive, sheets, config, auditCache);
        allData.push(...stageData);

        // Guardar caché después de cada etapa
        fs.writeFileSync(CACHE_FILE, JSON.stringify(auditCache, null, 2));
        console.log(`  💾 Caché guardada (${Object.keys(auditCache).length} entradas).`);

        if (TIMED_OUT) {
            console.log("⏰ TIMEOUT alcanzado — guardando progreso parcial.");
            break;
        }
    }

    // Generación de Salidas (solo si tenemos datos)
    if (allData.length === 0) {
        console.log("⚠️ Sin datos para generar salidas.");
        process.exit(0);
    }

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

        let fileName = `${stage}_${emp}_${id}.json`.replace(/[\\/\\]/g, '-').replace(/ /g, '_');
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

    const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
    if (TIMED_OUT) {
        console.log(`\n⏰ Completado parcialmente en ${elapsed}s. La próxima ejecución continuará con caché.`);
    } else {
        console.log(`\n✅ ¡Misión Cumplida en ${elapsed}s! La corona brilla sobre todas las etapas.`);
    }
}

main().catch(err => {
    console.error("❌ Error fatal:", err.message);
    // Intentar guardar caché antes de morir
    try {
        if (fs.existsSync(CACHE_FILE)) {
            console.log("💾 Caché preservada a pesar del error.");
        }
    } catch (_) {}
    process.exit(1);
});
