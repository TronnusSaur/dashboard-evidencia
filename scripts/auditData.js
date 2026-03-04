import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';

dotenv.config();

// CONFIGURACIÓN 
const ID_RAIZ_2DA_ETAPA = process.env.FOLDER_ID_DRIVE || '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik';
const SHEET_ID = process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8';
const HOJA_NOMBRE = 'ETAPA 2 MASTER';
const PUBLIC_DIR = path.join(process.cwd(), 'public', 'contratos');
const MOCK_PATH = path.join(process.cwd(), 'src', 'dataMock.js');
const CACHE_FILE = path.join(process.cwd(), 'audit_cache.json');

const PATRONES = {
    "INICIAL": ["_inicial", "_i", " inicial"],
    "CAJA": ["_caja", "_proceso", " caja", " proceso"],
    "FINAL": ["_terminado", "_final", " terminado", " final"]
};

// Autenticación con Google Service Account
async function getAuth() {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        // Fallback local file if it exists (for local testing sin env var literal)
        if (fs.existsSync('service-account.json')) {
            credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
        } else {
            console.warn("⚠️ No se encontró GOOGLE_SERVICE_ACCOUNT_KEY ni service-account.json. Fallará si no está en un entorno autorizado por default.");
            const auth = new google.auth.GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            return auth.getClient();
        }
    }

    return new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly']
    );
}

// Obtener todas las páginas de una query de Drive
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

// Analizar fotos dentro del folder de un folio
async function auditarFotos(drive, folioId) {
    if (!folioId) return "SIN CARPETA";
    try {
        const query = `'${folioId}' in parents and trashed = false`;
        const res = await drive.files.list({
            q: query,
            fields: "files(name)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageSize: 100 // generally < 20 photos
        });

        const fotos = (res.data.files || []).map(f => f.name.toLowerCase());
        if (fotos.length === 0) return "CARPETA VACÍA";

        const encontradas = new Set();
        for (const f of fotos) {
            for (const [cat, patrones] of Object.entries(PATRONES)) {
                if (patrones.some(p => f.includes(p))) {
                    encontradas.add(cat);
                }
            }
        }

        const categorias = ["INICIAL", "CAJA", "FINAL"];
        const faltan = categorias.filter(c => !encontradas.has(c));

        return faltan.length === 0 ? "OK" : "FALTA: " + faltan.join(" + ");
    } catch (e) {
        console.error(`Error accediendo a folio ${folioId}: ${e.message}`);
        return "ERROR DE ACCESO";
    }
}

async function main() {
    console.log("👑 Queeny Bots: Iniciando la Auditoría Total...");
    const authClient = await getAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // 1. Cargar cache existente
    let auditCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        auditCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        console.log(`🧠 Caché cargada con ${Object.keys(auditCache).length} folios procesados anteriormente.`);
    }

    // 2. Mapeo de Carpetas (Drive)
    console.log("🗺️ Mapeando Drive...");
    const dictMap = {};
    const contratos = await obtenerPaginado(drive, `'${ID_RAIZ_2DA_ETAPA}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);

    // Concurrencia de Mapeo
    const limit = pLimit(5);
    const mapeoTasks = contratos.map(c => limit(async () => {
        try {
            const fols = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            for (const f of fols) {
                const folioKey = f.name.split('_')[0].split(' ')[0].trim();
                dictMap[folioKey] = f.id;
            }
        } catch (e) {
            console.error(`Error mapeando contrato ${c.id}:`, e.message);
        }
    }));
    await Promise.all(mapeoTasks);
    console.log(`✅ ${Object.keys(dictMap).length} Carpetas de folios mapeadas.`);

    // 3. Cargar Base de Sheets
    console.log(`📊 Cargando registros de Sheets (${HOJA_NOMBRE})...`);
    const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: HOJA_NOMBRE
    });

    const rows = sheetData.data.values;
    const headers = rows[0].map(h => h.trim().toUpperCase());
    const df = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i] || "");
        return obj;
    });
    console.log(`✅ ${df.length} registros cargados.`);

    // 4. Auditoría (Con concurrencia para velocidad)
    console.log("⚡ Iniciando Auditoría Real...");
    const auditLimit = pLimit(20); // max 20 Peticiones simultáneas a la API
    let auditadosNuevos = 0;

    const auditTasks = df.map((row) => auditLimit(async () => {
        const folioStr = String(row['FOLIO']).trim();
        const folioId = dictMap[folioStr];

        // Verificar si tenemos este folio ya cacheado
        const cacheKey = `${folioStr}_${folioId}`;
        if (auditCache[cacheKey] === "OK" && folioId) {
            row['RESULTADO_AUDITORIA'] = "OK";
            return;
        }

        const resultado = await auditarFotos(drive, folioId);
        row['RESULTADO_AUDITORIA'] = resultado;

        if (resultado === "OK" && folioId) {
            auditCache[cacheKey] = "OK";
        }

        auditadosNuevos++;
        if (auditadosNuevos % 200 === 0) console.log(`  ...Auditados ${auditadosNuevos} folios consultando Drive.`);
    }));

    await Promise.all(auditTasks);

    // Guardar Caché
    fs.writeFileSync(CACHE_FILE, JSON.stringify(auditCache, null, 2));

    // 5. Generación de Salidas (Archivos Locales base JSONs)
    console.log("📂 Generando archivos JSON para el Dashboard...");
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

    // A. Limpiar folder
    const oldFiles = fs.readdirSync(PUBLIC_DIR);
    oldFiles.forEach(f => {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(PUBLIC_DIR, f));
    });

    const globalTotals = {};
    const errorTypesSet = new Set(["OK"]);
    const filtersMap = {};
    const resumenData = [];

    const grupos = {};
    df.forEach(row => {
        const emp = row['EMPRESA'];
        const id = row['ID'];
        if (!emp || !id) return;

        const key = `${emp}_${id}`;
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(row);

        const resAud = row['RESULTADO_AUDITORIA'] || "SIN CARPETA";
        globalTotals[resAud] = (globalTotals[resAud] || 0) + 1;
        errorTypesSet.add(resAud);
    });

    for (const [key, records] of Object.entries(grupos)) {
        const emp = key.split('_')[0];
        const id = key.substring(emp.length + 1); // safe extraction

        if (!filtersMap[emp]) filtersMap[emp] = [];
        if (!filtersMap[emp].includes(id)) filtersMap[emp].push(id);

        const summaryRow = {
            EMPRESA_RAIZ_MASTER: emp,
            ID: id,
            TOTAL_OMISIONES: records.length,
        };
        errorTypesSet.forEach(t => summaryRow[t] = 0);

        const pendientes = [];
        records.forEach(r => {
            const st = r.RESULTADO_AUDITORIA || "SIN CARPETA";
            summaryRow[st]++;

            if (st !== "OK") {
                pendientes.push({
                    FOLIO: r.FOLIO,
                    RESULTADO_AUDITORIA: st,
                    CALLE: r.CALLE,
                    COLONIA: r.COLONIA,
                    DELEGACION: r.DELEGACION,
                    _company: emp
                });
            }
        });

        resumenData.push(summaryRow);

        let fileName = `${emp}_${id}.json`.replace(/[\/\\]/g, '-').replace(/ /g, '_');
        fs.writeFileSync(path.join(PUBLIC_DIR, fileName), JSON.stringify(pendientes, null, 2));
    }

    const errorTypes = Array.from(errorTypesSet);
    const mockContent = `// Archivo Auto-generado por el Robot Sentinel
export const ERROR_TYPES = ${JSON.stringify(errorTypes, null, 2)};
export const GLOBAL_TOTALS = ${JSON.stringify(globalTotals, null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;
    fs.writeFileSync(MOCK_PATH, mockContent, 'utf8');

    console.log("✅ ¡Misión Cumplida! Vercel puede tomar el relevo de aquí.");
}

main().catch(console.error);
