const fs = require('fs');
const path = 'src/i18n.ts';
let code = fs.readFileSync(path, 'utf8');

// The problematic lines look like `en: {\n    subMISSING...`
// I'll replace `\\n    ` with actual newline + 4 spaces.
// We only need to fix lines that have `\\n    ` and end with `,`
code = code.split('\\n').join('\n');

fs.writeFileSync(path, code, 'utf8');
console.log('Fixed newlines in i18n.ts');
