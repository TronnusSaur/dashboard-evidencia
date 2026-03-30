import fs from 'fs';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';
dotenv.config();

const SHEET_ID = process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8';

const normalizeFolio = (f) => {
    if (!f) return f;
    let trimmed = String(f).trim().replace(/\s*-\s*/g, '-');
    if (/^\d+$/.test(trimmed)) {
        return trimmed.padStart(3, '0');
    }
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        return `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }
    return trimmed;
};

async function getAuth() {
    // Intentar default o variable de entorno para local fallback
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return await auth.getClient();
}

async function runLocalTest() {
    try {
        const authClient = await getAuth();
        const drive = google.drive({ version: 'v3', auth: authClient });

        console.log("Buscando carpetas que contengan 8041-1 en Drive...");
        const res = await drive.files.list({
            q: "name contains '8041' and trashed = false",
            fields: "files(id, name, mimeType, parents)",
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        console.log("Resultados crudos de Drive:", res.data.files);

        // Simulando extracción
        res.data.files.forEach(f => {
            if (f.mimeType === 'application/vnd.google-apps.folder') {
                let cleanName = f.name.split('_')[0].replace(/folio/ig, '').trim();
                cleanName = cleanName.replace(/\s*-\s*/g, '-');
                const folioKey = normalizeFolio(cleanName.split(' ')[0].trim());
                console.log(`Carpeta Evaluada: "${f.name}" -> Extraida: "${cleanName}" -> Key Final: "${folioKey}"`);
            }
        });

    } catch (e) {
        console.error("Error en test local:", e.message);
    }
}

runLocalTest();
