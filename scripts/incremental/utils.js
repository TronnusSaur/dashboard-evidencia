/**
 * Normaliza el formato de un Folio (ej. "1" -> "001", "1-2" -> "001-2").
 */
export const normalizeFolio = (f) => {
    if (!f) return f;
    let trimmed = String(f).trim().replace(/\s*-\s*/g, '-');
    if (/^\d+$/.test(trimmed)) return trimmed.padStart(3, '0');
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        return `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }
    return trimmed;
};

/**
 * Limpia nombres para archivos (quita tildes y caracteres especiales).
 */
export const sanitizeFileName = (name) => {
    if (!name) return "DESCONOCIDO";
    return name.normalize("NFD")
               .replace(/[\u0300-\u036f]/g, "") 
               .replace(/[^a-zA-Z0-9_\-]/g, '_') 
               .toUpperCase();
};

/**
 * Fecha de corte para determinar si un folio es Legacy (3 fotos) o Nuevo (9 fotos).
 */
const LEGACY_CUTOFF_DATE = new Date('2025-04-20');

/**
 * Determina si un folio es Legacy basándose en su fecha.
 */
export function isLegacyByDate(fechaStr) {
    if (!fechaStr || !String(fechaStr).trim()) return null;
    const str = String(fechaStr).trim();
    const parts = str.split('/');
    if (parts.length === 3) {
        const [d, m, y] = parts;
        let year = parseInt(y, 10);
        if (year < 100) year += 2000;
        const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
        if (!isNaN(date.getTime())) {
            return date < LEGACY_CUTOFF_DATE;
        }
    }
    const native = new Date(str);
    if (!isNaN(native.getTime())) {
        return native < LEGACY_CUTOFF_DATE;
    }
    return null;
}
