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
      // Current live schema (30 cols, A–AD). Header migrated from the old names —
      // the read/render path (parseLeads) aliases: biz→biz_name, phone→corporate_phone||mobile_phone,
      // intel_comments→intel, score→reviews_rating. Fields with no current column (pain, leak, chairs,
      // pain_signals, google_reviews, competitor, script_used) were dropped from the sheet.
      fields: {
        id:                       { sheetColumn: 'id',                       column: 'A',  required: true },
        biz_name:                 { sheetColumn: 'biz_name',                 column: 'B',  required: true },
        icp:                      { sheetColumn: 'icp',                      column: 'C',  required: true },
        owner:                    { sheetColumn: 'owner',                    column: 'D',  required: false },
        business_email_verified:  { sheetColumn: 'business_email_verified',  column: 'E',  required: false },
        personal_email:           { sheetColumn: 'personal_email',           column: 'F',  required: false },
        send_to:                  { sheetColumn: 'send_to',                  column: 'G',  required: false },
        corporate_phone:          { sheetColumn: 'corporate_phone',          column: 'H',  required: false },
        mobile_phone:             { sheetColumn: 'mobile_phone',             column: 'I',  required: false },
        city:                     { sheetColumn: 'city',                     column: 'J',  required: false },
        state:                    { sheetColumn: 'state',                    column: 'K',  required: false },
        zip:                      { sheetColumn: 'zip',                      column: 'L',  required: false },
        address:                  { sheetColumn: 'address',                  column: 'M',  required: false },
        website:                  { sheetColumn: 'website',                  column: 'N',  required: false },
        linkedin:                 { sheetColumn: 'linkedin',                 column: 'O',  required: false },
        online_booking:           { sheetColumn: 'online_booking',           column: 'P',  required: false },
        intel:                    { sheetColumn: 'intel',                    column: 'Q',  required: false },
        opener:                   { sheetColumn: 'opener',                   column: 'R',  required: false },
        opener_check:             { sheetColumn: 'opener_check',             column: 'S',  required: false },
        reviews_count:            { sheetColumn: 'reviews_count',            column: 'T',  required: false },
        reviews_rating:           { sheetColumn: 'reviews_rating',           column: 'U',  required: false },
        status:                   { sheetColumn: 'status',                   column: 'V',  required: true },
        channel:                  { sheetColumn: 'channel',                  column: 'W',  required: false },
        last_touch:               { sheetColumn: 'last_touch',               column: 'X',  required: false },
        next_action:              { sheetColumn: 'next_action',              column: 'Y',  required: false },
        caller_name:              { sheetColumn: 'caller_name',              column: 'Z',  required: false },
        disposition:              { sheetColumn: 'disposition',              column: 'AA', required: false },
        source:                   { sheetColumn: 'source',                   column: 'AB', required: false },
        last_agent_action:        { sheetColumn: 'last_agent_action',        column: 'AC', required: false },
        last_agent_at:            { sheetColumn: 'last_agent_at',            column: 'AD', required: false },
      }
    },

    SCRIPTS: {
      name: 'Scripts',
      fields: {
        icp:       { sheetColumn: 'icp',      column: 'A' },
        variant:   { sheetColumn: 'variant',   column: 'B' },
        name:      { sheetColumn: 'name',      column: 'C' },
        tag:       { sheetColumn: 'tag',       column: 'D' },
        type:      { sheetColumn: 'type',      column: 'E' },
        text:      { sheetColumn: 'text',      column: 'F' },
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

    BUBBLES: {
      name: 'bubbles',
      fields: {
        phase:       { sheetColumn: 'phase',       column: 'A' },
        label:       { sheetColumn: 'label',       column: 'B' },
        type:        { sheetColumn: 'type',        column: 'C' },
        show_script: { sheetColumn: 'show_script', column: 'D' },
        response:    { sheetColumn: 'response',    column: 'E' },
      }
    },

    BRANCHES: {
      name: 'branches',
      fields: {
        phase:             { sheetColumn: 'phase',             column: 'A' },
        variant_id:        { sheetColumn: 'variant_id',        column: 'B' },
        branch_id:         { sheetColumn: 'branch_id',         column: 'C' },
        parent_branch_id:  { sheetColumn: 'parent_branch_id',  column: 'D' },
        depth:             { sheetColumn: 'depth',             column: 'E' },
        root_question:     { sheetColumn: 'root_question',     column: 'F' },
        branch_label:      { sheetColumn: 'branch_label',      column: 'G' },
        branch_type:       { sheetColumn: 'branch_type',       column: 'H' },
        branch_response:   { sheetColumn: 'branch_response',   column: 'I' },
        next_phase:        { sheetColumn: 'next_phase',        column: 'J' },
        variant_label:     { sheetColumn: 'variant_label',     column: 'K' },
      }
    },

    OFFERS: {
      name: 'Offers',
      fields: {
        id:    { sheetColumn: 'id',    column: 'A' },
        label: { sheetColumn: 'label', column: 'B' },
        text:  { sheetColumn: 'text',  column: 'C' },
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
