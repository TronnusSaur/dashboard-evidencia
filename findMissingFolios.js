import fs from 'fs';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';
dotenv.config();

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
    let credentials;
    if (fs.existsSync('service-account.json')) {
        credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
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

async function main() {
    const authClient = await getAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    const driveIdE3 = process.env.FOLDER_ID_DRIVE_E3 || '1EqejY8Bm2c3NvQ0PEOh7DNUEABuJmHMr';
    const sheetIdE3 = process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU';
    
    // 1. Obtener Folios del Excel
    const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetIdE3,
        range: '3 - ETAPA 3 MASTER'
    });
    const rows = sheetData.data.values;
    const headers = rows[0];
    const folioIndex = headers.findIndex(h => h.trim().toUpperCase() === 'FOLIO');
    
    const excelFolios = new Set();
    rows.slice(1).forEach(r => {
        if (r[folioIndex]) {
            excelFolios.add(normalizeFolio(r[folioIndex]));
        }
    });

    // 2. Obtener Folios de Drive
    const contratos = await obtenerPaginado(drive, `'${driveIdE3}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const limit = pLimit(5);
    
    const missingByContract = {};

    const mapeoTasks = contratos.map(c => limit(async () => {
        try {
            const fols = await obtenerPaginado(drive, `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            
            const missingInExcel = [];

            for (const f of fols) {
                let cleanName = f.name.split('_')[0].replace(/folio/ig, '').trim();
                cleanName = cleanName.replace(/\s*-\s*/g, '-');
                const folioKey = normalizeFolio(cleanName.trim());
                
                // Ignorar carpetas que no parecen folios o que sí están
                // NOTA: Algunas carpetas pueden tener nombres que no se limpien bien, pero probemos.
                if (folioKey && !excelFolios.has(folioKey)) {
                    missingInExcel.push({ driveName: f.name, parsedFolio: folioKey });
                }
            }
            if (missingInExcel.length > 0) {
                missingByContract[c.name] = missingInExcel;
            }
        } catch (e) {
            console.error(`Error contrato ${c.name}:`, e.message);
        }
    }));
    
    await Promise.all(mapeoTasks);
    
    fs.writeFileSync('missing.json', JSON.stringify(missingByContract, null, 2));
    console.log("=== REPORTE GENERADO EN missing.json ===");
}

main().catch(console.error);
