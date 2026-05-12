/**
 * Patrones de búsqueda para detectar tipos de fotos en los nombres de archivo.
 */
export const PATRONES = {
    "INICIAL": ["_inicial"],
    "FOLIO": ["_folio"],
    "CORTE": ["_corte"],
    "DEMOLICION": ["_demolicion"],
    "CAJA": ["_caja"],
    "LIGA": ["_liga"],
    "MEZCLA": ["_mezcla"],
    "TERMINADO": ["_terminado"],
    "LIMPIEZA": ["_limpieza"]
};

/**
 * Categorías requeridas para cada tipo de set.
 */
export const CATEGORIAS_LEGACY = ["INICIAL", "CAJA", "TERMINADO"];
export const CATEGORIAS_NUEVO = ["INICIAL", "FOLIO", "CORTE", "DEMOLICION", "CAJA", "LIGA", "MEZCLA", "TERMINADO", "LIMPIEZA"];

/**
 * Categorías críticas que definen si un folio es "OK" en el Dashboard principal.
 */
export const CATEGORIAS_CRITICAS = ["INICIAL", "CAJA", "TERMINADO"];

/**
 * Directorios y rutas de salida.
 */
import path from 'path';
export const PUBLIC_DIR = path.join(process.cwd(), 'public', 'contratos');
export const MOCK_PATH = path.join(process.cwd(), 'src', 'dataMock.js');
export const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * Configuración de Etapas.
 */
export const STAGES_CONFIG = [
    {
        id: 'E1',
        name: '1 - ETAPA 1 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE_E1 || '1RJrTrWIp7sYZDyAYhmsq_5xqaLCj3CYN',
        sheetId: process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
        driveType: 'ADMIN'
    },
    {
        id: 'E2',
        name: '2 - ETAPA 2 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE || '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik',
        sheetId: process.env.DOCUMENT_ID_SHEETS || '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
        driveType: 'ADMIN'
    },
    {
        id: 'E3',
        name: '3 - ETAPA 3 MASTER',
        driveId: process.env.FOLDER_ID_DRIVE_E3 || '1EqejY8Bm2c3NvQ0PEOh7DNUEABuJmHMr',
        sheetId: process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU',
        driveType: 'ADMIN'
    },
    {
        id: 'E3_SUP',
        name: '3 - ETAPA 3 MASTER',
        driveId: '1B54IJmRS_D2J_FECE75RRo3UejfzUPU6', 
        sheetId: process.env.DOCUMENT_ID_SHEETS_E3 || '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU',
        driveType: 'SUPERVISOR',
        uploadEmail: 'terceraetapabacheo@gmail.com'
    }
];
