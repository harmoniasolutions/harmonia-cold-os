// Orphan Lead — n8n Workflow SDK source of truth.
// Moves a lead OUT of the Leads OS and into the standalone "Harmonia Orphans" spreadsheet.
// Fired by the Cold Call OS "Wrong ICP" disposition (directly) and by the Number Error
// Investigator (only when a bad phone could NOT be auto-fixed).
// Webhook: POST /webhook/orphan-lead
//   JSON body: { lead_id, reason ("wrong_icp" | "number_error"), detail, caller_name, biz }
//
// Order matters: the row is COPIED to Orphans before it is deleted from Leads, so a failure
// mid-flow can only ever duplicate a lead, never lose one.
//
// Deleting is the one unavoidably positional write against a sheet with a history of
// positional corruption (2026-06-19, 232 leads shifted). "Verify Row Id" re-reads the single
// cell A{row_number} immediately before the delete and aborts if the id no longer matches —
// so a concurrent insert/delete that shifts rows between lookup and delete can never take out
// the wrong lead. A missing lead_id simply matches no row, the chain stops, and nothing is
// appended or deleted (the guard "Lead Tag Save" lacks, which appends blank-id junk rows).
//
// To (re)deploy: validate_workflow -> create_workflow_from_code, then publish_workflow.
import { workflow, node, trigger, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const LEADS_ID = '14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo';
const LEADS_DOC = { __rl: true, mode: 'id', value: LEADS_ID, cachedResultName: 'Harmonia Leads OS' };
const LEADS_TAB = { __rl: true, mode: 'name', value: 'Leads', cachedResultName: 'Leads' };
const ORPHANS_DOC = { __rl: true, mode: 'id', value: '1MX4oIg0ORi_owQn2pVCTaecd2jliwsfhWyoAMVsY0KM', cachedResultName: 'Harmonia Orphans' };
const ORPHANS_TAB = { __rl: true, mode: 'name', value: 'Orphans', cachedResultName: 'Orphans' };
const SHEETS_CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const DISCORD = 'https://discord.com/api/webhooks/1490887089812672612/AaHbR7e7xDC6cWp_FDLHXVwDPQy-vFrZSjrz_QwrfYSj7i5RFKFCOvNlXeDLdqfYHhzy';

const hook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Orphan Lead',
    position: [0, 0],
    parameters: { httpMethod: 'POST', path: 'orphan-lead', options: {} }
  },
  output: [{ body: { lead_id: '339', reason: 'wrong_icp', detail: '', caller_name: 'Javi', biz: 'Topics Salon' } }]
});

const findRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Find Lead Row',
    position: [220, 0],
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'oAuth2',
      documentId: LEADS_DOC,
      sheetName: LEADS_TAB,
      filtersUI: { values: [{ lookupColumn: 'id', lookupValue: expr('{{ $json.body.lead_id }}') }] },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' }
    },
    credentials: SHEETS_CRED
  },
  output: [{ row_number: 42, id: '339', biz_name: 'Topics Salon', icp: 'hair_salon', mobile_phone: '+12155550143' }]
});

const buildRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Orphan Row',
    position: [440, 0],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const hookBody = ($('Orphan Lead').first().json.body) || {};
const src = $input.first().json;
const row = {};
for (const key of Object.keys(src)) {
  if (key === 'row_number') continue;
  row[key] = src[key];
}
row.orphan_reason = String(hookBody.reason || '');
row.orphan_detail = String(hookBody.detail || '');
row.orphaned_by = String(hookBody.caller_name || 'Unknown');
row.orphaned_at = new Date().toISOString();
return [{ json: row }];
`
    }
  },
  output: [{ id: '339', biz_name: 'Topics Salon', orphan_reason: 'wrong_icp', orphaned_by: 'Javi', orphaned_at: '2026-07-15T19:00:00.000Z' }]
});

const copyToOrphans = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Copy To Orphans',
    position: [660, 0],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      authentication: 'oAuth2',
      documentId: ORPHANS_DOC,
      sheetName: ORPHANS_TAB,
      columns: { mappingMode: 'autoMapInputData', value: {}, schema: [] },
      options: { cellFormat: 'RAW', handlingExtraData: 'insertInNewColumn' }
    },
    credentials: SHEETS_CRED
  },
  output: [{ id: '339', biz_name: 'Topics Salon', orphan_reason: 'wrong_icp' }]
});

const rereadCell = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Re-read Id Cell',
    position: [880, 0],
    parameters: {
      method: 'GET',
      url: expr('https://sheets.googleapis.com/v4/spreadsheets/' + LEADS_ID + '/values/Leads!A{{ $("Find Lead Row").first().json.row_number }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {}
    },
    credentials: SHEETS_CRED
  },
  output: [{ range: 'Leads!A42', majorDimension: 'ROWS', values: [['339']] }]
});

const verifyRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Verify Row Id',
    position: [1100, 0],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const hookBody = ($('Orphan Lead').first().json.body) || {};
const found = $('Find Lead Row').first().json;
const res = $input.first().json;
const cell = (res && res.values && res.values[0] && res.values[0][0] != null) ? String(res.values[0][0]) : '';
const leadId = String(hookBody.lead_id || '');
const rowNumber = Number(found.row_number);
const match = cell !== '' && cell === leadId;
const REASON_LABEL = { wrong_icp: 'Wrong ICP', number_error: 'Number Error (un-fixable)' };
const reason = String(hookBody.reason || '');
const label = REASON_LABEL[reason] || reason || 'unknown reason';
const biz = String(hookBody.biz || found.biz_name || 'Unknown');
const who = String(hookBody.caller_name || 'Unknown');
const out = { match, row_number: rowNumber, lead_id: leadId, biz, reason, label, cell_value: cell };
out.discord_ok = '🗂️ **Lead orphaned — ' + label + '**\\n' +
  biz + '  ·  Lead id: ' + leadId + '\\n' +
  'Flagged by ' + who + '. Copied to the Harmonia Orphans sheet and removed from Leads OS.';
out.discord_abort = '⚠️ **Orphan delete ABORTED — row moved**\\n' +
  biz + '  ·  Lead id: ' + leadId + '\\n' +
  'Row ' + rowNumber + ' now holds id "' + cell + '". The lead was copied to Orphans but NOT deleted ' +
  'from Leads OS (deleting would have hit the wrong row). Remove it by hand.';
return [{ json: out }];
`
    }
  },
  output: [{ match: true, row_number: 42, lead_id: '339', biz: 'Topics Salon', reason: 'wrong_icp', label: 'Wrong ICP', cell_value: '339', discord_ok: 'ok', discord_abort: 'abort' }]
});

const stillMatches = ifElse({
  version: 2.3,
  config: {
    name: 'Id Still Matches?',
    position: [1320, 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.match }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const deleteRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Delete From Leads',
    position: [1540, -100],
    parameters: {
      resource: 'sheet',
      operation: 'delete',
      authentication: 'oAuth2',
      documentId: LEADS_DOC,
      sheetName: LEADS_TAB,
      toDelete: 'rows',
      startIndex: expr('{{ $json.row_number }}'),
      numberToDelete: 1
    },
    credentials: SHEETS_CRED
  },
  output: [{ success: true }]
});

const notifyOk = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord — Orphaned',
    position: [1760, -100],
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: $("Verify Row Id").first().json.discord_ok }) }}')
    }
  },
  output: [{ ok: true }]
});

const notifyAbort = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord — Delete Aborted',
    position: [1540, 120],
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: $json.discord_abort }) }}')
    }
  },
  output: [{ ok: true }]
});

export default workflow('orphan-lead', 'Orphan Lead')
  .add(hook)
  .to(findRow)
  .to(buildRow)
  .to(copyToOrphans)
  .to(rereadCell)
  .to(verifyRow)
  .to(stillMatches
    .onTrue(deleteRow.to(notifyOk))
    .onFalse(notifyAbort));
