import XLSX from 'xlsx';
import fs from 'fs';

const excelPath = 'Reporte_Faltantes_Evidencia_Final.xlsx';
const mockPath = 'src/dataMock.js';

try {
    const workbook = XLSX.readFile(excelPath);

    // 1. Process RESUMEN_DASHBOARD
    const resumenSheet = workbook.Sheets['RESUMEN_DASHBOARD'];
    const resumenData = XLSX.utils.sheet_to_json(resumenSheet);

    // Global Totals for Pie Chart (Initial State)
    const totals = {
        'SIN CARPETA': 0,
        'CARPETA VACÍA': 0,
        'FALTA FOTO FINAL': 0,
        'EVIDENCIA INCOMPLETA': 0
    };

    resumenData.forEach(row => {
        totals['SIN CARPETA'] += (row['SIN CARPETA'] || 0);
        totals['CARPETA VACÍA'] += (row['CARPETA VACÍA'] || 0);
        totals['FALTA FOTO FINAL'] += (row['FALTA FOTO FINAL'] || 0);
        totals['EVIDENCIA INCOMPLETA'] += (row['EVIDENCIA INCOMPLETA'] || 0);
    });

    // Filters Map
    const filtersMap = {};
    resumenData.forEach(row => {
        const company = row.EMPRESA_RAIZ_MASTER;
        const id = row.ID.toString();
        if (!filtersMap[company]) {
            filtersMap[company] = [];
        }
        filtersMap[company].push(id);
    });

    // 2. Process Company Sheets for Detail Table
    const recordsByContract = {};
    const companySheets = workbook.SheetNames.filter(name => name !== 'RESUMEN_DASHBOARD');

    companySheets.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        recordsByContract[sheetName] = data.map(row => ({
            folio: row.folio,
            Error: row.Error,
            calle: row.calle,
            delegacion: row.delegacion,
            colonia: row.colonia
        }));
    });

    const updatedMock = `// Generated data from Reporte_Faltantes_Evidencia_Final.xlsx
export const GLOBAL_TOTALS = ${JSON.stringify(totals, null, 2)};

export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};

export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};

export const RECORDS_BY_CONTRACT = ${JSON.stringify(recordsByContract, null, 2)};
`;

    fs.writeFileSync(mockPath, updatedMock);
    console.log('Successfully updated dataMock.js with report data');

} catch (error) {
    console.error('Error processing Excel:', error.message);
}
