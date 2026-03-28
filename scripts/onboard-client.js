#!/usr/bin/env node

/**
 * Harmonia Client Onboarding
 *
 * One command. Full Vapi setup. Works forever.
 *
 *   export VAPI_API_KEY=your-key
 *   node scripts/onboard-client.js clients/whatever.json
 *
 * Creates: assistant + booking tool + call log tool + phone number
 * Saves all IDs back to the JSON file so you never lose them.
 */

const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE = 'https://api.vapi.ai';
const N8N_WEBHOOK_BASE = process.env.N8N_WEBHOOK_BASE || 'https://infoharmonia.app.n8n.cloud/webhook';

// ─── Preflight ────────────────────────────────────────────
if (!VAPI_API_KEY) {
  console.error('\n  Set your Vapi key first:\n');
  console.error('    export VAPI_API_KEY=your-key-here\n');
  process.exit(1);
}

const clientFile = process.argv[2];
if (!clientFile) {
  console.error('\n  Usage: node scripts/onboard-client.js <client.json>\n');
  console.error('  Example: node scripts/onboard-client.js clients/main-street-salon.json\n');
  process.exit(1);
}

const client = JSON.parse(fs.readFileSync(clientFile, 'utf-8'));

const required = ['businessName', 'ownerName', 'ownerPhone', 'hours', 'areaCode'];
const missing = required.filter(f => !client[f]);
if (missing.length) {
  console.error(`\n  Missing fields in ${clientFile}: ${missing.join(', ')}\n`);
  process.exit(1);
}

if (client.vapi && client.vapi.assistantId) {
  console.error(`\n  This client is already onboarded!`);
  console.error(`  Assistant ID: ${client.vapi.assistantId}`);
  console.error(`  Phone: ${client.vapi.phoneNumber}\n`);
  console.error(`  To re-onboard, delete the "vapi" key from ${clientFile}\n`);
  process.exit(1);
}

// ─── Vapi API helper ─────────────────────────────────────
async function vapi(method, endpoint, body) {
  const res = await fetch(`${VAPI_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${method} ${endpoint} → ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── System prompt generator ─────────────────────────────
function buildPrompt(c) {
  return [
    `You are the friendly and professional virtual receptionist for ${c.businessName}${c.location ? ` in ${c.location}` : ''}. The business is owned by ${c.ownerName}.`,
    '',
    '## Your Role',
    '- Answer inbound calls warmly and professionally',
    '- Book, reschedule, or cancel appointments',
    '- Answer questions about the business (hours, location, services)',
    '- Capture caller information for follow-up',
    '',
    '## Business Details',
    `- **Name**: ${c.businessName}`,
    `- **Owner**: ${c.ownerName}`,
    `- **Hours**: ${c.hours}`,
    c.location ? `- **Location**: ${c.location}` : null,
    c.services ? `- **Services**: ${c.services}` : null,
    '',
    '## Appointment Booking',
    '- Collect: full name, phone number, preferred date/time, and service requested',
    '- Use the bookAppointment tool to submit the booking',
    '- Confirm details back to the caller before submitting',
    '- If requested time is outside business hours, suggest the nearest available slot',
    '',
    '## Call Logging',
    '- After every call, use the logCall tool to log call details',
    '',
    '## Guidelines',
    '- Be warm, upbeat, and concise — like a real receptionist',
    `- Never say you are an AI. You are ${c.ownerName}'s assistant`,
    `- If you cannot answer a question, offer to have ${c.ownerName} call them back`,
    '- Keep responses brief and conversational — this is a phone call, not an essay',
    c.policies ? `\n## Policies\n${c.policies}` : null,
    c.extras ? `\n${c.extras}` : null,
  ].filter(Boolean).join('\n');
}

// ─── Main ─────────────────────────────────────────────────
async function onboard() {
  const slug = client.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  console.log(`\n  Onboarding: ${client.businessName}\n`);

  // 1. Create assistant
  process.stdout.write('  [1/5] Creating assistant...');
  const assistant = await vapi('POST', '/assistant', {
    name: `${client.businessName.replace(/\s+/g, '_')}_Receptionist`,
    firstMessage: client.greeting || `Thank you for calling ${client.businessName}, this is ${client.ownerName}'s assistant. How can I help you today?`,
    firstMessageMode: 'assistant-speaks-first',
    model: {
      provider: 'openai',
      model: client.model || 'gpt-4o',
      messages: [{ role: 'system', content: buildPrompt(client) }],
    },
    voice: {
      provider: client.voiceProvider || '11labs',
      voiceId: client.voiceId || 'sarah',
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-3',
    },
  });
  console.log(` done  (${assistant.id})`);

  // 2. Create booking tool
  process.stdout.write('  [2/5] Creating booking tool...');
  const bookingTool = await vapi('POST', '/tool', {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: `Books an appointment at ${client.businessName}. Sends booking details to CRM.`,
      parameters: {
        type: 'object',
        properties: {
          name:          { type: 'string', description: 'Full name of the caller' },
          phone:         { type: 'string', description: 'Caller phone number' },
          email:         { type: 'string', description: 'Caller email if provided' },
          service:       { type: 'string', description: 'Service requested' },
          preferredDate: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
          preferredTime: { type: 'string', description: 'Preferred time (HH:MM, 24hr)' },
        },
        required: ['name', 'phone', 'service', 'preferredDate', 'preferredTime'],
      },
    },
    server: { url: `${N8N_WEBHOOK_BASE}/vapi-booking-${slug}` },
  });
  console.log(` done  (${bookingTool.id})`);

  // 3. Create call log tool
  process.stdout.write('  [3/5] Creating call log tool...');
  const logTool = await vapi('POST', '/tool', {
    type: 'function',
    function: {
      name: 'logCall',
      description: 'Logs call details to CRM after conversation ends.',
      parameters: {
        type: 'object',
        properties: {
          name:    { type: 'string', description: 'Caller name' },
          phone:   { type: 'string', description: 'Caller phone number' },
          reason:  { type: 'string', description: 'Reason for call (booking, reschedule, cancel, inquiry, other)' },
          outcome: { type: 'string', description: 'Call outcome (booked, callback_requested, info_provided, no_action)' },
          notes:   { type: 'string', description: 'Summary notes from the conversation' },
        },
        required: ['phone', 'reason', 'outcome'],
      },
    },
    server: { url: `${N8N_WEBHOOK_BASE}/vapi-calllog-${slug}` },
  });
  console.log(` done  (${logTool.id})`);

  // 4. Attach tools to assistant
  process.stdout.write('  [4/5] Attaching tools...');
  await vapi('PATCH', `/assistant/${assistant.id}`, {
    model: {
      provider: 'openai',
      model: client.model || 'gpt-4o',
      messages: [{ role: 'system', content: buildPrompt(client) }],
      toolIds: [bookingTool.id, logTool.id],
    },
  });
  console.log(' done');

  // 5. Buy phone number
  process.stdout.write('  [5/5] Buying phone number...');
  let phoneNumber;
  try {
    phoneNumber = await vapi('POST', '/phone-number', {
      provider: 'vapi',
      numberDesiredAreaCode: client.areaCode,
      assistantId: assistant.id,
      name: client.businessName,
    });
    console.log(` done  (${phoneNumber.number || phoneNumber.phoneNumber})`);
  } catch (err) {
    console.log(` MANUAL SETUP NEEDED`);
    console.log(`\n  Phone purchase failed: ${err.message}`);
    console.log(`  Go to Vapi dashboard → Phone Numbers → Buy → assign to assistant ${assistant.id}`);
    phoneNumber = { number: 'MANUAL_SETUP_NEEDED', id: null };
  }

  // Save everything back to the client file
  client.vapi = {
    assistantId: assistant.id,
    bookingToolId: bookingTool.id,
    logToolId: logTool.id,
    phoneNumberId: phoneNumber.id,
    phoneNumber: phoneNumber.number || phoneNumber.phoneNumber,
    webhooks: {
      booking: `${N8N_WEBHOOK_BASE}/vapi-booking-${slug}`,
      callLog: `${N8N_WEBHOOK_BASE}/vapi-calllog-${slug}`,
    },
    onboardedAt: new Date().toISOString(),
  };

  fs.writeFileSync(clientFile, JSON.stringify(client, null, 2));

  // Print summary
  console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DONE — ${client.businessName} is live
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Phone Number:  ${phoneNumber.number || phoneNumber.phoneNumber}
  Assistant ID:  ${assistant.id}
  Booking Hook:  ${N8N_WEBHOOK_BASE}/vapi-booking-${slug}
  Call Log Hook: ${N8N_WEBHOOK_BASE}/vapi-calllog-${slug}

  STILL NEED:
  1. Build n8n workflows for the 2 webhooks above (→ push to GHL)
  2. Upload knowledge base in Vapi dashboard (services, FAQ, etc.)
  3. Test it — call the phone number

  Config saved to: ${clientFile}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

onboard().catch(err => {
  console.error(`\n  FAILED: ${err.message}\n`);
  process.exit(1);
});
