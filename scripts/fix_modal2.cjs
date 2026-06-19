const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../src/components/FolioVisualizerModal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /    useEffect\(\(\) => \{\r?\n        if \(_isNewSet !== undefined\) setIsNewSet\(_isNewSet\);\r?\n    \}, \[_isNewSet\]\);/,
    '    useEffect(() => {\n        setLivePhotos(null);\n        setExtraFiles([]);\n        if (_isNewSet !== undefined) setIsNewSet(_isNewSet);\n    }, [FOLIO, _isNewSet]);'
);

content = content.replace(
    /    const triggerVerification = async \(\) => \{\r?\n        if \(!_folderId\) return;/,
    '    const triggerVerification = async () => {\n        if (!_folderId) {\n            if (onFolioSync) onFolioSync(FOLIO, null, "SIN CARPETA", 0);\n            return;\n        }\n        let status = "";\n        let currentFoundPhotos = null;\n        let currentExtrasCount = 0;'
);

content = content.replace('const foundPhotos = {};', 'currentFoundPhotos = {};');
content = content.replace(/foundPhotos\[/g, 'currentFoundPhotos[');
content = content.replace('setLivePhotos(foundPhotos);', 'setLivePhotos(currentFoundPhotos);');

content = content.replace('setExtraFiles(extras);', 'setExtraFiles(extras);\n                currentExtrasCount = extras.length;');

content = content.replace(
    /                if \(onFolioSync\) \{\r?\n                    onFolioSync\(FOLIO, foundPhotos, status, extras\.length\);\r?\n                \}\r?\n            \}/,
    '            }\n\n            if (onFolioSync) {\n                onFolioSync(FOLIO, currentFoundPhotos, status, currentExtrasCount);\n            }'
);

fs.writeFileSync(filePath, content);
console.log("Script finalizado exitosamente.");
