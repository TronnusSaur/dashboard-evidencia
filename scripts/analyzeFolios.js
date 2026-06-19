import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public', 'contratos');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.json'));

let foundFolios = [];
let allFolios = [];

files.forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(publicDir, file), 'utf8'));
    data.forEach(row => {
        allFolios.push(row.FOLIO);
        if (String(row.FOLIO).includes('8041')) {
            foundFolios.push(row);
        }
    });
});

console.log("=== Folios 8041 ===");
console.log(JSON.stringify(foundFolios, null, 2));

// Test what the regex does on some example broken folios
const testNames = [
    "8041-1",
    "8041- 1",
    "8041 - 1",
    "8041",
    "8041A",
    "123-B",
    "123 - B",
    "Folio 8041",
    "8041_Inicial"
];

console.log("\n=== Regex Test ===");
testNames.forEach(rawName => {
    const match = rawName.match(/^(\d+(?:\s*-\s*\d+)*)/);
    let extracted = match ? match[1] : rawName.split('_')[0].split(' ')[0];

    // Normalizar
    let trimmed = String(extracted).trim().replace(/\s*-\s*/g, '-');
    if (/^\d+$/.test(trimmed)) trimmed = trimmed.padStart(3, '0');
    if (/^\d+-\d+$/.test(trimmed)) {
        const parts = trimmed.split('-');
        trimmed = `${parts[0].padStart(3, '0')}-${parts[1]}`;
    }

    console.log(`Raw: "${rawName}" -> Extracted: "${extracted}" -> Normalized: "${trimmed}"`);
});

// Let's also find what non-numeric folios exist in the dataset
const nonNumeric = allFolios.filter(f => !/^\d+$/.test(f) && !/^\d+-\d+$/.test(f));
console.log(`\n=== Non-numeric folios in dataset (sample of 10) ===`);
console.log(nonNumeric.slice(0, 10));
