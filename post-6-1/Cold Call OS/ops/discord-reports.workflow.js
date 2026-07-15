// Cold Call OS — Discord Reports — n8n Workflow SDK source of truth.
// Deployed as n8n workflow RZlWmvas32akt6E1 (ACTIVE) on infoharmonia.app.n8n.cloud.
// To redeploy: validate_workflow -> create_workflow_from_code (projectId bLhA9R3zS6aIvjH1),
// then re-run the go-live steps in README.md. Two things this file CANNOT carry, both verified
// the hard way: newCredential() does NOT bind on deploy (bind via update_workflow
// setNodeCredential), and settings.timezone is ignored by the SDK (set via setWorkflowSettings).
//
// Three chains on one canvas:
//   A) Milestone  — every 30 min in calling hours; Discord-posts once per (caller, day) when
//                   any caller clears 100 dials, with stats + a prefilled retro form link.
//                   Idempotent via the coldcall_milestones data table (claim BEFORE posting).
//   B) Memo       — 8:00 PM ET daily; who called, how many, what came of it. Silent on 0 calls,
//                   LOUD on 0 rows read (that means the read broke, not that nobody called).
//   C) Retro form — /form/call-retro?caller=X&day=Y -> Retro tab on the Caller Settings sheet.
//
// NAMING TRAP — do not "tidy" caller_name back to caller. n8n rejects the identifier `caller`
// (it shadows Function.prototype.caller): {{ $json.caller }} throws "Cannot access caller due to
// security concerns", and a resourceMapper key named caller silently writes an EMPTY cell.
// The query param stays ?caller= (only Code reads it, which is unaffected).
//
// Reads the history tab; writes nothing to the Leads sheet (keeps the integrity canary clean).
import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const LEADS_DOC = { __rl: true, mode: 'id', value: '14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo', cachedResultName: 'Harmonia Leads OS' };
const HISTORY = { __rl: true, mode: 'name', value: 'history', cachedResultName: 'history' };
const SETTINGS_DOC = { __rl: true, mode: 'id', value: '1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc', cachedResultName: 'Cold Call OS — Caller Settings' };
const RETRO_TAB = { __rl: true, mode: 'name', value: 'Retro', cachedResultName: 'Retro' };
const MILESTONES = { __rl: true, mode: 'id', value: 'CofaZZ6O1eAr1J1s', cachedResultName: 'coldcall_milestones' };
const CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const DISCORD = 'https://discord.com/api/webhooks/1490887089812672612/AaHbR7e7xDC6cWp_FDLHXVwDPQy-vFrZSjrz_QwrfYSj7i5RFKFCOvNlXeDLdqfYHhzy';

const READ_OPTS = {
  dataLocationOnSheet: { values: { rangeDefinition: 'detectAutomatically', readRowsUntil: 'lastRowInSheet' } },
  outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'FORMATTED_STRING' } },
  returnAllMatches: 'returnAllMatches'
};
const READ_HISTORY_PARAMS = { resource: 'sheet', operation: 'read', authentication: 'oAuth2', documentId: LEADS_DOC, sheetName: HISTORY, options: READ_OPTS };
const SAMPLE_ROW = [{ 'Caller Name': '=Javi', Disposition: '=no_answer', Timestamp: '2026-07-13T16:04:11.021Z' }];

const milestonePoll = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Milestone Poll', position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 0,30 11-20 * * 1-5' }] } } },
  output: [{}]
});

const readPoll = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Read history (poll)', position: [220, 0], parameters: READ_HISTORY_PARAMS, credentials: CRED },
  output: SAMPLE_ROW
});

const tally = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Tally & Compose',
    position: [440, 0],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const ROSTER = ['Javi', 'Julian', 'Owen', 'Joel', 'Nick', 'Blake', 'RJ', 'Reese'];
const TARGET = 100;
const FORM = 'https://infoharmonia.app.n8n.cloud/form/call-retro';
const MAXLEN = 1900;
const ET = 'America/New_York';

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });
function etDay(iso) {
  const t = Date.parse(iso || '');
  if (!isFinite(t)) return null;
  const p = {};
  const parts = dayFmt.formatToParts(new Date(t));
  for (let i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
  return p.year + '-' + p.month + '-' + p.day;
}
function clean(v) {
  const s = String(v == null ? '' : v).trim();
  return (s.charAt(0) === '=' ? s.slice(1) : s).trim();
}
function pretty(slug) { return String(slug).split('_').join(' '); }
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function breakdown(counts, limit) {
  const pairs = Object.keys(counts).map(function (k) { return [k, counts[k]]; });
  pairs.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
  const head = pairs.slice(0, limit).map(function (p) { return pretty(p[0]) + ' ' + p[1]; });
  const tailN = pairs.slice(limit).reduce(function (s, p) { return s + p[1]; }, 0);
  if (tailN) head.push('+' + tailN + ' more');
  return head.join(' · ');
}
function clamp(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const nl = cut.lastIndexOf('\\n');
  if (nl > max * 0.6) cut = cut.slice(0, nl);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut + '\\n…';
}

const rows = $input.all().map(function (x) { return x.json; });
const today = etDay(new Date().toISOString());

const byCaller = {};
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const day = etDay(r['Timestamp']);
  if (!day) continue;
  const caller = clean(r['Caller Name']);
  if (!caller) continue;
  const disp = clean(r['Disposition']) || 'unknown';
  if (!byCaller[caller]) byCaller[caller] = {};
  if (!byCaller[caller][day]) byCaller[caller][day] = { n: 0, disp: {} };
  const b = byCaller[caller][day];
  b.n++;
  b.disp[disp] = (b.disp[disp] || 0) + 1;
}

const out = [];
const callers = Object.keys(byCaller);
for (let c = 0; c < callers.length; c++) {
  const caller = callers[c];
  const t = byCaller[caller][today];
  if (!t || t.n < TARGET) continue;

  const total = t.n;

  const priorDays = Object.keys(byCaller[caller]).filter(function (d) { return d < today; });
  const base = { n: 0, disp: {} };
  for (let i = 0; i < priorDays.length; i++) {
    const b = byCaller[caller][priorDays[i]];
    base.n += b.n;
    const ks = Object.keys(b.disp);
    for (let j = 0; j < ks.length; j++) base.disp[ks[j]] = (base.disp[ks[j]] || 0) + b.disp[ks[j]];
  }

  let deviation = '';
  if (priorDays.length >= 3 && base.n >= 50) {
    let best = null;
    const ks = Object.keys(t.disp);
    for (let j = 0; j < ks.length; j++) {
      const k = ks[j];
      const tn = t.disp[k] || 0;
      const bn = base.disp[k] || 0;
      if (tn < 5 || bn < 5) continue;
      const d = pct(tn, total) - pct(bn, base.n);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { k: k, d: d, tp: pct(tn, total), bp: pct(bn, base.n) };
    }
    if (best && Math.abs(best.d) >= 5) {
      deviation = '🔎 ' + pretty(best.k) + ' ran ' + best.tp + '% today vs ' + best.bp + '% across your last ' + priorDays.length + ' days (' + (best.d > 0 ? '+' : '') + Math.round(best.d) + ' pts)';
    }
  } else {
    deviation = '🔎 First tracked 100-day — no baseline to compare against yet.';
  }

  const link = FORM + '?caller=' + encodeURIComponent(caller) + '&day=' + encodeURIComponent(today);
  const lines = [];
  lines.push('🏆 **' + caller + ' cleared ' + TARGET + ' calls today** — ' + total + ' dials');
  if (ROSTER.indexOf(caller) < 0) lines.push('⚠️ Not on the caller roster — new hire, or a data bug worth a look.');
  lines.push('');
  lines.push('📊 ' + breakdown(t.disp, 8));
  if (deviation) lines.push(deviation);
  lines.push('');
  lines.push('🧠 **Retro — 2 min, while it is fresh**');
  lines.push('What should change in the script? · Biggest lever tomorrow — leads, script, timing or offer? · What worked that we should do more of?');
  lines.push('→ ' + link);

  out.push({ json: { caller_name: caller, day: today, calls: total, alertText: clamp(lines.join('\\n'), MAXLEN) } });
}

return out;
` }
  },
  output: [{ caller: 'Javi', day: '2026-07-13', calls: 104, alertText: '🏆 **Javi cleared 100 calls today** — 104 dials' }]
});

const notAnnounced = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Not Yet Announced',
    position: [660, 0],
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: MILESTONES,
      matchType: 'allConditions',
      filters: {
        conditions: [
          { keyName: 'caller_name', condition: 'eq', keyValue: expr('{{ $json.caller_name }}') },
          { keyName: 'day', condition: 'eq', keyValue: expr('{{ $json.day }}') }
        ]
      }
    }
  },
  output: [{ caller: 'Javi', day: '2026-07-13', calls: 104, alertText: '🏆 **Javi cleared 100 calls today** — 104 dials' }]
});

const claim = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Claim Milestone',
    position: [880, 0],
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: MILESTONES,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          caller_name: expr("{{ $('Tally & Compose').item.json.caller_name }}"),
          day: expr("{{ $('Tally & Compose').item.json.day }}"),
          calls: expr("{{ $('Tally & Compose').item.json.calls }}"),
          announced_at: expr('{{ $now.toISO() }}')
        },
        schema: [
          { id: 'caller_name', displayName: 'caller_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'day', displayName: 'day', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'calls', displayName: 'calls', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'announced_at', displayName: 'announced_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      }
    }
  },
  output: [{ id: 1, caller: 'Javi', day: '2026-07-13' }]
});

const discordMilestone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord — Milestone',
    position: [1100, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ content: $('Tally & Compose').item.json.alertText }) }}")
    }
  },
  output: [{}]
});

const memoCron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Memo 8pm ET', position: [0, 220], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 0 20 * * *' }] } } },
  output: [{}]
});

const readMemo = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Read history (memo)', position: [220, 220], parameters: READ_HISTORY_PARAMS, credentials: CRED },
  output: SAMPLE_ROW
});

const composeMemo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Compose Memo',
    position: [440, 220],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const MAXLEN = 1900;
const ET = 'America/New_York';

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });
const niceFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' });
function etDay(iso) {
  const t = Date.parse(iso || '');
  if (!isFinite(t)) return null;
  const p = {};
  const parts = dayFmt.formatToParts(new Date(t));
  for (let i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
  return p.year + '-' + p.month + '-' + p.day;
}
function clean(v) {
  const s = String(v == null ? '' : v).trim();
  return (s.charAt(0) === '=' ? s.slice(1) : s).trim();
}
function pretty(slug) { return String(slug).split('_').join(' '); }
function breakdown(counts, limit) {
  const pairs = Object.keys(counts).map(function (k) { return [k, counts[k]]; });
  pairs.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
  const head = pairs.slice(0, limit).map(function (p) { return pretty(p[0]) + ' ' + p[1]; });
  const tailN = pairs.slice(limit).reduce(function (s, p) { return s + p[1]; }, 0);
  if (tailN) head.push('+' + tailN + ' more');
  return head.join(' · ');
}
function clamp(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const nl = cut.lastIndexOf('\\n');
  if (nl > max * 0.6) cut = cut.slice(0, nl);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut + '\\n…';
}

const rows = $input.all().map(function (x) { return x.json; });
if (!rows.length) {
  return [{ json: { alertText: '🚨 **Cold Call OS memo**: the history tab read returned 0 rows. That sheet has ~500 rows — this is a read/permission failure, not a quiet day.' } }];
}

const now = new Date();
const today = etDay(now.toISOString());

const perCaller = {};
const dispAll = {};
let total = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (etDay(r['Timestamp']) !== today) continue;
  const caller = clean(r['Caller Name']) || '(unattributed)';
  const disp = clean(r['Disposition']) || 'unknown';
  if (!perCaller[caller]) perCaller[caller] = { n: 0, disp: {} };
  perCaller[caller].n++;
  perCaller[caller].disp[disp] = (perCaller[caller].disp[disp] || 0) + 1;
  dispAll[disp] = (dispAll[disp] || 0) + 1;
  total++;
}

if (!total) return [];

const names = Object.keys(perCaller).sort(function (a, b) { return perCaller[b].n - perCaller[a].n || a.localeCompare(b); });

const lines = [];
lines.push('📋 **End of day — ' + niceFmt.format(now) + '** — ' + total + ' dials');
lines.push('');
lines.push('**Who called**');
for (let i = 0; i < names.length; i++) {
  const c = perCaller[names[i]];
  lines.push('• ' + names[i] + ' — ' + c.n + ' (' + breakdown(c.disp, 4) + ')');
}
lines.push('');
lines.push('**Team results**');
lines.push(breakdown(dispAll, 10));

return [{ json: { calls: total, callers: names.length, alertText: clamp(lines.join('\\n'), MAXLEN) } }];
` }
  },
  output: [{ calls: 66, callers: 3, alertText: '📋 **End of day — Tue, Jun 9**' }]
});

const discordMemo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord — Memo',
    position: [660, 220],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: $json.alertText }) }}')
    }
  },
  output: [{}]
});

const retroForm = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Retro Form',
    position: [0, 440],
    parameters: {
      authentication: 'none',
      formTitle: 'Cold Call Retro',
      formDescription: 'You just cleared 100 dials. Two minutes now, while it is fresh, is worth more than an hour next week.',
      formFields: {
        values: [
          { fieldName: 'caller', fieldType: 'hiddenField' },
          { fieldName: 'day', fieldType: 'hiddenField' },
          {
            fieldName: 'script_edit',
            fieldLabel: 'What should change in the script?',
            fieldType: 'textarea',
            placeholder: 'Be specific — the line that kept dying, the objection you had no answer for, the thing you started improvising because the script did not cover it.',
            requiredField: false
          },
          {
            fieldName: 'biggest_lever',
            fieldLabel: 'Biggest lever tomorrow',
            fieldType: 'radio',
            fieldOptions: {
              values: [
                { option: 'Leads — the list is the problem' },
                { option: 'Script — what I say is the problem' },
                { option: 'Timing — when I call is the problem' },
                { option: 'Offer — what I am selling is the problem' },
                { option: 'Something else' }
              ]
            },
            requiredField: true
          },
          { fieldName: 'what_worked', fieldLabel: 'What worked — do more of this?', fieldType: 'textarea', requiredField: false }
        ]
      },
      responseMode: 'onReceived',
      options: {
        path: 'call-retro',
        ignoreBots: false,
        buttonLabel: 'Log it',
        respondWithOptions: { values: { respondWith: 'text', formSubmittedText: 'Logged. Go get some rest.' } }
      }
    }
  },
  output: [{ caller: 'Javi', day: '2026-07-13', submittedAt: '2026-07-13T23:11:02.000Z' }]
});

const normalizeRetro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Retro',
    position: [220, 440],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const j = $input.first().json;
function pick() {
  for (let i = 0; i < arguments.length; i++) {
    const k = arguments[i];
    if (j[k] != null && String(j[k]).trim() !== '') return String(j[k]).trim();
  }
  return '';
}
const caller = pick('caller', 'Caller');
const day = pick('day', 'Day');
if (!caller || !day) return [];
return [{
  json: {
    submitted_at: j.submittedAt || new Date().toISOString(),
    caller_name: caller,
    day: day,
    script_edit: pick('script_edit', 'What should change in the script?'),
    biggest_lever: pick('biggest_lever', 'Biggest lever tomorrow'),
    what_worked: pick('what_worked', 'What worked — do more of this?')
  }
}];
` }
  },
  output: [{ submitted_at: '2026-07-13T23:11:02.000Z', caller: 'Javi', day: '2026-07-13', script_edit: '', biggest_lever: 'Leads — the list is the problem', what_worked: '' }]
});

const saveRetro = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Retro',
    position: [440, 440],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      authentication: 'oAuth2',
      documentId: SETTINGS_DOC,
      sheetName: RETRO_TAB,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          submitted_at: expr('{{ $json.submitted_at }}'),
          caller_name: expr('{{ $json.caller_name }}'),
          day: expr('{{ $json.day }}'),
          script_edit: expr('{{ $json.script_edit }}'),
          biggest_lever: expr('{{ $json.biggest_lever }}'),
          what_worked: expr('{{ $json.what_worked }}')
        },
        schema: [
          { id: 'submitted_at', displayName: 'submitted_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'caller_name', displayName: 'caller_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'day', displayName: 'day', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'script_edit', displayName: 'script_edit', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'biggest_lever', displayName: 'biggest_lever', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'what_worked', displayName: 'what_worked', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: { cellFormat: 'RAW' }
    },
    credentials: CRED
  },
  output: [{ submitted_at: '2026-07-13T23:11:02.000Z', caller: 'Javi' }]
});

export default workflow('coldcall-discord-reports', 'Cold Call OS — Discord Reports')
  .add(milestonePoll)
  .to(readPoll)
  .to(tally)
  .to(notAnnounced)
  .to(claim)
  .to(discordMilestone)
  .add(memoCron)
  .to(readMemo)
  .to(composeMemo)
  .to(discordMemo)
  .add(retroForm)
  .to(normalizeRetro)
  .to(saveRetro);
