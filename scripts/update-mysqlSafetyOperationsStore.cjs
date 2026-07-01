const fs = require('fs');
const path = 'server/core/mysqlSafetyOperationsStore.js';
let c = fs.readFileSync(path, 'utf8');

// 1. rowToWarning
c = c.replace(
  /areaI18n: parseLocalizedText\(row\.area_i18n_json, row\.area \|\| ""\),\n\s*riskProbability:/,
  `areaI18n: parseLocalizedText(row.area_i18n_json, row.area || ""),
  productionLine: row.production_line || "",
  machineName: row.machine_name || "",
  locationDetail: row.location_detail || "",
  detectedAt: toIso(row.detected_at),
  coordinator: row.coordinator || "",
  additionalNotes: row.additional_notes || "",
  additionalNotesI18n: parseLocalizedText(row.additional_notes_i18n_json, row.additional_notes || ""),
  riskProbability:`
);

// 2. insertWarning Query Columns
c = c.replace(
  /submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name,\n\s*updated_by_name, created_at, updated_at\)/,
  `submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name,
          updated_by_name, created_at, updated_at,
          production_line, machine_name, location_detail, detected_at,
          coordinator, additional_notes, additional_notes_i18n_json)`
);

// 3. insertWarning Query Values (adding 7 questions marks)
c = c.replace(
  /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
  `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// 4. insertWarning Query Parameters
const additionalNotesI18nStr = 'const additionalNotesI18n = input.additionalNotesI18n || { vi: input.additionalNotes || "" };';
if (!c.includes(additionalNotesI18nStr)) {
  c = c.replace(
    'const rejectionReasonI18n = input.rejectionReasonI18n || { vi: input.rejectionReason || "" };',
    `const rejectionReasonI18n = input.rejectionReasonI18n || { vi: input.rejectionReason || "" };
      const additionalNotesI18n = input.additionalNotesI18n || { vi: input.additionalNotes || "" };`
  );
}

c = c.replace(
  /safeActor\.displayName,\n\s*safeActor\.displayName,\n\s*now,\n\s*now\n\s*\]/,
  `safeActor.displayName,
          safeActor.displayName,
          now,
          now,
          textOrNull(input.productionLine),
          textOrNull(input.machineName),
          textOrNull(input.locationDetail),
          input.detectedAt ? new Date(input.detectedAt) : null,
          textOrNull(input.coordinator),
          textOrNull(localizedLegacy(additionalNotesI18n)),
          localizedTextJsonOrNull(additionalNotesI18n)
        ]`
);

// 5. updateWarning Query
c = c.replace(
  /status = \?, updated_by_name = \?, updated_at = \?\n\s*WHERE id = \? AND deleted_at IS NULL/,
  `status = ?, updated_by_name = ?, updated_at = ?,
          production_line = ?, machine_name = ?, location_detail = ?, detected_at = ?,
          coordinator = ?, additional_notes = ?, additional_notes_i18n_json = ?
         WHERE id = ? AND deleted_at IS NULL`
);

// 6. updateWarning Query Variables prep
const additionalNotesI18nUpdateStr = 'const additionalNotesI18n = mergeLocalizedForUpdate(input, "additionalNotes", current);';
if (!c.includes(additionalNotesI18nUpdateStr)) {
  c = c.replace(
    'const relatedStandardI18n = mergeLocalizedForUpdate(input, "relatedStandard", current);',
    `const relatedStandardI18n = mergeLocalizedForUpdate(input, "relatedStandard", current);
      const additionalNotesI18n = mergeLocalizedForUpdate(input, "additionalNotes", current);`
  );
}

// 7. updateWarning Query Parameters
c = c.replace(
  /safeActor\.displayName,\n\s*toMysqlDate\(\),\n\s*id\n\s*\]/,
  `safeActor.displayName,
          toMysqlDate(),
          textOrNull(input.productionLine ?? current.productionLine),
          textOrNull(input.machineName ?? current.machineName),
          textOrNull(input.locationDetail ?? current.locationDetail),
          input.detectedAt !== undefined ? (input.detectedAt ? new Date(input.detectedAt) : null) : (current.detectedAt ? new Date(current.detectedAt) : null),
          textOrNull(input.coordinator ?? current.coordinator),
          textOrNull(localizedLegacy(additionalNotesI18n)),
          localizedTextJsonOrNull(additionalNotesI18n),
          id
        ]`
);

fs.writeFileSync(path, c, 'utf8');
console.log('Successfully updated mysqlSafetyOperationsStore.js');
