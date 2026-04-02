import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const PATRONES = {
    "INICIAL": ["_inicial"],
    "CAJA": ["_caja"],
    "FINAL": ["_terminado"]
};

const SHEET_MAP = {
    "E1": process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E2": process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E3": process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU'
};

const app = express();
app.use(cors());

// Directorio temporal
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
const upload = multer({ dest: 'uploads/' });

// Archivos OAuth2
// Busca automáticamente el json que contenga el cliente de OAuth2 (o usa el que nos dio el usuario)
let CREDENTIALS_PATH = 'client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com.json';

// Si no existe con .json al final, buscar si está sin .json, o buscar uno parecido
if (!fs.existsSync(CREDENTIALS_PATH)) {
    const fallbackPath = 'client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com';
    if(fs.existsSync(fallbackPath)){
        CREDENTIALS_PATH = fallbackPath;
    } else {
        // Encontrar por si renombro el archivo a otra cosa en Workspace
        const files = fs.readdirSync('.');
        const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
        if(secretFile) CREDENTIALS_PATH = secretFile;
    }
}

const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let oauth2Client;

function createOAuthClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(`Falta el archivo Web de credenciales: ${CREDENTIALS_PATH}`);
    }
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    // Para aplicaciones web: puede ser credentials.web o credentials.installed
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    
    // IMPORTANTE: el URI exacto que se registrará en Google Cloud Console
    const REDIRECT_URI = "http://localhost:3001/oauth2callback";
    
    oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
    return oauth2Client;
}

// Ruta para Autorizar (Google Login)
app.get('/auth', (req, res) => {
    try {
        const client = createOAuthClient();
        const authUrl = client.generateAuthUrl({
            access_type: 'offline', // Pide un refresh token
            prompt: 'consent', // Fuerza el prompt siembre para asegurar refresh token
            scope: SCOPES,
        });
        // Redirige al usuario al flow de Google
        res.redirect(authUrl);
    } catch (e) {
        res.status(500).send("Error generando URL de Auth. ¿Seguro que copiaste tu archivo client_secret... al proyecto? Error: " + e.message);
    }
});

// Callback después del login de Google
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('No se recibió código de autorización.');
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        
        console.log('✅ ¡Token OAuth2 guardado exitosamente en token.json!');
        res.send(`
            <html>
                <body style="font-family:sans-serif; text-align:center; padding: 50px;">
                    <h1 style="color: #22c55e;">¡Autenticación Exitosa! 🔒</h1>
                    <p>La conexión segura con tu Google Drive ha sido establecida.</p>
                    <p style="color: #64748b;">El Micro-Servidor ahora usará tu propia cuota para almacenar las fotos.</p>
                    <p><strong>Ya puedes cerrar esta ventana y regresar al Dashboard.</strong></p>
                </body>
            </html>
        `);
    } catch (e) {
        console.error("Error oauth callback:", e);
        res.status(500).send('Error obteniendo el token: ' + e.message);
    }
});


async function getDriveClient() {
    if (!oauth2Client) createOAuthClient();
    
    // Si ya existe el token en disco, cargarlo
    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH, 'utf8');
        oauth2Client.setCredentials(JSON.parse(token));
        return google.drive({ version: 'v3', auth: oauth2Client });
    } else {
        throw new Error('NO_TOKEN');
    }
}

async function getSheetsClient() {
    if (!oauth2Client) createOAuthClient();
    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH, 'utf8');
        oauth2Client.setCredentials(JSON.parse(token));
        return google.sheets({ version: 'v4', auth: oauth2Client });
    } else {
        throw new Error('NO_TOKEN');
    }
}

async function logToSheet(stage, action, folio, type, fileId, user) {
    try {
        // Enviar todos los logs a un solo Documento Maestro Central (el de E1/E2) para que el auditor no tenga que buscar en múltiples hojas
        const spreadsheetId = SHEET_MAP['E2'];
        const sheets = await getSheetsClient();
        const dateStr = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: "'Historial de Actividades'!A:F",
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[dateStr, folio, user || 'Dashboard User', action, type, fileId]]
            }
        });
        console.log(`[Log Registrado] ${action} en Folio ${folio} (${type})`);
    } catch (e) {
        console.error("No se pudo escribir en el Historial de Sheets (puede que la pestaña no exista):", e.message);
    }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { folio, type, folderId } = req.body;
        const file = req.file;

        if (!file || !folio || !type || !folderId) {
            return res.status(400).json({ error: 'Faltan datos requeridos (file, folio, type, folderId)' });
        }

        const drive = await getDriveClient();
        
        let typeStr = type.toLowerCase();
        if (typeStr === 'final') typeStr = 'terminado';
        
        let extension = path.extname(file.originalname).toLowerCase() || '.jpg';
        const fileName = `${folio}_${typeStr}${extension}`;

        const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
        };

        console.log(`Subiendo ${fileName} (OAuth2 - Cuota Usuario) a la carpeta ${folderId}...`);

        const result = await drive.files.create({
            resource: {
                name: fileName,
                parents: [folderId],
            },
            media: media,
            fields: 'id, webViewLink, thumbnailLink',
            supportsAllDrives: true,
        });

        console.log(`✅ ¡Éxito! Archivo subido con ID: ${result.data.id}`);

        // Delete the temp file safely
        try { fs.unlinkSync(file.path); } catch(e){}

        // Log to Google Sheets
        const stageToLog = req.body.stage || 'E2';
        await logToSheet(stageToLog, 'SUBIDA', folio, type, result.data.id, req.body.user);

        return res.json({
            success: true,
            fileId: result.data.id,
            webViewLink: result.data.webViewLink,
            thumbnailLink: result.data.thumbnailLink
        });

    } catch (e) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch(err){} }

        if (e.message === 'NO_TOKEN') {
            return res.json({ 
                success: false, 
                error: 'Debes autorizar a Google primero.',
                requiresAuth: true,
                authUrl: 'http://localhost:3001/auth'
            });
        }

        console.error("Error subiendo foto:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/verify-folio', async (req, res) => {
    try {
        const { folderId } = req.query;
        if (!folderId) return res.status(400).json({ error: 'folderId es requerido' });

        const drive = await getDriveClient();
        const query = `'${folderId}' in parents and trashed = false`;
        const driveRes = await drive.files.list({
            q: query,
            fields: "files(id, name, webViewLink, thumbnailLink)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageSize: 100
        });

        const files = driveRes.data.files || [];
        const photosMap = { INICIAL: null, CAJA: null, FINAL: null };

        let status = "OK";
        if (files.length === 0) {
            status = "CARPETA VACÍA";
        } else {
            const encontradas = new Set();
            for (const f of files) {
                for (const [cat, patrones] of Object.entries(PATRONES)) {
                    if (patrones.some(p => f.name.toLowerCase().includes(p))) {
                        encontradas.add(cat);
                        if (!photosMap[cat]) {
                            photosMap[cat] = {
                                id: f.id,
                                thumbnail: f.thumbnailLink,
                                view: f.webViewLink
                            };
                        }
                    }
                }
            }

            const reqs = ["INICIAL", "CAJA", "FINAL"];
            const faltantes = reqs.filter(r => !encontradas.has(r));
            if (faltantes.length > 0) {
                status = "FALTA: " + faltantes.join(" + ");
            }
        }

        res.json({ success: true, status, photos: photosMap });
    } catch(e) {
        if (e.message === 'NO_TOKEN') return res.status(401).json({ error: 'NO_TOKEN' });
        console.error("Error verificando folio:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/delete-evidence', express.json(), async (req, res) => {
    try {
        const { folderId, type, folio, stage, user } = req.body;
        if (!folderId || !type) return res.status(400).json({ error: 'Faltan datos (folderId, type)' });

        const drive = await getDriveClient();
        const query = `'${folderId}' in parents and trashed = false`;
        const driveRes = await drive.files.list({
            q: query,
            fields: "files(id, name)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageSize: 100
        });

        const files = driveRes.data.files || [];
        let cleanType = type;
        if (type.toUpperCase() === 'TERMINADO') cleanType = 'FINAL';
        
        const patrones = PATRONES[cleanType.toUpperCase()];
        if (!patrones) return res.status(400).json({ error: 'Tipo inválido: ' + type });

        const fileToDelete = files.find(f => patrones.some(p => f.name.toLowerCase().includes(p)));

        if (!fileToDelete) {
            return res.status(404).json({ error: 'Foto no encontrada en Drive para eliminar' });
        }

        await drive.files.delete({
            fileId: fileToDelete.id,
            supportsAllDrives: true
        });

        console.log(`🗑️ Eliminada evidencia: ${fileToDelete.name} (${type})`);
        
        await logToSheet(stage || 'E2', 'ELIMINACIÓN', folio || 'Desconocido', cleanType.toUpperCase(), fileToDelete.id, user);

        res.json({ success: true, deletedId: fileToDelete.id });
    } catch(e) {
        if (e.message === 'NO_TOKEN') return res.status(401).json({ error: 'NO_TOKEN' });
        console.error("Error eliminando evidencia:", e.message);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Micro-Servidor OAuth2 escuchando en http://localhost:${PORT}`);
    console.log(`⚠️  ANTES DE SUBIR LA PRIMERA FOTO, DEBES AUTORIZAR A GOOGLE:`);
    console.log(`👉 Visita: http://localhost:3001/auth`);
    console.log(`======================================================\n`);
});
