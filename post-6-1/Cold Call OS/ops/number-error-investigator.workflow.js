// Number Error Investigator — n8n Workflow SDK source of truth.
// Fired in real time by the Cold Call OS "Number Error" disposition. Rechecks the lead's
// phone with the app's toE164 logic + a lenient extractor: if the stored number is just a
// formatting error it auto-fixes the Leads OS row (upsert by id — never positional); if the
// number is genuinely bad the lead is handed to the Orphan Lead workflow, which copies it to
// the Harmonia Orphans sheet, removes it from Leads OS, and posts its own Discord notice.
// Webhook: POST /webhook/number-error-check
//   JSON body: { lead_id, biz, owner, city, state, icp, caller_name,
//                mobile_phone, corporate_phone, home_phone, phone }
//
// A formatting-only typo must never cost a lead — that is why only the un-fixable branch
// orphans. (Leads were once mass-tagged Number Error purely because the sheet stored phones
// human-formatted; see the E.164 normalisation work.)
//
// To (re)deploy: validate_workflow -> create_workflow_from_code, then publish_workflow.
import { workflow, node, trigger, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const LEADS_DOC = { __rl: true, mode: 'id', value: '14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo', cachedResultName: 'Leads' };
const LEADS_TAB = { __rl: true, mode: 'name', value: 'Leads', cachedResultName: 'Leads' };
const SHEETS_CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const ORPHAN_WEBHOOK = 'https://infoharmonia.app.n8n.cloud/webhook/orphan-lead';

const hook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Number Error Check', position: [0, 96], parameters: { httpMethod: 'POST', path: 'number-error-check', options: {} } },
  output: [{ body: { lead_id: '339', biz: 'Topics Salon', mobile_phone: '(215) 555-0177 ext. 4' } }]
});

const decide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Recheck & Auto-fix',
    position: [224, 96],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const b = ($input.first().json.body) || $input.first().json;
function toE164(raw){
  if(!raw) return "";
  const s=String(raw).trim();
  const d=s.replace(/\\D/g,"");
  let core="";
  if(d.length===11 && d[0]==="1") core=d.slice(1);
  else if(d.length===10) core=d;
  else if(s.startsWith("+") && d.length>=11 && d.length<=15) return "+"+d;
  else return "";
  if(!/^[2-9]\\d{2}[2-9]\\d{6}$/.test(core)) return "";
  return "+1"+core;
}
function extract(raw){
  const d=String(raw||"").replace(/\\D/g,"");
  if(!d) return "";
  if(d.length===11 && d[0]==="1"){ const c=d.slice(1); if(/^[2-9]\\d{2}[2-9]\\d{6}$/.test(c)) return "+1"+c; }
  for(let i=0;i+10<=d.length;i++){ const c=d.slice(i,i+10); if(/^[2-9]\\d{2}[2-9]\\d{6}$/.test(c)) return "+1"+c; }
  return "";
}
const fields=[["mobile_phone",b.mobile_phone],["corporate_phone",b.corporate_phone],["home_phone",b.home_phone],["phone",b.phone]];
let strictOK=false;
for(const pair of fields){ if(toE164(pair[1])){ strictOK=true; break; } }
let cleaned="", fixField="";
if(!strictOK){ for(const pair of fields){ const e=extract(pair[1]); if(e){ cleaned=e; fixField=pair[0]; break; } } }
const action=(!strictOK && cleaned) ? "autofix" : "orphan";
const stored=fields.filter(p=>String(p[1]||"").trim()).map(p=>p[0]+": "+p[1]).join(" | ") || "(no phone on record)";
const j={
  lead_id:String(b.lead_id||""), biz:String(b.biz||"Unknown"), owner:String(b.owner||""),
  city:String(b.city||""), state:String(b.state||""), icp:String(b.icp||""),
  caller_name:String(b.caller_name||"Unknown"),
  action, cleaned, fix_field:fixField, strict_ok:strictOK, stored_list:stored,
  checked_at:new Date().toISOString(),
};
return [{ json: j }];
`
    }
  },
  output: [{ lead_id: '339', action: 'autofix', cleaned: '+12155550177', fix_field: 'mobile_phone', stored_list: 'mobile_phone: (215) 555-0177 ext. 4', checked_at: '2026-07-15T19:12:04.478Z', biz: 'Topics Salon', caller_name: 'Javi' }]
});

const isFixable = ifElse({
  version: 2.3,
  config: {
    name: 'Auto-fixable?',
    position: [448, 96],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'autofix' }],
        combinator: 'and'
      }
    }
  }
});

// Writes back to the field the number was recovered FROM. home_phone/phone are not Leads
// columns, so anything outside the real phone columns is folded into mobile_phone rather than
// silently creating a junk column via handlingExtraData.
const buildFixRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Fix Row',
    position: [672, -32],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const j = $input.first().json;
if (!j.lead_id || !j.fix_field || !j.cleaned) return [];
const ALLOWED = ['mobile_phone', 'corporate_phone'];
const field = ALLOWED.indexOf(j.fix_field) !== -1 ? j.fix_field : 'mobile_phone';
const row = {
  id: j.lead_id,
  last_agent_action: 'phone auto-fixed (number error)',
  last_agent_at: j.checked_at,
};
row[field] = j.cleaned;
return [{ json: row }];
`
    }
  },
  output: [{ id: '339', last_agent_action: 'phone auto-fixed (number error)', last_agent_at: '2026-07-15T19:12:04.478Z', mobile_phone: '+12155550177' }]
});

// cellFormat RAW is required: USER_ENTERED strips the leading "+" off an E.164 number.
// The schema must be populated — with an empty schema the id match silently fails and every
// "fix" APPENDS a duplicate lead row instead of updating in place.
const autofix = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Auto-fix Phone',
    position: [672, 0],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      authentication: 'oAuth2',
      documentId: LEADS_DOC,
      sheetName: LEADS_TAB,
      columns: {
        mappingMode: 'autoMapInputData',
        matchingColumns: ['id'],
        value: {},
        schema: [
          { id: 'id', displayName: 'id', required: false, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'mobile_phone', displayName: 'mobile_phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'corporate_phone', displayName: 'corporate_phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_agent_action', displayName: 'last_agent_action', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_agent_at', displayName: 'last_agent_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
        ]
      },
      options: { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' }
    },
    credentials: SHEETS_CRED
  },
  output: [{ id: '339', mobile_phone: '+12155550177' }]
});

const sendToOrphan = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send To Orphan',
    position: [672, 192],
    parameters: {
      method: 'POST',
      url: ORPHAN_WEBHOOK,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ lead_id: $json.lead_id, reason: 'number_error', detail: 'Stored — ' + $json.stored_list, caller_name: $json.caller_name, biz: $json.biz }) }}")
    }
  },
  output: [{ message: 'Workflow was started' }]
});

export default workflow('number-error-investigator', 'Number Error Investigator')
  .add(hook)
  .to(decide)
  .to(isFixable
    .onTrue(buildFixRow.to(autofix))
    .onFalse(sendToOrphan));
