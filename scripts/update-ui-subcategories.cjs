const fs = require('fs');
const path = 'src/pages/safety/SafetyWarningsPage.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace CATEGORIES array block
const oldCategoriesRegex = /const CATEGORIES: \{[\s\S]*?\}] = \[[\s\S]*?\];/;

const newCategoriesBlock = `const CATEGORIES: {
    value: WCategory;
    subs: string[];
    standards: string[];
}[] = [
    {
        value: 'EQUIPMENT',
        subs: ['MISSING_GUARD', 'BROKEN_MACHINE', 'HIGH_PRESSURE', 'MISSING_MAINTENANCE', 'EXPOSED_WIRES', 'EXPIRED_EQUIPMENT'],
        standards: ['QCVN_26_2016', 'TCVN_5179_2013', 'IEC_60204_1'],
    },
    {
        value: 'ENVIRONMENT',
        subs: ['POOR_LIGHTING', 'HIGH_NOISE', 'HIGH_TEMPERATURE', 'EXCESSIVE_DUST', 'SLIPPERY_FLOOR', 'BLOCKED_AISLE', 'POOR_VENTILATION'],
        standards: ['QCVN_26_2016', 'QCVN_24_2016', 'TCVN_3733_2002'],
    },
    {
        value: 'HUMAN_BEHAVIOR',
        subs: ['NO_PPE', 'PROCESS_VIOLATION', 'UNAUTHORIZED_WORK', 'UNTRAINED', 'USING_PHONE', 'NO_LOTO'],
        standards: ['LAW_ATVSLD_2015', 'QCVN_04_2015'],
    },
    {
        value: 'FIRE_SAFETY',
        subs: ['EXPIRED_EXTINGUISHER', 'BLOCKED_ESCAPE_ROUTE', 'BROKEN_EXIT_SIGN', 'MISSING_EVAC_PLAN', 'FIRE_ALARM_FAULT', 'MISSING_FIRE_DRILL'],
        standards: ['QCVN_06_2021', 'TCVN_3890_2009', 'LAW_PCCC_2001'],
    },
    {
        value: 'CHEMICALS',
        subs: ['NO_CHEMICAL_LABEL', 'MISSING_SDS', 'IMPROPER_STORAGE', 'NO_CHEMICAL_PPE', 'MINOR_LEAK', 'EXPIRED_CHEMICALS'],
        standards: ['QCVN_05_2009', 'CIRCULAR_32_2017', 'GHS_CLP'],
    },
    {
        value: 'ERGONOMICS',
        subs: ['IMPROPER_LIFTING', 'UNSUITABLE_CHAIR', 'MONITOR_HEIGHT', 'PROLONGED_STANDING', 'MACHINE_VIBRATION', 'REPETITIVE_MOTION'],
        standards: ['ISO_9241', 'TCVN_7303_2003'],
    },
];`;

code = code.replace(oldCategoriesRegex, newCategoriesBlock);

// Next we need to replace how it renders.
// 1. In forms where it selects `<option value={sub}>{sub}</option>`
// It should be `<option value={sub}>{t(\`sub\${sub}\`, sub)}</option>`
// Let's find occurrences of `{sub}` and `{std}` inside options.
code = code.replace(/<option key=\{sub\} value=\{sub\}>\s*\{sub\}\s*<\/option>/g, '<option key={sub} value={sub}>{t(`sub${sub}` as any, sub)}</option>');
code = code.replace(/<option key=\{std\} value=\{std\}>\s*\{std\}\s*<\/option>/g, '<option key={std} value={std}>{t(`std${std}` as any, std)}</option>');

// 2. In warning cards, it displays: `{w.subcategory}`
// But wait, what if it's `{w.subcategory || w.category}`?
// Let's replace `{w.subcategory}` with `{w.subcategory ? t(\`sub\${w.subcategory}\` as any, w.subcategory) : null}`
code = code.replace(/\{w\.subcategory\}/g, '{w.subcategory ? t(`sub${w.subcategory}` as any, w.subcategory) : ""}');
code = code.replace(/\{warning\.subcategory\}/g, '{warning.subcategory ? t(`sub${warning.subcategory}` as any, warning.subcategory) : ""}');

// 3. And `{w.relatedStandard}` -> `{w.relatedStandard ? t(\`std\${w.relatedStandard}\` as any, w.relatedStandard) : ""}`
code = code.replace(/\{w\.relatedStandard\}/g, '{w.relatedStandard ? t(`std${w.relatedStandard}` as any, w.relatedStandard) : ""}');
code = code.replace(/\{warning\.relatedStandard\}/g, '{warning.relatedStandard ? t(`std${warning.relatedStandard}` as any, warning.relatedStandard) : ""}');

// Fix any potential errors with `null` fallback in the regex.
// Wait, `{w.subcategory}` was inside tags like `<span className="..."> {w.subcategory} </span>`

fs.writeFileSync(path, code, 'utf8');
console.log('Updated SafetyWarningsPage.tsx');
