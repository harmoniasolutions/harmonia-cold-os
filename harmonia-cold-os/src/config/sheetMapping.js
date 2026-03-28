// src/config/sheetMapping.js
// ============================================
// SINGLE SOURCE OF TRUTH
// React state → n8n webhook payload → Google Sheets columns
// If you change a column in the sheet, update it HERE.
// ============================================

export const SHEET_CONFIG = {
  tabs: {
    LEADS: {
      name: 'Leads',
      fields: {
        lead_id:           { sheetColumn: 'id',              column: 'A', required: true },
        biz:               { sheetColumn: 'biz',             column: 'B', required: true },
        owner:             { sheetColumn: 'owner',           column: 'C', required: false },
        phone:             { sheetColumn: 'phone',           column: 'D', required: true },
        city:              { sheetColumn: 'city',            column: 'E', required: false },
        state:             { sheetColumn: 'state',           column: 'F', required: false },
        icp:               { sheetColumn: 'icp',             column: 'G', required: true },
        score:             { sheetColumn: 'score',           column: 'H', required: false },
        pain:              { sheetColumn: 'pain',            column: 'I', required: false },
        leak:              { sheetColumn: 'leak',            column: 'J', required: false },
        chairs:            { sheetColumn: 'chairs',          column: 'K', required: false },
        website:           { sheetColumn: 'website',         column: 'L', required: false },
        opener:            { sheetColumn: 'opener',          column: 'M', required: false },
        intel_comments:    { sheetColumn: 'intel_comments',  column: 'N', required: false },
        pain_signals:      { sheetColumn: 'pain_signals',    column: 'O', required: false },
        google_reviews:    { sheetColumn: 'google_reviews',  column: 'P', required: false },
        reviews_count:     { sheetColumn: 'reviews_count',   column: 'Q', required: false },
        status:            { sheetColumn: 'status',          column: 'R', required: true },
        script_used:       { sheetColumn: 'script_used',     column: 'S', required: true },
        created_at:        { sheetColumn: 'created_at',      column: 'T', required: true },
        call_link:         { sheetColumn: 'call_link',       column: 'U', required: false },
        disposition:       { sheetColumn: 'disposition',      column: 'V', required: true },
        objection_raised:  { sheetColumn: 'objection_raised', column: 'W', required: false },
        caller_name:       { sheetColumn: 'caller_name',     column: 'X', required: true },
      }
    },

    SCRIPTS: {
      name: 'Scripts',
      fields: {
        icp:     { sheetColumn: 'icp',     column: 'A' },
        variant: { sheetColumn: 'variant', column: 'B' },
        name:    { sheetColumn: 'name',    column: 'C' },
        tag:     { sheetColumn: 'tag',     column: 'D' },
        type:    { sheetColumn: 'type',    column: 'E' },
        text:    { sheetColumn: 'text',    column: 'F' },
      }
    },

    OBJECTIONS: {
      name: 'Objections',
      fields: {
        icp:      { sheetColumn: 'icp',      column: 'A' },
        question: { sheetColumn: 'question', column: 'B' },
        answer:   { sheetColumn: 'answer',   column: 'C' },
      }
    },

    SCRIPT_PERFORMANCE: { name: 'Script_Performance', fields: {} },
    SCRIPT_RANKINGS:    { name: 'Script_Rankings',    fields: {} },
  }
};

// Caller options — all 5 names shown in selector.
// If phone is null, show "(no number)" label but still allow selection.
export const CALLER_OPTIONS = [
  { name: 'Javi',   phone: 'HAS_NUMBER' },
  { name: 'Julian', phone: 'HAS_NUMBER' },
  { name: 'Owen',   phone: 'HAS_NUMBER' },
  { name: 'Joel',   phone: null },
];

// Script options per ICP (derived from Scripts tab)
export const SCRIPT_OPTIONS = {
  hvac: [
    { variant: 'a', name: 'Revenue Leak', tag: 'Pain-first',    label: 'A — Revenue Leak (Pain-first)' },
    { variant: 'b', name: 'After Hours',  tag: 'Urgency-first', label: 'B — After Hours (Urgency-first)' },
    { variant: 'c', name: 'Peak Season',  tag: 'Timing-first',  label: 'C — Peak Season (Timing-first)' },
  ],
  salon: [],
  dental: [],
  barbershop: [],
};

// Objection presets per ICP (derived from Objections tab)
export const OBJECTION_PRESETS = {
  hvac: [
    'We already have voicemail',
    'Too expensive',
    "We're too busy right now",
    "I'll think about it",
    'We have a receptionist',
  ],
  salon: [
    'We use Vagaro already',
    'My clients just text me',
    "Can't afford it right now",
    'I do everything myself',
  ],
  dental: [],
  barbershop: [],
  _global: [
    'None / No objection',
  ],
};

// Disposition options
export const DISPOSITION_OPTIONS = [
  { value: 'demo_booked',    label: 'Demo Booked' },
  { value: 'answered',       label: 'Answered — No Demo' },
  { value: 'no_answer',      label: 'No Answer' },
  { value: 'voicemail',      label: 'Voicemail' },
  { value: 'callback',       label: 'Callback Requested' },
  { value: 'not_interested', label: 'Not Interested' },
];

// Build webhook payload from component state
export function buildCallPayload(state) {
  const fields = SHEET_CONFIG.tabs.LEADS.fields;
  const payload = {};

  for (const [key, config] of Object.entries(fields)) {
    payload[key] = state[key] ?? '';
  }

  payload.call_timestamp = new Date().toISOString();
  return payload;
}

// Validate payload before sending
export function validatePayload(payload) {
  const fields = SHEET_CONFIG.tabs.LEADS.fields;
  const missing = [];

  for (const [key, config] of Object.entries(fields)) {
    if (config.required && (!payload[key] || payload[key] === '')) {
      missing.push(`${key} → Sheet col ${config.column} "${config.sheetColumn}"`);
    }
  }

  return { valid: missing.length === 0, missing };
}
