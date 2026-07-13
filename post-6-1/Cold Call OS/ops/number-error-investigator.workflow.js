// Number Error Investigator — n8n Workflow SDK source of truth.
// Fired in real time by the Cold Call OS "Number Error" disposition. Rechecks the lead's
// phone with the app's toE164 logic + a lenient extractor: if the stored number is just a
// formatting error it auto-fixes the Leads OS row (upsert by id — never positional); if the
// number is genuinely bad it pings Discord for a human decision (delete / enrich / find another).
// Webhook: POST /webhook/number-error-check
//   JSON body: { lead_id, biz, owner, city, state, icp, caller_name,
//                mobile_phone, corporate_phone, home_phone, phone }
//
// To (re)deploy: validate_workflow -> create_workflow_from_code, then IN THE n8n UI bind the
// Google Sheets cred (googleSheetsOAuth2Api = zOZhujXDtoNhIPm5) on "Auto-fix Phone" and activate.
// The Discord webhook needs no credential.
import { workflow, node, trigger, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const LEADS_DOC = { __rl: true, mode: 'id', value: '14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo', cachedResultName: 'Leads' };
const LEADS_TAB = { __rl: true, mode: 'name', value: 'Leads', cachedResultName: 'Leads' };
const SHEETS_CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const DISCORD = 'https://discord.com/api/webhooks/1490887089812672612/AaHbR7e7xDC6cWp_FDLHXVwDPQy-vFrZSjrz_QwrfYSj7i5RFKFCOvNlXeDLdqfYHhzy';

const hook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Number Error Check', parameters: { httpMethod: 'POST', path: 'number-error-check', options: {} } }
});

const decide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Recheck & Auto-fix',
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
const action=(!strictOK && cleaned) ? "autofix" : "discord";
const stored=fields.filter(p=>String(p[1]||"").trim()).map(p=>p[0]+": "+p[1]).join(" | ") || "(no phone on record)";
const j={
  lead_id:String(b.lead_id||""), biz:String(b.biz||"Unknown"), owner:String(b.owner||""),
  city:String(b.city||""), state:String(b.state||""), icp:String(b.icp||""),
  caller_name:String(b.caller_name||"Unknown"),
  action, cleaned, fix_field:fixField, strict_ok:strictOK, stored_list:stored,
  checked_at:new Date().toISOString(),
};
j.discord_content = "🚫 **Number Error — needs a decision**\\n" +
  j.biz + (j.owner?" ("+j.owner+")":"") + (j.city?" — "+j.city:"") + (j.state?(", "+j.state):"") + (j.icp?" · ICP: "+j.icp:"") + "\\n" +
  "Stored — " + j.stored_list + "\\n" +
  "Flagged by " + j.caller_name + "  ·  Lead id: " + (j.lead_id||"?") + "\\n" +
  "Couldn't auto-fix the number. Decide: 🗑️ delete lead · 🔎 enrich · 🔁 find another.";
return [{ json: j }];
`
    }
  }
});

const isFixable = ifElse({
  version: 2.3,
  config: {
    name: 'Auto-fixable?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'autofix' }],
        combinator: 'and'
      }
    }
  }
});

const autofix = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Auto-fix Phone',
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      authentication: 'oAuth2',
      documentId: LEADS_DOC,
      sheetName: LEADS_TAB,
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['id'],
        value: {
          id: expr('{{ $json.lead_id }}'),
          mobile_phone: expr('{{ $json.cleaned }}'),
          last_agent_action: 'phone auto-fixed (number error)',
          last_agent_at: expr('{{ $json.checked_at }}')
        },
        schema: [
          { id: 'id', displayName: 'id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'mobile_phone', displayName: 'mobile_phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_agent_action', displayName: 'last_agent_action', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_agent_at', displayName: 'last_agent_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
        ]
      },
      options: {}
    },
    credentials: SHEETS_CRED
  }
});

const pingDiscord = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Discord — Decide',
    parameters: {
      method: 'POST',
      url: DISCORD,
      authentication: 'none',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: $json.discord_content }) }}')
    }
  }
});

export default workflow('number-error-investigator', 'Number Error Investigator')
  .add(hook)
  .to(decide)
  .to(isFixable
    .onTrue(autofix)
    .onFalse(pingDiscord));
