import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

let globalLog = "";
function myLog(msg) {
    console.log(msg);
    globalLog += msg + "\n";
}
function myError(msg, err) {
    console.error(msg, err);
    globalLog += msg + " " + (err || "") + "\n";
}

const PARENT_MASTER_ID = '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik'; // ID Maestro Etapa 2

// Autenticación con Google Service Account (Requiere permisos de Edición en el Drive)
async function getAuth() {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        throw new Error("⚠️ No se encontró GOOGLE_SERVICE_ACCOUNT_KEY en las variables de entorno.");
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
        },
        // IMPORTANTE: Se requiere el scope completo de Drive para poder mover y renombrar archivos
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    return await auth.getClient();
}

async function obtenerArchivos(drive, query) {
    let items = [];
    let pageToken = null;
    do {
        const res = await drive.files.list({
            q: query,
            fields: "nextPageToken, files(id, name, createdTime)",
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

async function runCleanup() {
    myLog("=========================================");
    myLog(`🚀 [${new Date().toISOString()}] Iniciando Limpieza...`);

    try {
        const authClient = await getAuth();
        const drive = google.drive({ version: 'v3', auth: authClient });

        myLog(`📂 Buscando carpeta ROCADURA-007-2ETAPA dinámicamente...`);
        const searchRes = await drive.files.list({
            q: `name = 'ROCADURA-007-2ETAPA' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id, name)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        if (!searchRes.data.files || searchRes.data.files.length === 0) {
            throw new Error("No se encontró la carpeta mayor 'ROCADURA-007-2ETAPA' en Google Drive. Verifica que el robot tenga acceso (Editor).");
        }

        const ROCADURA_FOLDER_ID = searchRes.data.files[0].id;
        myLog(`✅ ID dinámico encontrado: ${ROCADURA_FOLDER_ID}`);

        myLog(`📂 Extrayendo subcarpetas de ROCADURA...`);
        const carpetas = await obtenerArchivos(drive, `'${ROCADURA_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);

        // Agrupar por nombre
        const carpetasPorNombre = {};
        carpetas.forEach(f => {
            const nombre = f.name.trim();
            if (!carpetasPorNombre[nombre]) carpetasPorNombre[nombre] = [];
            carpetasPorNombre[nombre].push(f);
        });

        // Filtrar solo las que tienen duplicados
        const duplicados = Object.entries(carpetasPorNombre).filter(([_, lista]) => lista.length > 1);
        console.log(`⚠️ Se encontraron ${duplicados.length} carpetas duplicadas (folios repetidos).`);

        if (duplicados.length === 0) {
            console.log("✨ No hay nada que limpiar. Todo está en orden.");
            return;
        }

        const limit = pLimit(2); // Limitar a 2 operaciones paralelas graves para no saturar la API

        for (const [nombre, listaOcurrencias] of duplicados) {
            myLog(`\n🔄 Procesando duplicados para el folio: "${nombre}"`);

            // Ordenar por fecha de creación (la más vieja [0] es la original)
            listaOcurrencias.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

            const carpetaOriginal = listaOcurrencias[0];
            const carpetasSobrantes = listaOcurrencias.slice(1);

            myLog(`  -> Carpeta Original Elegida: ${nombre} (ID: ${carpetaOriginal.id}) creada el ${carpetaOriginal.createdTime}`);

            // Obtener archivos de la carpeta original
            const archivosTarget = await obtenerArchivos(drive, `'${carpetaOriginal.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
            const nombresTarget = new Set(archivosTarget.map(f => f.name));

            for (const carpetaFuente of carpetasSobrantes) {
                const archivosFuente = await obtenerArchivos(drive, `'${carpetaFuente.id}' in parents and trashed = false`);
                myLog(`  -> Extrayendo ${archivosFuente.length} archivo(s) de la carpeta duplicada (ID: ${carpetaFuente.id})`);

                const moveTasks = archivosFuente.map(archivo => limit(async () => {
                    let nuevoNombre = archivo.name;

                    // Manejar colisiones tipo Windows "archivo (1).jpg"
                    if (nombresTarget.has(archivo.name)) {
                        const match = archivo.name.match(/(.*?)(\.[^.]+)?$/);
                        const base = match[1];
                        const ext = match[2] || '';
                        nuevoNombre = `${base} (1)${ext}`;
                        myLog(`     ⚠️ Conflicto detectado. Renombrando '${archivo.name}' a '${nuevoNombre}'`);

                        await drive.files.update({
                            fileId: archivo.id,
                            requestBody: { name: nuevoNombre },
                            supportsAllDrives: true
                        });
                        nombresTarget.add(nuevoNombre);
                    }

                    myLog(`     Moviendo '${nuevoNombre}' a la original...`);
                    await drive.files.update({
                        fileId: archivo.id,
                        addParents: carpetaOriginal.id,
                        removeParents: carpetaFuente.id,
                        supportsAllDrives: true
                    });
                }));

                await Promise.all(moveTasks);

                myLog(`  🗑️ Enviando carpeta duplicada vacía a la papelera...`);
                await drive.files.update({
                    fileId: carpetaFuente.id,
                    requestBody: { trashed: true },
                    supportsAllDrives: true
                });
            }
        }

        myLog("\n✨ ¡Limpieza de Rocadura finalizada con éxito!");
        fs.writeFileSync('cleanup_log.txt', globalLog);

    } catch (error) {
        myError("❌ Error grave durante la limpieza:", error.message);
        fs.writeFileSync('cleanup_log.txt', globalLog);
        process.exit(1);
    }
}

runCleanup();
