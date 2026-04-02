import fs from 'fs';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();

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

async function main() {
    const authClient = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const sheetId = process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU';
    const range = '3 - ETAPA 3 MASTER';

    const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range
    });

    const rows = sheetData.data.values;
    const headers = rows[0];
    const folioIndex = headers.findIndex(h => h.trim().toUpperCase() === 'FOLIO');

    console.log("Total rows:", rows.length);
    console.log("Headers:", headers);
    
    const folios = rows.slice(1).map(r => r[folioIndex]);
    const found = folios.filter(f => f && String(f).includes('010037') || String(f).includes('010038'));
    
    console.log("Matches:", found);
}

main().catch(console.error);
