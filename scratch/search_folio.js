import fs from 'fs';

try {
    const fileContent = fs.readFileSync('public/contratos/E3_Master.json', 'utf8');
    const data = JSON.parse(fileContent);
    const folio = data.find(r => String(r.FOLIO) === '310310');
    console.log('Result for 310310 in E3_Master.json:', JSON.stringify(folio, null, 2));
} catch (e) {
    console.error('Error:', e.message);
}
