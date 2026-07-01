const fs = require('fs');
const path = 'src/pages/safety/SafetyWarningsPage.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/\{warning\.status\}/g, '{t(`enum${warning.status}` as any) || warning.status}');
c = c.replace(/\{warning\.riskLevel\}/g, '{t(`enum${warning.riskLevel}` as any) || warning.riskLevel}');
c = c.replace(/\{warning\.category\}/g, '{t(`cat${warning.category}` as any) || warning.category}');

c = c.replace(/\{w\.status\}/g, '{t(`enum${w.status}` as any) || w.status}');
c = c.replace(/\{w\.riskLevel\}/g, '{t(`enum${w.riskLevel}` as any) || w.riskLevel}');
c = c.replace(/\{w\.category\}/g, '{t(`cat${w.category}` as any) || w.category}');

c = c.replace(/<option key=\{c\.value\} value=\{c\.value\}>\{c\.value\}<\/option>/g, '<option key={c.value} value={c.value}>{t(`cat${c.value}` as any) || c.value}</option>');

fs.writeFileSync(path, c, 'utf8');
console.log('Fixed enum renderings in SafetyWarningsPage.tsx');
