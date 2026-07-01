const fs = require('fs');
const path = 'src/pages/safety/SafetyWarningsPage.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/t\(\`sub\$\{sub\}\` as any, sub\)/g, 't(`sub_${sub}` as any) || sub');
c = c.replace(/t\(\`std\$\{std\}\` as any, std\)/g, 't(`std_${std}` as any) || std');

c = c.replace(/t\(\`sub\$\{w\.subcategory\}\` as any, w\.subcategory\)/g, 't(`sub_${w.subcategory}` as any) || w.subcategory');
c = c.replace(/t\(\`sub\$\{warning\.subcategory\}\` as any, warning\.subcategory\)/g, 't(`sub_${warning.subcategory}` as any) || warning.subcategory');

c = c.replace(/t\(\`std\$\{w\.relatedStandard\}\` as any, w\.relatedStandard\)/g, 't(`std_${w.relatedStandard}` as any) || w.relatedStandard');
c = c.replace(/t\(\`std\$\{warning\.relatedStandard\}\` as any, warning\.relatedStandard\)/g, 't(`std_${warning.relatedStandard}` as any) || warning.relatedStandard');

// Wait! In the previous script I used: t(`sub${sub}` as any, sub) without an underscore!
// But in `append-i18n.cjs` I used `subMISSING_GUARD` (no underscore).
// Let's use `sub${sub}` (no underscore)
c = c.replace(/t\(\`sub_\$\{sub\}\` as any\) \|\| sub/g, 't(`sub${sub}` as any) || sub');
c = c.replace(/t\(\`sub\$\{sub\}\` as any, sub\)/g, 't(`sub${sub}` as any) || sub');
c = c.replace(/t\(\`std\$\{std\}\` as any, std\)/g, 't(`std${std}` as any) || std');

c = c.replace(/t\(\`sub\$\{w\.subcategory\}\` as any, w\.subcategory\)/g, 't(`sub${w.subcategory}` as any) || w.subcategory');
c = c.replace(/t\(\`sub\$\{warning\.subcategory\}\` as any, warning\.subcategory\)/g, 't(`sub${warning.subcategory}` as any) || warning.subcategory');

c = c.replace(/t\(\`std\$\{w\.relatedStandard\}\` as any, w\.relatedStandard\)/g, 't(`std${w.relatedStandard}` as any) || w.relatedStandard');
c = c.replace(/t\(\`std\$\{warning\.relatedStandard\}\` as any, warning\.relatedStandard\)/g, 't(`std${warning.relatedStandard}` as any) || warning.relatedStandard');

fs.writeFileSync(path, c, 'utf8');
console.log('Fixed TS Error!');
