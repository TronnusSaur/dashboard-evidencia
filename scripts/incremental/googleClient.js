import { google } from 'googleapis';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Obtiene el cliente de autenticación de Google.
 * Prioriza la variable de entorno GOOGLE_SERVICE_ACCOUNT_KEY (JSON string).
 * Si no existe, busca el archivo service-account.json en la raíz.
 */
export async function getAuth() {
    let credentials;
    
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        try {
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        } catch (e) {
            console.error("❌ Error parseando GOOGLE_SERVICE_ACCOUNT_KEY:", e.message);
            throw e;
        }
    } else if (fs.existsSync('service-account.json')) {
        credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
    } else {
        console.warn("⚠️ No se encontró GOOGLE_SERVICE_ACCOUNT_KEY ni service-account.json. Usando autenticación por defecto (ADC).");
        const defaultAuth = new google.auth.GoogleAuth({
            scopes: [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/spreadsheets.readonly'
            ],
        });
        return await defaultAuth.getClient();
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key 
        },
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/spreadsheets.readonly'
        ],
    });

    return await auth.getClient();
}

/**
 * Retorna instancias inicializadas de Drive y Sheets.
 */
export async function getGoogleServices() {
    const auth = await getAuth();
    return {
        drive: google.drive({ version: 'v3', auth }),
        sheets: google.sheets({ version: 'v4', auth })
    };
}
