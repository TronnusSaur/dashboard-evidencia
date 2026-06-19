import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Habilitar CORS para el Dashboard
app.use(express.json());

// Evitar múltiples ejecuciones paralelas del procesador de cambios
let isProcessing = false;

/**
 * Endpoint para recibir webhooks de Google Drive.
 */
app.post('/webhooks/google-drive', (req, res) => {
    // Google envía notificaciones sin cuerpo, la info está en los headers
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state']; // 'update', 'trash', etc.

    console.log(`\n🔔 Webhook recibido! Channel: ${channelId}, State: ${resourceState}`);

    if (resourceState === 'sync') {
        console.log("ℹ️ Mensaje de confirmación de sincronización recibido.");
        return res.status(200).send('OK');
    }

    // Responder rápido a Google para evitar re-intentos por timeout
    res.status(200).send('OK');

    // Disparar procesamiento incremental en segundo plano
    triggerIncrementalSync();
});

/**
 * Endpoint "Self-Healing": El Dashboard avisa que un folio cambió.
 * Útil para corregir errores "fantasma" instantáneamente.
 */
app.post('/api/recheck-folio', (req, res) => {
    const { folio, stage } = req.body;

    if (!folio || !stage) {
        return res.status(400).json({ error: 'Falta folio o stage' });
    }

    console.log(`\n🩺 Petición de Re-Auditoría (Self-Healing) para Folio: ${folio} [${stage}]`);

    // Disparar el script de re-auditoría específica
    const child = spawn('node', [
        path.join(process.cwd(), 'scripts', 'incremental', 'reauditFolio.js'),
        '--folio', folio,
        '--stage', stage
    ], { stdio: 'inherit' });

    child.on('close', (code) => {
        console.log(`✅ Re-auditoría de folio ${folio} terminada.`);
    });

    // Respondemos rápido al front para que no espere
    res.status(200).json({ message: 'Re-auditoría iniciada' });
});

function triggerIncrementalSync() {
    if (isProcessing) {
        console.log("⏳ Sincronización ya en curso, ignorando evento (o encolando)...");
        return;
    }

    isProcessing = true;
    console.log("🚀 Iniciando processDriveChanges.js...");

    const child = spawn('node', [path.join(process.cwd(), 'scripts', 'incremental', 'processDriveChanges.js')], {
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        isProcessing = false;
        console.log(`🏁 Proceso de sincronización terminado con código ${code}`);
    });
}

app.listen(PORT, () => {
    console.log(`🚀 Webhook Server escuchando en puerto ${PORT}`);
    console.log(`📍 Endpoint: /webhooks/google-drive`);
});
