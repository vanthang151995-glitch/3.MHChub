const fs = require('fs');
const path = 'src/pages/safety/SafetyWarningsIncidentsShared.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/<option value="CRITICAL">CRITICAL<\/option>/g, '<option value="CRITICAL">{t(`enumCRITICAL` as any) || "CRITICAL"}</option>');
c = c.replace(/<option value="HIGH">HIGH<\/option>/g, '<option value="HIGH">{t(`enumHIGH` as any) || "HIGH"}</option>');
c = c.replace(/<option value="MEDIUM">MEDIUM<\/option>/g, '<option value="MEDIUM">{t(`enumMEDIUM` as any) || "MEDIUM"}</option>');
c = c.replace(/<option value="LOW">LOW<\/option>/g, '<option value="LOW">{t(`enumLOW` as any) || "LOW"}</option>');

c = c.replace(/<option value="OPEN">OPEN<\/option>/g, '<option value="OPEN">{t(`enumOPEN` as any) || "OPEN"}</option>');
c = c.replace(/<option value="IN_PROGRESS">IN_PROGRESS<\/option>/g, '<option value="IN_PROGRESS">{t(`enumIN_PROGRESS` as any) || "IN_PROGRESS"}</option>');
c = c.replace(/<option value="DONE">DONE<\/option>/g, '<option value="DONE">{t(`enumDONE` as any) || "DONE"}</option>');
c = c.replace(/<option value="OVERDUE">OVERDUE<\/option>/g, '<option value="OVERDUE">{t(`enumOVERDUE` as any) || "OVERDUE"}</option>');

// Check if `t` is available.
if (!c.includes('const { t } = useSafetyI18n();')) {
    c = c.replace(/export function SafetyFilterBar\(\{/g, 'import { useSafetyI18n } from "./safety-i18n";\nexport function SafetyFilterBar({');
    c = c.replace(/export function SafetyFilterBar\(([\s\S]*?)return \(/g, 'export function SafetyFilterBar($1\n  const { t } = useSafetyI18n();\n  return (');
}

fs.writeFileSync(path, c, 'utf8');
console.log('Fixed enum renderings in SafetyWarningsIncidentsShared.tsx');
