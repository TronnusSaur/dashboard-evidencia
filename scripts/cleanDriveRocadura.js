import { google } from 'googleapis';
import pLimit from 'p-limit';
import * as dotenv from 'dotenv';
dotenv.config();

const ROCADURA_FOLDER_ID = '1zSKOY7lHNiK04xEtT1jUazK4Ln1-cVIc';

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
    console.log("🚀 Iniciando Limpieza y Fusión de Carpetas en Rocadura...");

    try {
        const authClient = await getAuth();
        const drive = google.drive({ version: 'v3', auth: authClient });

        console.log(`📂 Buscando carpetas en ROCADURA-007-2ETAPA...`);
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
            console.log(`\n🔄 Procesando duplicados para el folio: "${nombre}"`);

            // Ordenar por fecha de creación (la más vieja [0] es la original)
            listaOcurrencias.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

            const carpetaOriginal = listaOcurrencias[0];
            const carpetasSobrantes = listaOcurrencias.slice(1);

            console.log(`  -> Carpeta Original Elegida: ${nombre} (ID: ${carpetaOriginal.id}) creada el ${carpetaOriginal.createdTime}`);

            // Obtener archivos de la carpeta original
            const archivosTarget = await obtenerArchivos(drive, `'${carpetaOriginal.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
            const nombresTarget = new Set(archivosTarget.map(f => f.name));

            for (const carpetaFuente of carpetasSobrantes) {
                const archivosFuente = await obtenerArchivos(drive, `'${carpetaFuente.id}' in parents and trashed = false`);
                console.log(`  -> Extrayendo ${archivosFuente.length} archivo(s) de la carpeta duplicada (ID: ${carpetaFuente.id})`);

                const moveTasks = archivosFuente.map(archivo => limit(async () => {
                    let nuevoNombre = archivo.name;

                    // Manejar colisiones tipo Windows "archivo (1).jpg"
                    if (nombresTarget.has(archivo.name)) {
                        const match = archivo.name.match(/(.*?)(\.[^.]+)?$/);
                        const base = match[1];
                        const ext = match[2] || '';
                        nuevoNombre = `${base} (1)${ext}`;
                        console.log(`     ⚠️ Conflicto detectado. Renombrando '${archivo.name}' a '${nuevoNombre}'`);

                        await drive.files.update({
                            fileId: archivo.id,
                            requestBody: { name: nuevoNombre },
                            supportsAllDrives: true
                        });
                        nombresTarget.add(nuevoNombre);
                    }

                    console.log(`     Moviendo '${nuevoNombre}' a la original...`);
                    await drive.files.update({
                        fileId: archivo.id,
                        addParents: carpetaOriginal.id,
                        removeParents: carpetaFuente.id,
                        supportsAllDrives: true
                    });
                }));

                await Promise.all(moveTasks);

                console.log(`  🗑️ Enviando carpeta duplicada vacía a la papelera...`);
                await drive.files.update({
                    fileId: carpetaFuente.id,
                    requestBody: { trashed: true },
                    supportsAllDrives: true
                });
            }
        }

        console.log("\n✨ ¡Limpieza de Rocadura finalizada con éxito!");

    } catch (error) {
        console.error("❌ Error grave durante la limpieza:", error.message);
        process.exit(1);
    }
}

runCleanup();
