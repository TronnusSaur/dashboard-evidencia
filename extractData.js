import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const excelPath = 'REPORTE_AUDITORIA_FINAL_V6.xlsx';
const mockPath = 'src/dataMock.js';

try {
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  // Sumar totales de las columnas reales del Excel
  const totalExpedientes = data.reduce((acc, row) => acc + (Number(row.Total) || 0), 0);
  const totalOK = data.reduce((acc, row) => acc + (Number(row.OK) || 0), 0);
  const totalFaltantes = data.reduce((acc, row) => acc + (Number(row.Faltantes) || 0), 0);
  const totalZombis = data.reduce((acc, row) => acc + (Number(row.Zombis) || 0), 0);

  // % de fotos recolectadas = (OK / Total) * 100
  const cumplimiento = totalExpedientes > 0 ? ((totalOK / totalExpedientes) * 100).toFixed(1) : 0;

  // Estatus General (Donut Chart)
  const errorDistribution = [
    { name: 'Folios Completos', value: totalOK, color: '#10b981' },
    { name: 'Pendientes de foto final', value: totalFaltantes, color: '#ec4899' },
    { name: 'Folios sin Fotos (Crítico)', value: totalZombis, color: '#8b5cf6' }
  ];

  // Gráfica de Barras por Categoría (en lugar de meses)
  const categoryData = [
    { name: 'Completos', value: totalOK, color: '#10b981' },
    { name: 'Pendientes', value: totalFaltantes, color: '#ec4899' },
    { name: 'Críticos', value: totalZombis, color: '#8b5cf6' }
  ];

  const updatedMock = `export const SUMMARY_DATA = {
  totalExpedientes: ${totalExpedientes},
  cumplimiento: ${cumplimiento},
  erroresCriticos: ${totalZombis},
  pendientes: ${totalFaltantes},
};

export const ERROR_DISTRIBUTION = ${JSON.stringify(errorDistribution, null, 2)};

export const CATEGORY_DATA = ${JSON.stringify(categoryData, null, 2)};

export const CRITICAL_LIST = ${JSON.stringify(data.slice(0, 5), null, 2)};
`;

  fs.writeFileSync(mockPath, updatedMock);
  console.log('Successfully updated dataMock.js with category-based bar chart data');
} catch (error) {
  console.error('Error processing Excel:', error.message);
}
