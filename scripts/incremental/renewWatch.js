import { getGoogleServices } from './googleClient.js';
import { STAGES_CONFIG } from './config.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Registra un watch en Google Drive para una carpeta específica.
 * REQUIRES: Una URL pública accesible por Google (webhookUrl).
 */
async function registerWatch(drive, stage, webhookUrl) {
    const channelId = uuidv4();
    console.log(`📡 Registrando watch para ${stage.id} en ${stage.driveId}...`);

    try {
        const res = await drive.files.watch({
            fileId: stage.driveId,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: webhookUrl,
                // token: 'opcional_verificacion',
                expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 días (máximo permitido)
            }
        });

        console.log(`✅ Watch registrado. Channel ID: ${res.data.id}. Expiración: ${new Date(parseInt(res.data.expiration)).toLocaleString()}`);
        return res.data;
    } catch (e) {
        console.error(`❌ Error registrando watch: ${e.message}`);
    }
}

async function main() {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("❌ Se requiere la variable de entorno WEBHOOK_URL para registrar el watch.");
        return;
    }

    const { drive } = await getGoogleServices();
    for (const stage of STAGES_CONFIG) {
        await registerWatch(drive, stage, webhookUrl);
    }
}

main().catch(console.error);
