const fs = require('fs');
const path = 'src/pages/safety/SafetyWarningsPage.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/\{CATEGORIES\.map\(cat => \(<option key=\{cat\.value\} value=\{cat\.value\}>\{cat\.value\}<\/option>\)\)\}/g, '{CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{t(`cat${cat.value}` as any) || cat.value}</option>))}');
c = c.replace(/\{activeCat\.subs\.map\(s => \(<option key=\{s\} value=\{s\}>\{s\}<\/option>\)\)\}/g, '{activeCat.subs.map(s => (<option key={s} value={s}>{t(`sub_${s}` as any) || s}</option>))}');

// For the standards button:
// {activeCat.standards.map(std => (<button key={std} type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: std, relatedStandardI18n: emptySafetyLocalizedText(std) }))} className={form.relatedStandard === std ? 'active' : ''}>
// {std}
// {form.relatedStandard === std ? <X className="w-3.5 h-3.5"/> : null}
// </button>))}
const stdBlockOld = `{activeCat.standards.map(std => (<button key={std} type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: std, relatedStandardI18n: emptySafetyLocalizedText(std) }))} className={form.relatedStandard === std ? 'active' : ''}>
                            {std}
                            {form.relatedStandard === std ? <X className="w-3.5 h-3.5"/> : null}
                          </button>))}`;
const stdBlockNew = `{activeCat.standards.map(std => (<button key={std} type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: std, relatedStandardI18n: emptySafetyLocalizedText(std) }))} className={form.relatedStandard === std ? 'active' : ''}>
                            {t(\`std_\${std}\` as any) || std}
                            {form.relatedStandard === std ? <X className="w-3.5 h-3.5"/> : null}
                          </button>))}`;
                          
c = c.replace(stdBlockOld, stdBlockNew);

fs.writeFileSync(path, c, 'utf8');
console.log('Fixed dropdown options mapping');
