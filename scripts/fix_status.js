const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/FolioVisualizerModal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Declarar variables antes del if (files.length === 0)
content = content.replace(
    'if (files.length === 0) {',
    'let currentStatus = "";\n            let extraFilesCount = 0;\n            let currentFoundPhotos = null;\n\n            if (files.length === 0) {'
);

// 2. Cambiar las asignaciones de 'status' por 'currentStatus'
content = content.replace(/status\s*=\s*(["']CARPETA VACI\\u00cdA["']|["']CARPETA VACÍA["']);/g, 'currentStatus = "CARPETA VACÍA";');
content = content.replace(/status\s*=\s*"FALTA:/g, 'currentStatus = "FALTA:');
content = content.replace(/status\s*=\s*"OK"/g, 'currentStatus = "OK"');

// 3. Renombrar foundPhotos a currentFoundPhotos para no limitar el alcance
content = content.replace('const foundPhotos = {};', 'currentFoundPhotos = {};');
content = content.replace(/foundPhotos\[/g, 'currentFoundPhotos[');
content = content.replace(/setLivePhotos\(foundPhotos\)/g, 'setLivePhotos(currentFoundPhotos)');

// 4. Capturar el conteo de extras
content = content.replace(
    'setExtraFiles(extras);',
    'setExtraFiles(extras);\n                extraFilesCount = extras.length;'
);

// 5. Mover onFolioSync FUERA del else block y usar las variables globales de la funcion
const regexSync = /\s*if\s*\(onFolioSync\)\s*\{\s*onFolioSync\(FOLIO,\s*foundPhotos,\s*status,\s*extras\.length\);\s*\}\s*\}/;
const newSync = `
            }

            if (onFolioSync) {
                onFolioSync(FOLIO, currentFoundPhotos, currentStatus, extraFilesCount);
            }`;

content = content.replace(regexSync, newSync);

fs.writeFileSync(filePath, content);
console.log("¡Archivo FolioVisualizerModal.jsx parchado correctamente!");
