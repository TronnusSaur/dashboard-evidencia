import { 
    PATRONES, 
    CATEGORIAS_LEGACY, 
    CATEGORIAS_NUEVO, 
    CATEGORIAS_CRITICAS 
} from './config.js';
import { isLegacyByDate } from './utils.js';

/**
 * Audita las fotos de un folio basándose en una lista de archivos.
 * Esta función es "pura" en el sentido que no llama a la API de Drive directamente,
 * recibe la lista de archivos ya obtenida.
 */
export function auditFolioFromFiles(files, fechaStr, stageId) {
    if (!files || files.length === 0) {
        return { status: "CARPETA VACÍA", photos: null, isNewSet: false };
    }

    const encontradas = new Set();
    const photosMap = {};
    
    // Inicializar mapa de fotos
    for (const cat of Object.keys(PATRONES)) { 
        photosMap[cat] = null; 
    }

    // Clasificar archivos
    for (const f of files) {
        const nameLower = f.name.toLowerCase();
        for (const [cat, patrones] of Object.entries(PATRONES)) {
            if (patrones.some(p => nameLower.includes(p))) {
                encontradas.add(cat);
                if (!photosMap[cat]) {
                    photosMap[cat] = { 
                        thumbnail: f.thumbnailLink, 
                        view: f.webViewLink 
                    };
                }
                break;
            }
        }
    }

    const extraFilesCount = files.length - encontradas.size;

    // Determinar si es set Nuevo (Neo) o Legacy
    const isE3 = stageId && stageId.startsWith('E3');
    let esSetNuevo;

    if (isE3) {
        esSetNuevo = true; // Etapa 3 siempre es Neo
    } else {
        const legacyByDate = isLegacyByDate(fechaStr);
        if (legacyByDate !== null) {
            esSetNuevo = !legacyByDate;
        } else {
            // Heurístico por contenido si no hay fecha válida
            const nuevosSufijos = ["_folio", "_corte", "_demolicion", "_liga", "_mezcla", "_limpieza"];
            esSetNuevo = files.some(f => nuevosSufijos.some(s => f.name.toLowerCase().includes(s)));
        }
    }

    const categoriasRequeridas = esSetNuevo ? CATEGORIAS_NUEVO : CATEGORIAS_LEGACY;
    
    // El estatus "OK" solo depende de las categorías CRÍTICAS (Inicial, Caja, Terminado)
    const faltanCriticas = CATEGORIAS_CRITICAS.filter(c => !encontradas.has(c));
    const status = faltanCriticas.length === 0 ? "OK" : "FALTA: " + faltanCriticas.join(" + ");

    // Detalle de lo que falta para el set completo (información adicional)
    const faltanDetalle = categoriasRequeridas.filter(c => !encontradas.has(c));
    
    return { 
        status, 
        photos: photosMap, 
        extraFilesCount, 
        isNewSet: esSetNuevo, 
        encontradas: Array.from(encontradas),
        faltanEnSetCompleto: faltanDetalle 
    };
}

/**
 * Genera el detalle de auditoría en texto legible.
 */
export function generarAuditDetail(folioStr, fechaStr, isLegacy, encontradasArray) {
    const encontradas = new Set(encontradasArray);
    const fechaLabel = fechaStr ? ` - ${String(fechaStr).trim()}` : '';
    const setLabel = isLegacy ? 'LEGACY' : '9 FOTOS';
    const categoriasRequeridas = isLegacy ? CATEGORIAS_LEGACY : CATEGORIAS_NUEVO;
    
    let lines = [`Folio ${folioStr}${fechaLabel} (${setLabel})`];
    for (const cat of categoriasRequeridas) {
        const found = encontradas.has(cat);
        lines.push(`  → ${folioStr}_${cat.toLowerCase()} ${found ? '✅' : '❌'}`);
    }
    return lines.join('\n');
}
