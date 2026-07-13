// Recording Upload — n8n Workflow SDK source of truth.
// Receives a base64 MP3 from the Cold Call OS "Recording" tab, stores it in a shared
// Google Drive folder, and logs a row to the Recordings tab of the Caller Settings sheet.
// Webhook: POST /webhook/recording-upload
//   JSON body: { filename, mime, data_b64, title, notes, caller_name, visibility }
//
// To (re)deploy: validate_workflow -> create_workflow_from_code, then IN THE n8n UI (MCP
// cannot bind credentials or resolve Drive folders):
//   1) bind the Google Drive cred on "Upload to Drive"
//   2) bind the Google Sheets cred (googleSheetsOAuth2Api = zOZhujXDtoNhIPm5) on "Log to Recordings"
//   3) set "Upload to Drive" > Folder to the shared "Cold Call Recordings" folder
//      (replace the PASTE_… placeholder folder id below or pick it in the UI)
//   4) activate the workflow.
// Manual prep (once): create the Drive folder shared "Anyone with the link -> Viewer" (so
//   files inside inherit link-viewability for inline <audio> playback), and add a "Recordings"
//   tab to sheet 1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc with the header row:
//     id | title | caller_name | visibility | drive_file_id | drive_link | mime | uploaded_at | notes
import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const SETTINGS_DOC = { __rl: true, mode: 'id', value: '1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc', cachedResultName: 'Harmonia Caller Settings' };
const REC_TAB = { __rl: true, mode: 'name', value: 'Recordings', cachedResultName: 'Recordings' };
const REC_FOLDER = { __rl: true, mode: 'id', value: 'PASTE_COLD_CALL_RECORDINGS_FOLDER_ID', cachedResultName: 'Cold Call Recordings' };
const SHEETS_CRED = { googleSheetsOAuth2Api: newCredential('Google Sheets account', 'zOZhujXDtoNhIPm5') };
const DRIVE_CRED = { googleDriveOAuth2Api: newCredential('Google Drive account') };

const hook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Recording Upload', parameters: { httpMethod: 'POST', path: 'recording-upload', responseMode: 'responseNode', options: {} } }
});

const normalize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Input',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const b = ($input.first().json.body) || $input.first().json;
const vis = (String(b.visibility||'').toLowerCase() === 'global') ? 'global' : 'private';
const filename = String(b.filename || 'recording.mp3');
return [{ json: {
  data_b64: String(b.data_b64 || ''),
  filename,
  mime: String(b.mime || 'audio/mpeg'),
  title: String(b.title || filename).slice(0, 200),
  notes: String(b.notes || ''),
  caller_name: String(b.caller_name || 'Unknown'),
  visibility: vis,
  rec_id: 'rec_' + Date.now() + '_' + Math.floor(Math.random()*1000000),
  uploaded_at: new Date().toISOString(),
}}];
`
    }
  }
});

const decode = node({
  type: 'n8n-nodes-base.convertToFile',
  version: 1.1,
  config: {
    name: 'Decode MP3',
    parameters: { operation: 'toBinary', sourceProperty: 'data_b64' }
  }
});

const upload = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Upload to Drive',
    parameters: {
      resource: 'file',
      operation: 'upload',
      authentication: 'oAuth2',
      inputDataFieldName: 'data',
      name: expr('{{ $("Normalize Input").item.json.filename }}'),
      driveId: { __rl: true, mode: 'list', value: 'My Drive', cachedResultName: 'My Drive' },
      folderId: REC_FOLDER,
      options: {}
    },
    credentials: DRIVE_CRED
  }
});

const logRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Log to Recordings',
    parameters: {
      resource: 'sheet',
      operation: 'append',
      authentication: 'oAuth2',
      documentId: SETTINGS_DOC,
      sheetName: REC_TAB,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          id: expr('{{ $("Normalize Input").item.json.rec_id }}'),
          title: expr('{{ $("Normalize Input").item.json.title }}'),
          caller_name: expr('{{ $("Normalize Input").item.json.caller_name }}'),
          visibility: expr('{{ $("Normalize Input").item.json.visibility }}'),
          drive_file_id: expr('{{ $("Upload to Drive").item.json.id }}'),
          drive_link: expr('{{ $("Upload to Drive").item.json.webViewLink }}'),
          mime: expr('{{ $("Normalize Input").item.json.mime }}'),
          uploaded_at: expr('{{ $("Normalize Input").item.json.uploaded_at }}'),
          notes: expr('{{ $("Normalize Input").item.json.notes }}')
        },
        schema: [
          { id: 'id', displayName: 'id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'title', displayName: 'title', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'caller_name', displayName: 'caller_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'visibility', displayName: 'visibility', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'drive_file_id', displayName: 'drive_file_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'drive_link', displayName: 'drive_link', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'mime', displayName: 'mime', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'uploaded_at', displayName: 'uploaded_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
        ]
      },
      options: {}
    },
    credentials: SHEETS_CRED
  }
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond OK',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { "status": "ok", "file_id": $("Upload to Drive").item.json.id, "link": $("Upload to Drive").item.json.webViewLink } }}')
    }
  }
});

export default workflow('recording-upload', 'Recording Upload')
  .add(hook)
  .to(normalize)
  .to(decode)
  .to(upload)
  .to(logRow)
  .to(respond);
