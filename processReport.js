import fs from 'fs';
import path from 'path';

const resourcesDir = path.join(process.cwd(), 'dashboard_resources');
const statsMasterPath = path.join(resourcesDir, 'stats_master.json');
const contratosDir = path.join(resourcesDir, 'contratos');
const publicContratosDir = path.join(process.cwd(), 'public', 'contratos');
const mockPath = path.join(process.cwd(), 'src', 'dataMock.js');

try {
    // 1. Process stats_master.json
    const statsMasterData = fs.readFileSync(statsMasterPath, 'utf8');
    const globalTotals = JSON.parse(statsMasterData);

    // Extract dynamic error types
    const errorTypes = Object.keys(globalTotals);

    // 2. Process Company JSONs to build FILTERS_MAP and RESUMEN_DATA
    const filtersMap = {};
    const resumenData = [];

    // Ensure public/contratos exists
    if (!fs.existsSync(publicContratosDir)) {
        fs.mkdirSync(publicContratosDir, { recursive: true });
    }

    const files = fs.readdirSync(contratosDir).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        const basename = path.basename(file, '.json');
        const lastUnderscoreIndex = basename.lastIndexOf('_');
        if (lastUnderscoreIndex === -1) return;

        const company = basename.substring(0, lastUnderscoreIndex);
        const id = basename.substring(lastUnderscoreIndex + 1);

        if (!filtersMap[company]) {
            filtersMap[company] = [];
        }
        filtersMap[company].push(id);

        const contractPath = path.join(contratosDir, file);
        const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

        const contractSummary = {
            EMPRESA_RAIZ_MASTER: company,
            ID: id,
            TOTAL_OMISIONES: contractData.length
        };

        // Initialize counts
        errorTypes.forEach(type => contractSummary[type] = 0);

        contractData.forEach(row => {
            const status = row.RESULTADO_AUDITORIA;
            if (contractSummary[status] !== undefined) {
                contractSummary[status]++;
            } else {
                contractSummary[status] = 1;
                if (!errorTypes.includes(status)) {
                    errorTypes.push(status);
                }
            }
        });

        resumenData.push(contractSummary);

        // Copy file to public/contratos
        fs.copyFileSync(contractPath, path.join(publicContratosDir, file));
    });

    const updatedMock = `// Generated data from Sentinel JSONs
export const ERROR_TYPES = ${JSON.stringify(errorTypes, null, 2)};
export const GLOBAL_TOTALS = ${JSON.stringify(globalTotals, null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;

    fs.writeFileSync(mockPath, updatedMock);
    console.log('Successfully updated dataMock.js and copied contract JSONs to public/contratos');

} catch (error) {
    console.error('Error processing JSONs:', error);
}
