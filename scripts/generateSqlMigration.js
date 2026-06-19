import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';

dotenv.config();

// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y MAPEO
// ══════════════════════════════════════════════════════════════
const TABLE_NAME = 'bacheo';

const STAGE_NAME_MAPPING = {
    'E1': '1 ETAPA',
    'E2': '2 ETAPA',
    'E3': '3 ETAPA',
};

const STAGE_ID_MAPPING = {
    'E1': 1,
    'E2': 2,
    'E3': 3,
};

const DB_PATH = path.join(process.cwd(), '.incremental-state', 'audit.db');
const OUTPUT_PATHS_FILE = path.join(process.cwd(), 'migration_evidence_paths.sql');
const OUTPUT_DRIVE_FILE = path.join(process.cwd(), 'migration_evidence_drive.sql');
const EXTENSION_CACHE_FILE = path.join(process.cwd(), '.cache', 'drive_extensions_cache.json');

// Normalizar Folio
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

// Función para sanitizar valores de SQL
function escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    const str = String(val).replace(/'/g, "''"); // Duplicar comillas simples
    return `'${str}'`;
}

// Extraer ID de archivo desde el enlace de Drive
function extractFileIdFromLink(link) {
    if (!link) return null;
    const match = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

// ══════════════════════════════════════════════════════════════
// GOOGLE AUTHENTICATION HELPERS
// ══════════════════════════════════════════════════════════════
async function getAuth() {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        if (fs.existsSync('service-account.json')) {
            credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
        } else {
            console.log("⚠️ No se encontró service-account.json. Usando OAuth2 token.json si está disponible...");
            if (fs.existsSync('token.json') && fs.existsSync('client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com.json')) {
                const token = JSON.parse(fs.readFileSync('token.json', 'utf8'));
                const clientSecret = JSON.parse(fs.readFileSync('client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com.json', 'utf8'));
                const { client_secret, client_id } = clientSecret.web || clientSecret.installed;
                const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3001/oauth2callback");
                oauth2Client.setCredentials(token);
                return oauth2Client;
            }
            throw new Error("No hay credenciales de Google configuradas para consultar la API.");
        }
    }
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return await auth.getClient();
}

// ══════════════════════════════════════════════════════════════
// METODO PRINCIPAL DE EXTRACCIÓN
// ══════════════════════════════════════════════════════════════
async function main() {
    const fetchExtensions = process.argv.includes('--fetch-extensions');
    
    console.log("======================================================");
    console.log("🚀 INICIANDO GENERADOR DE MIGRACIÓN SQL DE EVIDENCIAS");
    console.log(`📌 Modo de extensiones reales: ${fetchExtensions ? 'ACTIVADO 🌐 (Consultando API de Google Drive)' : 'DESACTIVADO ⚡ (Por defecto .jpg)'}`);
    console.log("======================================================\n");

    if (!fs.existsSync(DB_PATH)) {
        console.error(`❌ No se encontró la base de datos de auditoría en: ${DB_PATH}`);
        console.error(`Por favor, asegúrate de que el proyecto haya sido auditado.`);
        process.exit(1);
    }

    let foliosData = [];
    try {
        console.log(`🔍 Abriendo base de datos SQLite: ${DB_PATH}...`);
        const db = new Database(DB_PATH, { readonly: true });
        
        // Consultar el estado de folios en la tabla folio_status (68,006 registros)
        const records = db.prepare(`
            SELECT stage, empresa, contrato, folio, status, photos_json, folder_id
            FROM folio_status
            WHERE photos_json IS NOT NULL AND photos_json != '' AND photos_json != '{}'
        `).all();

        console.log(`📦 Se encontraron ${records.length} folios con registros fotográficos en la base de datos.`);

        records.forEach(row => {
            // Omitir drive de supervisores (E3 SUP)
            if (row.stage === 'E3_SUP') return;

            let photos = {};
            try {
                photos = JSON.parse(row.photos_json);
            } catch (e) {
                return;
            }
            if (!photos) return;

            // Omitir si no tiene ninguna foto de las 3 críticas
            if (!photos.INICIAL && !photos.CAJA && !photos.TERMINADO) return;

            const folioObj = {
                folio: normalizeFolio(row.folio),
                stage: row.stage,
                empresa: row.empresa,
                contrato: row.contrato,
                status: row.status,
                folderId: row.folder_id,
                inicialFileId: photos.INICIAL ? extractFileIdFromLink(photos.INICIAL.view) : null,
                inicialView: photos.INICIAL ? photos.INICIAL.view : null,
                inicialExt: 'jpg', // Default
                cajaFileId: photos.CAJA ? extractFileIdFromLink(photos.CAJA.view) : null,
                cajaView: photos.CAJA ? photos.CAJA.view : null,
                cajaExt: 'jpg', // Default
                terminadoFileId: photos.TERMINADO ? extractFileIdFromLink(photos.TERMINADO.view) : null,
                terminadoView: photos.TERMINADO ? photos.TERMINADO.view : null,
                terminadoExt: 'jpg' // Default
            };

            foliosData.push(folioObj);
        });

        console.log(`✅ Extracción de base de datos finalizada. ${foliosData.length} folios procesables.`);

    } catch (err) {
        console.error(`❌ Error leyendo base de datos SQLite: ${err.message}`);
        process.exit(1);
    }

    // ══════════════════════════════════════════════════════════════
    // RESOLVER EXTENSIONES REALES CON GOOGLE DRIVE (OPCIONAL)
    // ══════════════════════════════════════════════════════════════
    if (fetchExtensions && foliosData.length > 0) {
        console.log("\n🌐 Conectando con Google Drive API para recuperar extensiones reales de archivos...");
        
        let extensionsCache = {};
        if (fs.existsSync(EXTENSION_CACHE_FILE)) {
            try {
                extensionsCache = JSON.parse(fs.readFileSync(EXTENSION_CACHE_FILE, 'utf8'));
                console.log(`💾 Caché de extensiones cargada: ${Object.keys(extensionsCache).length} archivos registrados.`);
            } catch (e) {
                extensionsCache = {};
            }
        }

        try {
            const authClient = await getAuth();
            const drive = google.drive({ version: 'v3', auth: authClient });

            // Recopilar todos los File IDs que necesitamos consultar (que no estén ya en la caché local)
            const fileIdsToQuery = new Set();
            foliosData.forEach(f => {
                if (f.inicialFileId && !extensionsCache[f.inicialFileId]) fileIdsToQuery.add(f.inicialFileId);
                if (f.cajaFileId && !extensionsCache[f.cajaFileId]) fileIdsToQuery.add(f.cajaFileId);
                if (f.terminadoFileId && !extensionsCache[f.terminadoFileId]) fileIdsToQuery.add(f.terminadoFileId);
            });

            const totalQueries = fileIdsToQuery.size;
            console.log(`🔎 Necesitamos consultar la extensión de ${totalQueries} archivos nuevos en Google Drive.`);

            if (totalQueries > 0) {
                console.log("⏳ Iniciando consultas concurrentes con control de tasa (rate-limiting)...");
                const limit = pLimit(30); // Limitar a 30 peticiones paralelas
                let completedQueries = 0;
                let errorQueries = 0;

                const queryTasks = Array.from(fileIdsToQuery).map(fileId => limit(async () => {
                    try {
                        const res = await drive.files.get({
                            fileId: fileId,
                            fields: 'fileExtension, name',
                            supportsAllDrives: true
                        });
                        
                        const ext = res.data.fileExtension || 'jpg';
                        extensionsCache[fileId] = ext.toLowerCase();
                    } catch (e) {
                        // En caso de error (ej. permisos o archivo eliminado), se asume jpg y no se reintenta
                        extensionsCache[fileId] = 'jpg';
                        errorQueries++;
                    }

                    completedQueries++;
                    if (completedQueries % 100 === 0 || completedQueries === totalQueries) {
                        const progress = ((completedQueries / totalQueries) * 100).toFixed(1);
                        console.log(`  [Progreso Drive] ${completedQueries}/${totalQueries} (${progress}%) | Errores: ${errorQueries}`);
                    }
                }));

                await Promise.all(queryTasks);

                // Guardar la caché actualizada en disco
                const cacheDir = path.dirname(EXTENSION_CACHE_FILE);
                if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
                fs.writeFileSync(EXTENSION_CACHE_FILE, JSON.stringify(extensionsCache, null, 2), 'utf8');
                console.log("💾 Caché de extensiones guardada en disco.");
            }

            // Aplicar las extensiones de la caché a nuestro conjunto de folios
            foliosData.forEach(f => {
                if (f.inicialFileId && extensionsCache[f.inicialFileId]) f.inicialExt = extensionsCache[f.inicialFileId];
                if (f.cajaFileId && extensionsCache[f.cajaFileId]) f.cajaExt = extensionsCache[f.cajaFileId];
                if (f.terminadoFileId && extensionsCache[f.terminadoFileId]) f.terminadoExt = extensionsCache[f.terminadoFileId];
            });

            console.log("✅ Extensiones reales aplicadas exitosamente.");

        } catch (authErr) {
            console.error(`❌ Error en autenticación o consulta de Drive: ${authErr.message}`);
            console.log("⚠️ Se continuará utilizando '.jpg' como extensión por defecto.");
        }
    }

    // ══════════════════════════════════════════════════════════════
    // GENERACIÓN DE LOS ARCHIVOS SQL
    // ══════════════════════════════════════════════════════════════
    console.log("\n⚡ Generando archivos de sentencias SQL...");

    const sqlPathsLines = [
        `-- ============================================================================`,
        `-- SCRIPT DE MIGRACIÓN: RUTAS LOCALES DE EVIDENCIA FOTOGRÁFICA`,
        `-- Generado automáticamente el: ${new Date().toLocaleString('es-MX')}`,
        `-- Tabla destino: \`${TABLE_NAME}\``,
        `-- Estructura de carpetas: /home/toluca/Imágenes/{Etapa}/{Contrato}/{Folio}/{Fotos}`,
        `-- ============================================================================`,
        `\n`
    ];

    const sqlDriveLines = [
        `-- ============================================================================`,
        `-- SCRIPT DE MIGRACIÓN: ENLACES DE GOOGLE DRIVE (VIEW LINKS)`,
        `-- Generado automáticamente el: ${new Date().toLocaleString('es-MX')}`,
        `-- Tabla destino: \`${TABLE_NAME}\``,
        `-- ============================================================================`,
        `\n`
    ];

    let updateCount = 0;

    foliosData.forEach(info => {
        const stageName = STAGE_NAME_MAPPING[info.stage] || info.stage;
        const stageId = STAGE_ID_MAPPING[info.stage] ?? null;
        const stageIdCondition = stageId === null ? '`idEtapa` IS NULL' : `\`idEtapa\` = ${stageId}`;
        const contractFolder = `${info.empresa}_${info.contrato}`;
        const folioFolder = info.folio;

        // 1. GENERAR ACTUALIZACIONES DE RUTAS LOCALES
        const localInicial = info.inicialFileId 
            ? `/home/toluca/Imágenes/${stageName}/${contractFolder}/${folioFolder}/${info.folio}_inicial.${info.inicialExt}`
            : null;
        
        const localCaja = info.cajaFileId 
            ? `/home/toluca/Imágenes/${stageName}/${contractFolder}/${folioFolder}/${info.folio}_caja.${info.cajaExt}`
            : null;

        const localTerminado = info.terminadoFileId 
            ? `/home/toluca/Imágenes/${stageName}/${contractFolder}/${folioFolder}/${info.folio}_terminado.${info.terminadoExt}`
            : null;

        let setsPaths = [];
        if (localInicial) setsPaths.push(`\`fotoBache1\` = ${escapeSql(localInicial)}`);
        if (localCaja) setsPaths.push(`\`fotoBacheProceso1\` = ${escapeSql(localCaja)}`);
        if (localTerminado) setsPaths.push(`\`fotoBacheTerminado1\` = ${escapeSql(localTerminado)}`);

        if (setsPaths.length > 0) {
            const sqlPathsQuery = `UPDATE \`${TABLE_NAME}\` SET ${setsPaths.join(', ')} WHERE \`folio\` = ${escapeSql(info.folio)} AND ${stageIdCondition};`;
            sqlPathsLines.push(sqlPathsQuery);
        }

        // 2. GENERAR ACTUALIZACIONES DE ENLACES DE DRIVE
        let setsDrive = [];
        if (info.inicialView) setsDrive.push(`\`fotoBache1\` = ${escapeSql(info.inicialView)}`);
        if (info.cajaView) setsDrive.push(`\`fotoBacheProceso1\` = ${escapeSql(info.cajaView)}`);
        if (info.terminadoView) setsDrive.push(`\`fotoBacheTerminado1\` = ${escapeSql(info.terminadoView)}`);

        if (setsDrive.length > 0) {
            const sqlDriveQuery = `UPDATE \`${TABLE_NAME}\` SET ${setsDrive.join(', ')} WHERE \`folio\` = ${escapeSql(info.folio)} AND ${stageIdCondition};`;
            sqlDriveLines.push(sqlDriveQuery);
        }

        updateCount++;
    });

    // Guardar los archivos físicos
    fs.writeFileSync(OUTPUT_PATHS_FILE, sqlPathsLines.join('\n'), 'utf8');
    fs.writeFileSync(OUTPUT_DRIVE_FILE, sqlDriveLines.join('\n'), 'utf8');

    console.log(`\n======================================================`);
    console.log(`✨ ¡PROCESO COMPLETADO EXITOSAMENTE!`);
    console.log(`📊 Total de folios con actualización generada: ${updateCount}`);
    console.log(`📁 Archivo Rutas Locales: ${OUTPUT_PATHS_FILE}`);
    console.log(`📁 Archivo Enlaces Drive: ${OUTPUT_DRIVE_FILE}`);
    console.log(`======================================================\n`);
}

main().catch(err => {
    console.error("❌ Error fatal en la ejecución:", err);
    process.exit(1);
});
