// Prospect-shape validation — split out of aivis-core.mjs (2026-09-12
// architecture refactor). Used by proof-script to skip prospects with
// incomplete data before spending API calls on them.

export function requiredProspectFields() {
  return ['brand', 'website', 'competitors', 'category', 'use_case', 'region', 'customer_segment'];
}

export function missingProspectFields(p) {
  return requiredProspectFields().filter(
    (field) => !p[field] || (Array.isArray(p[field]) && p[field].length === 0)
  );
}
