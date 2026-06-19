const fs = require('fs');
const path = require('path');

/**
 * GENERIC DATA PROCESSOR FOR DASHBOARD ENGINE
 * This script normalizes JSON data for the template engine.
 */

const resourcesDir = path.join(process.cwd(), 'dashboard_resources');
const publicContratosDir = path.join(process.cwd(), 'public', 'contratos');
const mockPath = path.join(process.cwd(), 'src', 'dataMock.js');

try {
    // 1. Process all JSON files in dashboard_resources
    if (!fs.existsSync(publicContratosDir)) {
        fs.mkdirSync(publicContratosDir, { recursive: true });
    }

    const files = fs.readdirSync(resourcesDir).filter(f => f.endsWith('.json'));
    const resumenData = [];
    const filtersMap = {};
    const errorTypes = new Set();

    files.forEach(file => {
        const basename = path.basename(file, '.json');
        const [stage, company, id] = basename.split('_');

        if (!stage || !company || !id) return;

        const contractPath = path.join(resourcesDir, file);
        const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

        const contractSummary = {
            EMPRESA_RAIZ_MASTER: company,
            ID: id,
            _stage: stage,
            total: contractData.length
        };

        // Automatic categorization logic
        contractData.forEach(row => {
            const status = row.RESULTADO_AUDITORIA || "UNKNOWN";
            errorTypes.add(status);
            contractSummary[status] = (contractSummary[status] || 0) + 1;
        });

        resumenData.push(contractSummary);
        if (!filtersMap[company]) filtersMap[company] = [];
        filtersMap[company].push(id);

        // Copy for frontend access
        fs.copyFileSync(contractPath, path.join(publicContratosDir, file));
    });

    // 2. Export updated dataMock
    const updatedMock = `// ARCHIVO AUTO-GENERADO POR DASHBOARD ENGINE
export const ERROR_TYPES = ${JSON.stringify(Array.from(errorTypes), null, 2)};
export const RESUMEN_DATA = ${JSON.stringify(resumenData, null, 2)};
export const FILTERS_MAP = ${JSON.stringify(filtersMap, null, 2)};
`;

    fs.writeFileSync(mockPath, updatedMock);
    console.log('✅ Template: dataMock.js updated successfully!');

} catch (error) {
    console.error('❌ Template Processor Error:', error);
}
