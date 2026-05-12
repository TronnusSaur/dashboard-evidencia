import { normalizeFolio } from './utils.js';
import pLimit from 'p-limit';

/**
 * Obtiene archivos/carpetas paginados.
 */
async function obtenerPaginado(drive, query) {
    let items = [];
    let pageToken = null;
    do {
        const res = await drive.files.list({
            q: query,
            fields: "nextPageToken, files(id, name, mimeType, parents, trashed, modifiedTime, thumbnailLink, webViewLink)",
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
 * Mapea la estructura de carpetas de la Etapa 1/2 (Admin).
 */
export async function mapearDriveAdmin(drive, rootId) {
    const dictMap = {};
    const contratos = await obtenerPaginado(drive, `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const limit = pLimit(5);
    
    await Promise.all(contratos.map(c => limit(async () => {
        const fols = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        for (const f of fols) {
            const cleanName = f.name.split('_')[0].replace(/folio/ig, '').trim();
            const folioKey = normalizeFolio(cleanName.replace(/\s*-\s*/g, '-'));
            if (!dictMap[folioKey]) dictMap[folioKey] = [];
            dictMap[folioKey].push({ id: f.id, name: f.name, contractId: c.name });
        }
    })));
    return dictMap;
}

/**
 * Mapea la estructura de carpetas de la Etapa 3 (Supervisor).
 */
export async function mapearDriveSupervisor(drive, rootId) {
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
                dictMap[folioKey].push({ id: f.id, name: f.name, contractId: c.name });
            }
        }
    })));
    return dictMap;
}

/**
 * Lista archivos dentro de una carpeta de folio.
 */
export async function listarArchivosFolio(drive, folderId) {
    return await obtenerPaginado(drive, `'${folderId}' in parents and trashed = false`);
}
