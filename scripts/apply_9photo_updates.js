const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

// 1. Update dataMock.js with new error types
const dataMockPath = path.join(projectRoot, 'src', 'dataMock.js');
let dataMockContent = fs.readFileSync(dataMockPath, 'utf8');

const newErrorTypes = [
  "FALTA: FOLIO",
  "FALTA: CORTE",
  "FALTA: DEMOLICION",
  "FALTA: LIGA",
  "FALTA: MEZCLA",
  "FALTA: LIMPIEZA"
];

let errorTypesMatch = dataMockContent.match(/export const ERROR_TYPES = \[([\s\S]*?)\];/);
if (errorTypesMatch) {
    let currentTypes = errorTypesMatch[1].split(',').map(t => t.trim().replace(/"/g, '')).filter(Boolean);
    let updatedTypes = [...new Set([...currentTypes, ...newErrorTypes])];
    let updatedTypesStr = 'export const ERROR_TYPES = [\n  ' + updatedTypes.map(t => `"${t}"`).join(',\n  ') + '\n];';
    dataMockContent = dataMockContent.replace(errorTypesMatch[0], updatedTypesStr);
    fs.writeFileSync(dataMockPath, dataMockContent, 'utf8');
    console.log('✅ dataMock.js updated with new error types');
}

// 2. Update PhotoEvidenceDashboard.jsx UI to show more KPIs
const dashboardPath = path.join(projectRoot, 'src', 'components', 'PhotoEvidenceDashboard.jsx');
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// Update the KPI Cards Grid to be responsive and show more info
const oldGridStart = '<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">';
const newGridStart = '<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3 mb-8">';

if (dashboardContent.includes(oldGridStart)) {
    // We will replace the whole grid section to add the new cards
    const gridRegex = /<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">([\s\S]*?)<\/div>\s*<\/div>\s*\{# Main Content Area #\}/;
    // Actually let's just do a targeted replacement of the cards
    
    let kpiCards = `
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12 gap-3 mb-8">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shadow-sm border-l-4 border-l-emerald-500">
                        <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">OK</p>
                        <h4 className="text-xl font-black text-emerald-700 dark:text-emerald-300">{kpiData.ok}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-indigo-500">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">TOTAL ERR</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.total}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-primary">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">CARPETA</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.sinCarpeta}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">INICIAL</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaInicial}</h4>
                    </div>
                    {/* New Categories */}
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-amber-500">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">FOLIO</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaFolio || 0}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-amber-600">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">CORTE</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaCorte || 0}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-amber-700">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">DEMOL</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaDemolicion || 0}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-600">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">CAJA</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaCaja}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-700">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">LIGA</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaLiga || 0}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-800">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">MEZCLA</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaMezcla || 0}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">FINAL</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaFinal}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-blue-500">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">LIMPIEZA</p>
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaLimpieza || 0}</h4>
                    </div>
                </div>`;

    const oldGridRegex = /<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">[\s\S]*?<\/div>/;
    dashboardContent = dashboardContent.replace(oldGridRegex, kpiCards.trim());
    fs.writeFileSync(dashboardPath, dashboardContent, 'utf8');
    console.log('✅ PhotoEvidenceDashboard.jsx UI updated');
}

console.log('Done.');
