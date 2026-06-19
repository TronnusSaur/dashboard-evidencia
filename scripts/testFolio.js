import fs from 'fs';
import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';
dotenv.config();

// CONFIGURACIÓN 
const SHEET_ID = process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8';

const STAGES_CONFIG = [
    {
        id: 'E1',
        name: 'ETAPA 1 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE_E1 || '1RJrTrWIp7sYZDyAYhmsq_5xqaLCj3CYN'
    },
    {
        id: 'E2',
        name: 'ETAPA 2 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE || '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik'
    }
];

const TARGET_FOLIO = '8041'; // Para probar cualquier folio que contenga 8041

const normalizeFolio = (f) => {
    if (!f) return f;
    const trimmed = String(f).trim();
    if (/^\d+$/.test(trimmed)) {
        return trimmed.padStart(3, '0');
    }
    return trimmed;
};

async function getAuth() {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        if (fs.existsSync('service-account.json')) {
            credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
        } else {
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

async function testMain() {
    console.log(`\n🔍 INICIANDO TEST PARA FOLIOS RELACIONADOS CON: ${TARGET_FOLIO}\n`);
    const authClient = await getAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    let testResults = {
        sheetFoliosFound: [],
        driveFoldersMapped: [],
        auditSimulation: []
    };

    const config = STAGES_CONFIG[1]; // Evaluando ETAPA 2 (donde suelen estar estos problemas)
    console.log(`1️⃣ Buscando carpetas maestras en Drive para ${config.name}...`);

    // 1. Mapeo Limitado
    const contratos = await obtenerPaginado(drive, `'${config.driveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const dictMap = {};
    const limit = pLimit(5);

    const mapeoTasks = contratos.map(c => limit(async () => {
        try {
            // Buscamos específicamente carpetas que contengan el TARGET_FOLIO para hacer la prueba pequeña
            const query = `'${c.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${TARGET_FOLIO}' and trashed = false`;
            const fols = await obtenerPaginado(drive, query);

            for (const f of fols) {
                // AQUÍ ES DONDE PROBABLEMENTE ESTÁ EL ERROR DE LOGICA
                const rawName = f.name;
                const split1 = rawName.split('_')[0];
                const split2 = split1.split(' ')[0];
                const trimmed = split2.trim();
                const folioKey = normalizeFolio(trimmed);

                dictMap[folioKey] = f.id;
                testResults.driveFoldersMapped.push({
                    originalDriveName: rawName,
                    step1_splitUnderscore: split1,
                    step2_splitSpace: split2,
                    step3_trimmed: trimmed,
                    final_folioKey: folioKey,
                    folderId: f.id
                });
            }
        } catch (e) {
            console.error(`Error mapeando contrato ${c.name}:`, e.message);
        }
    }));
    await Promise.all(mapeoTasks);

    console.log(`2️⃣ Evaluando Datos en Sheets...`);
    const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: config.name
    });

    const rows = sheetData.data.values;
    const headers = rows[0].map(h => h.trim().toUpperCase());

    const df = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i] || "");
        return obj;
    });

    // 3. Simular match
    for (const row of df) {
        const rawFolio = String(row['FOLIO']).trim();
        if (rawFolio.includes(TARGET_FOLIO)) {
            const normalizedFolio = normalizeFolio(rawFolio);
            const folioId = dictMap[normalizedFolio];

            testResults.sheetFoliosFound.push({
                rawExcelFolio: rawFolio,
                normalizedExcelFolio: normalizedFolio,
                matchFoundInDictMap: !!folioId,
                mappedFolderId: folioId || null
            });
        }
    }

    fs.writeFileSync('test_folio_output.json', JSON.stringify(testResults, null, 2));
    console.log(`\n✅ TEST COMPLETADO.\n📝 Resultados guardados en: test_folio_output.json`);
    console.log(`Encontrados en Drive: ${testResults.driveFoldersMapped.length}`);
    console.log(`Encontrados en Sheets: ${testResults.sheetFoliosFound.length}`);
}

testMain().catch(console.error);
