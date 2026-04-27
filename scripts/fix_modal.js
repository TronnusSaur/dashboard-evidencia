const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'FolioVisualizerModal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Add missing renamingId state (bug: used but never declared)
const oldState = `const [editingFile, setEditingFile] = useState(null);\r\n    const [isNewSet, setIsNewSet] = useState(false);`;
const newState = `const [editingFile, setEditingFile] = useState(null);\r\n    const [renamingId, setRenamingId] = useState(null);\r\n    const [isNewSet, setIsNewSet] = useState(false);`;

if (content.includes(oldState)) {
    content = content.replace(oldState, newState);
    console.log('✅ Fix 1: renamingId state added');
} else {
    console.log('⚠️ Fix 1: pattern not found (may already be applied)');
}

// Fix 2: Update grid layout for 9-photo responsive view
const oldGrid = `<div className="grid grid-cols-1 md:grid-cols-3 gap-6">`;
const newGrid = '<div className={`grid gap-4 ${isNewSet ? \'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3\' : \'grid-cols-1 md:grid-cols-3\'}`}>';

if (content.includes(oldGrid)) {
    content = content.replace(oldGrid, newGrid);
    console.log('✅ Fix 2: Grid layout updated for 9-photo view');
} else {
    console.log('⚠️ Fix 2: grid pattern not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\n🎉 FolioVisualizerModal.jsx patched successfully!');
