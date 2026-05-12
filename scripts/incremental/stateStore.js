import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), '.incremental-state');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'audit.db'));

// Habilitar modo WAL para mejor rendimiento
db.pragma('journal_mode = WAL');

/**
 * Inicializa las tablas de la base de datos.
 */
export function initDb() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS drive_items (
            file_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type TEXT,
            parent_id TEXT,
            stage TEXT,
            empresa TEXT,
            contrato TEXT,
            folio TEXT,
            category TEXT,
            trashed INTEGER DEFAULT 0,
            modified_time TEXT,
            indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS folio_status (
            folio_key TEXT PRIMARY KEY, -- formato: STAGE_EMPRESA_CONTRATO_FOLIO
            stage TEXT NOT NULL,
            empresa TEXT NOT NULL,
            contrato TEXT NOT NULL,
            folio TEXT NOT NULL,
            status TEXT NOT NULL,
            photos_json TEXT,
            is_new_set INTEGER,
            encontradas_json TEXT,
            faltan_neo_json TEXT,
            upload_email TEXT,
            folder_id TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS global_aggregates (
            status_name TEXT PRIMARY KEY,
            count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sync_tokens (
            scope TEXT PRIMARY KEY,
            token TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

// Inicializar inmediatamente para evitar errores de "no such table" al preparar sentencias
initDb();

/**
 * Guarda o actualiza un item de Drive.
 */
export const upsertDriveItem = db.prepare(`
    INSERT INTO drive_items (file_id, name, mime_type, parent_id, stage, empresa, contrato, folio, category, trashed, modified_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_id) DO UPDATE SET
        name=excluded.name,
        mime_type=excluded.mime_type,
        parent_id=excluded.parent_id,
        stage=excluded.stage,
        empresa=excluded.empresa,
        contrato=excluded.contrato,
        folio=excluded.folio,
        category=excluded.category,
        trashed=excluded.trashed,
        modified_time=excluded.modified_time,
        indexed_at=CURRENT_TIMESTAMP
`);

/**
 * Guarda o actualiza el estado de un folio.
 */
export const upsertFolioStatus = db.prepare(`
    INSERT INTO folio_status (folio_key, stage, empresa, contrato, folio, status, photos_json, is_new_set, encontradas_json, faltan_neo_json, upload_email, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(folio_key) DO UPDATE SET
        status=excluded.status,
        photos_json=excluded.photos_json,
        is_new_set=excluded.is_new_set,
        encontradas_json=excluded.encontradas_json,
        faltan_neo_json=excluded.faltan_neo_json,
        upload_email=excluded.upload_email,
        folder_id=excluded.folder_id,
        updated_at=CURRENT_TIMESTAMP
`);

/**
 * Obtiene el estado actual de un folio.
 */
export function getFolioStatus(key) {
    return db.prepare("SELECT * FROM folio_status WHERE folio_key = ?").get(key);
}

/**
 * Actualiza los contadores globales.
 */
export function updateGlobalAggregate(status, delta) {
    db.prepare(`
        INSERT INTO global_aggregates (status_name, count)
        VALUES (?, ?)
        ON CONFLICT(status_name) DO UPDATE SET count = count + ?
    `).run(status, delta, delta);
}

/**
 * Obtiene todos los agregados.
 */
export function getGlobalTotals() {
    const rows = db.prepare("SELECT status_name, count FROM global_aggregates").all();
    const totals = {};
    rows.forEach(r => totals[r.status_name] = r.count);
    return totals;
}

/**
 * Obtiene el resumen para RESUMEN_DATA.
 */
export function getResumenData() {
    return db.prepare(`
        SELECT 
            empresa as EMPRESA_RAIZ_MASTER,
            contrato as ID,
            stage as _stage,
            COUNT(*) as TOTAL_OMISIONES,
            status
        FROM folio_status
        GROUP BY empresa, contrato, stage, status
    `).all();
}

/**
 * Guarda el token de sincronización de Google Drive.
 */
export function saveSyncToken(scope, token) {
    db.prepare(`
        INSERT INTO sync_tokens (scope, token)
        VALUES (?, ?)
        ON CONFLICT(scope) DO UPDATE SET token=excluded.token, updated_at=CURRENT_TIMESTAMP
    `).run(scope, token);
}

/**
 * Obtiene el token de sincronización.
 */
export function getSyncToken(scope) {
    const row = db.prepare("SELECT token FROM sync_tokens WHERE scope = ?").get(scope);
    return row ? row.token : null;
}

export default db;
