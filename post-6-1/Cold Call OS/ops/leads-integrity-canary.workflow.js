// Leads Integrity Canary (daily) — n8n Workflow SDK source of truth.
// Deployed as n8n workflow 3IsmFxwlaOGMqDwh (ACTIVE, daily 7:00am) on infoharmonia.app.n8n.cloud.
// To redeploy: validate_workflow -> create_workflow_from_code, then bind the Google Sheets
// cred (googleSheetsOAuth2Api = zOZhujXDtoNhIPm5) on the read node via update_workflow setNodeCredential.
//
// What it does: reads the whole Leads sheet daily and Discord-alerts ONLY when it detects a
// data-integrity problem — the column-shift signature (a cell equal to its header word),
// duplicate ids, or a website-vs-biz shift run. Silent when the sheet is healthy.
import { workflow, node, trigger, newCredential } from '@n8n/workflow-sdk';

const DOC = { __rl: true, mode: 'id', value: '14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo', cachedResultName: 'Leads' };
const SHEET = { __rl: true, mode: 'name', value: 'Leads', cachedResultName: 'Leads' };
const CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const DISCORD = 'https://discord.com/api/webhooks/1490887089812672612/AaHbR7e7xDC6cWp_FDLHXVwDPQy-vFrZSjrz_QwrfYSj7i5RFKFCOvNlXeDLdqfYHhzy';

const start = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Daily 7am', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 0 }] } } }
});

const read = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Leads (all)',
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'oAuth2',
      documentId: DOC,
      sheetName: SHEET,
      options: {
        dataLocationOnSheet: { values: { rangeDefinition: 'detectAutomatically', readRowsUntil: 'lastRowInSheet' } },
        outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'FORMATTED_STRING' } },
        returnAllMatches: 'returnAllMatches'
      }
    },
    credentials: CRED
  }
});

const checks = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Integrity Checks',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const rows = $input.all().map(x => x.json);
if (!rows.length) return [{ json: { ok:false, rows:0, alertText:'🚨 Leads integrity canary: read returned 0 rows.' } }];
const issues = [];
const keys = Object.keys(rows[0]).filter(k => k !== 'row_number');

// 1) HEADER-IN-CELL: the exact signature of the 2026-06 column-block shift (a cell literally equals its header, e.g. owner="owner")
const hw = [];
for (const r of rows) {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() === k.toLowerCase()) { hw.push((r.row_number ? 'row'+r.row_number : 'id'+r.id) + ':' + k); }
  }
  if (hw.length > 25) break;
}
if (hw.length) issues.push('HEADER-IN-CELL (column-shift signature): ' + hw.length + ' cell(s) — e.g. ' + hw.slice(0,6).join(', '));

// 2) DUPLICATE ids
const seen = {}; const dupes = [];
for (const r of rows) { const id = String(r.id==null?'':r.id).trim(); if(!id) continue; if(seen[id]){ if(dupes.length<12) dupes.push(id); } else seen[id]=1; }
if (dupes.length) issues.push('DUPLICATE ids: ' + dupes.length + '+ — e.g. ' + dupes.slice(0,6).join(', '));

// 3) WEBSITE-vs-BIZ shift run: owner/contact columns drifted one row relative to biz_name
function toks(s){ const m=String(s==null?'':s).toLowerCase().match(/[a-z]{4,}/g)||[]; const STOP=new Set(['salon','spa','hair','studio','beauty','the','and','llc','inc','shop','barber','nail','nails','wellness','group','aesthetics','medspa','company','salons']); return m.filter(t=>!STOP.has(t)); }
function dom(u){ const m=String(u==null?'':u).toLowerCase().match(/https?:\\/\\/([^\\/]+)/); return m?m[1].replace(/^www\\./,''):''; }
function hit(bt,d){ if(!bt.length||!d) return false; for(const t of bt){ if(d.indexOf(t)>=0) return true; } return false; }
let run=0, worst=0, worstAt=null, cur=null;
for (let i=0;i<rows.length-1;i++){
  const bt=toks(rows[i].biz_name), own=dom(rows[i].website), nxt=dom(rows[i+1].website);
  if (!hit(bt,own) && hit(bt,nxt)) { if(run===0) cur=(rows[i].row_number||rows[i].id); run++; if(run>worst){worst=run;worstAt=cur;} }
  else run=0;
}
if (worst >= 5) issues.push('WEBSITE-SHIFT run of ' + worst + ' rows near ' + worstAt + ' — owner/contact columns may be shifted one row vs biz_name');

if (!issues.length) return [];
const alertText = '🚨 **Leads sheet integrity alert** (' + rows.length + ' rows scanned)\\n• ' + issues.join('\\n• ') + '\\n\\nLikely a positional write slipped a row. Repair by realigning on \\\`id\\\` (backup first).';
return [{ json: { ok:false, rows: rows.length, issues, alertText } }];
`
    }
  }
});

const alert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord Alert',
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ content: $json.alertText }) }}"
    }
  }
});

export default workflow('leads-integrity-canary', 'Leads Integrity Canary (daily)')
  .add(start)
  .to(read)
  .to(checks)
  .to(alert);
