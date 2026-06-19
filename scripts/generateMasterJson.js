import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRATOS_DIR = path.resolve(__dirname, '../public/contratos');
const OUTPUT_DIR = path.resolve(__dirname, '../public/contratos');

const STAGES = ['E1', 'E2', 'E3', 'E3_SUP'];

function consolidate() {
    console.log('🚀 Iniciando Consolidación de Datos (ESM)...');

    for (const stage of STAGES) {
        console.log(`\n📦 Procesando ${stage}...`);
        const files = fs.readdirSync(CONTRATOS_DIR).filter(f => {
            if (f.includes('_Master')) return false;
            if (!f.endsWith('.json')) return false;
            // Evitar que E3 recoja archivos de E3_SUP
            if (stage === 'E3') return f.startsWith('E3_') && !f.startsWith('E3_SUP_');
            return f.startsWith(`${stage}_`);
        });
        
        let masterData = [];
        let count = 0;

        for (const file of files) {
            try {
                const filePath = path.join(CONTRATOS_DIR, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                if (!fileContent || fileContent.trim() === '') continue;
                
                const content = JSON.parse(fileContent);
                
                const parts = file.replace('.json', '').split('_');
                // E3_SUP files: ['E3','SUP','EMPRESA','ID'] → offset by 1
                // Other files:  ['E1','EMPRESA','ID']
                const isSupFile = stage === 'E3_SUP';
                const empresa = parts[isSupFile ? 2 : 1];
                const contratoId = parts[isSupFile ? 3 : 2];

                const enriched = (Array.isArray(content) ? content : [content]).map(item => ({
                    ...item,
                    _company: empresa,
                    _contract: contratoId,
                    _stage: stage
                }));

                masterData = masterData.concat(enriched);
                count++;
            } catch (e) {
                console.error(`❌ Error en ${file}:`, e.message);
            }
        }

        const outputPath = path.join(OUTPUT_DIR, `${stage}_Master.json`);
        fs.writeFileSync(outputPath, JSON.stringify(masterData));
        console.log(`✅ ${stage}_Master.json creado con ${masterData.length} folios de ${count} contratos.`);
    }

    console.log('\n✨ ¡Consolidación completada!');
}

consolidate();
