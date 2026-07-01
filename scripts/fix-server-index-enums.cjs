const fs = require('fs');
const path = 'server/index.js';
let code = fs.readFileSync(path, 'utf8');

const r = (f, t) => { code = code.split(f).join(t); };

r('Cực kỳ nghiêm trọng', 'CRITICAL');
r('Nghiêm trọng', 'HIGH');
r('Trung bình', 'MEDIUM');
r('Thấp', 'LOW');

fs.writeFileSync(path, code, 'utf8');
console.log('Updated index.js');
