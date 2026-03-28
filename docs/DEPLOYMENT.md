# Harmonia Deployment Guide

Complete step-by-step deployment instructions for the Harmonia HVAC Automation System.

---

## Pre-Deployment Checklist

### Accounts Required

- [ ] **ServiceTitan** - Active subscription with API access enabled
- [ ] **Vapi** - Account created at https://vapi.ai ($25 free credit)
- [ ] **Twilio** - Account with SMS-enabled phone number
- [ ] **Airtable** - Free account at https://airtable.com
- [ ] **OpenAI** - API key from https://platform.openai.com
- [ ] **SendGrid** - Free account at https://sendgrid.com
- [ ] **n8n** - Self-hosted or cloud instance

### Technical Requirements

- [ ] Node.js 18+ (for deployment scripts)
- [ ] curl (for testing)
- [ ] Access to DNS for webhook URLs (if using custom domain)

---

## Phase 1: ServiceTitan Setup (30 min)

### 1.1 Request API Access

1. Log into ServiceTitan
2. Go to **Settings** → **Integrations** → **API Application Access**
3. If you don't see this option, contact ServiceTitan support to enable API access

### 1.2 Create Application

1. Go to https://developer.servicetitan.io/
2. Sign up / Sign in
3. Click **Create App**
4. Fill in:
   - App Name: "Harmonia AI"
   - Description: "AI-powered lead capture and booking system"
5. Note your **Client ID** and **Client Secret**

### 1.3 Configure Booking Provider Tag

1. In ServiceTitan, go to **Settings** → **Integrations** → **Booking Provider Tags**
2. Click **Add Tag**
3. Name: "Harmonia AI"
4. Description: "Bookings created by AI receptionist"
5. Save
6. Go back to **API Application Access**
7. Connect your app and select the "Harmonia AI" booking provider tag

### 1.4 Get Required IDs

1. **Tenant ID:** Found in your ST URL (e.g., `https://go.servicetitan.com/#/tenant/12345/...`)
2. **Job Type IDs:** Go to **Settings** → **Job Types**, click on "Diagnostic" and note the ID from the URL

---

## Phase 2: Vapi Setup (20 min)

### 2.1 Create Account & Get Phone Number

1. Sign up at https://vapi.ai
2. Go to **Phone Numbers** → **Buy Number**
3. Select a local number for your service area
4. Note the **Phone Number ID**

### 2.2 Get API Key

1. Go to **Settings** → **API Keys**
2. Create new key: "Harmonia Production"
3. Copy and save securely

### 2.3 Deploy Assistants

```bash
cd Harmonia/scripts

# Set environment variables
export VAPI_API_KEY="your-vapi-key"
export COMPANY_NAME="Your HVAC Company"
export COMPANY_PHONE="+15551234567"
export DIAGNOSTIC_FEE="89"
export N8N_WEBHOOK_URL="https://your-n8n-instance.com"

# Run deployment
node deploy-vapi-assistants.js
```

Save the returned Assistant IDs to your `.env` file.

### 2.4 Configure Phone Number Routing

1. In Vapi dashboard, go to **Phone Numbers**
2. Click your number
3. Set **Inbound Assistant** to "Harmonia HVAC Receptionist - Inbound"
4. Save

---

## Phase 3: Twilio Setup (15 min)

### 3.1 Get Credentials

1. Log into https://console.twilio.com
2. From dashboard, copy:
   - Account SID
   - Auth Token

### 3.2 Get/Verify Phone Number

1. Go to **Phone Numbers** → **Manage** → **Buy a number**
2. Or use existing number
3. Ensure SMS capability is enabled

### 3.3 Configure Webhook

1. Go to **Phone Numbers** → Click your number
2. Under **Messaging**, set webhook URL to:
   ```
   https://your-n8n-instance.com/webhook/twilio-inbound-sms
   ```
3. Method: POST
4. Save

---

## Phase 4: Airtable Setup (15 min)

### 4.1 Create Base

1. Log into Airtable
2. Click **Add a base** → **Start from scratch**
3. Name: "Harmonia HVAC"

### 4.2 Create Tables

Reference `templates/airtable-leads-schema.json` for full schema.

**Quick Setup - Leads Table:**

| Field Name | Type |
|------------|------|
| First Name | Single line text |
| Last Name | Single line text |
| Phone | Phone number |
| Email | Email |
| Address | Single line text |
| Status | Single select |
| Lead Score | Number |
| Last Contact | Date |
| Reactivation Attempts | Number |
| Do Not Contact | Checkbox |
| ... | (see full schema) |

### 4.3 Get Base ID

1. Open your base
2. Look at URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`
3. The `appXXXXXXXXXXXXXX` part is your Base ID

### 4.4 Create API Token

1. Go to https://airtable.com/create/tokens
2. Create token with scopes:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
3. Add your base to the token's access list

---

## Phase 5: n8n Setup (30 min)

### 5.1 Access n8n

**Option A: Self-Hosted**
```bash
docker run -it --rm \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

**Option B: n8n Cloud**
Sign up at https://n8n.io/cloud

### 5.2 Configure Credentials

Follow `configs/n8n-credentials-setup.md` to add:

1. ServiceTitan (HTTP Request with OAuth2)
2. Twilio API
3. Airtable Token API
4. OpenAI API
5. SendGrid API
6. Google Sheets OAuth2

### 5.3 Add Environment Variables

Go to **Settings** → **Variables** and add all variables from `.env.example`

### 5.4 Import Workflows

For each file in `workflows/`:

1. Go to **Workflows** → **Import from File**
2. Select the JSON file
3. Click **Import**
4. Open the imported workflow
5. Click on each node and assign the correct credentials
6. Save

### 5.5 Configure Webhook URLs

After importing, note the webhook URLs:

| Workflow | Webhook Path | Full URL |
|----------|--------------|----------|
| Voice Receptionist | `/webhook/vapi-inbound` | `https://your-n8n.com/webhook/vapi-inbound` |
| Set & Save | `/webhook/lead-intake` | `https://your-n8n.com/webhook/lead-intake` |
| Reply Handler | `/webhook/twilio-inbound-sms` | `https://your-n8n.com/webhook/twilio-inbound-sms` |

### 5.6 Activate Workflows

1. Open each workflow
2. Toggle **Active** to ON
3. Confirm in the workflows list that all show as active

---

## Phase 6: Integration Testing (20 min)

### 6.1 Run Validation Script

```bash
cd Harmonia/scripts
chmod +x validate-env.sh
./validate-env.sh
```

Fix any errors before proceeding.

### 6.2 Run Webhook Tests

```bash
chmod +x test-webhooks.sh
./test-webhooks.sh
```

### 6.3 Manual Tests

**Test 1: Inbound Call**
1. Call your Vapi phone number
2. Talk to the AI
3. Verify:
   - AI answers professionally
   - Asks for issue description
   - Offers appointment slots
   - Booking appears in ServiceTitan

**Test 2: Lead Form**
1. Submit a test lead through your website form
2. Verify:
   - Lead appears in Airtable
   - Vapi calls you back within 10 seconds
   - Lead appears in ServiceTitan

**Test 3: SMS Reply**
1. From the Airtable, find a test lead
2. Text "Yes I'm interested" to your Twilio number
3. Verify:
   - Intent classified as INTERESTED
   - Vapi call initiated
   - Airtable status updated

---

## Phase 7: Go Live

### 7.1 Pre-Launch Checklist

- [ ] All workflows active
- [ ] Vapi phone number routed to inbound assistant
- [ ] Twilio webhook configured
- [ ] Lead sources (Google LSA, Facebook, website) pointed to `/webhook/lead-intake`
- [ ] Team notified of new system
- [ ] Manager phone receiving alerts

### 7.2 Gradual Rollout (Recommended)

**Week 1:** Enable for after-hours only
- Forward calls to Vapi only when office is closed
- Monitor all bookings manually

**Week 2:** Enable for overflow
- Forward calls to Vapi when all lines busy
- Continue monitoring

**Week 3:** Full deployment
- Vapi handles all inbound calls
- Human dispatchers handle escalations only

### 7.3 Monitoring

Set up alerts for:
- n8n workflow failures
- Vapi call errors
- ServiceTitan API errors
- Dead letter queue entries

---

## Rollback Procedure

If issues occur:

1. **Disable Vapi routing:** In phone provider, forward calls to human dispatcher
2. **Deactivate n8n workflows:** Toggle off in n8n
3. **Review logs:** Check n8n executions, Vapi call logs, Twilio logs
4. **Fix issues:** Update configurations
5. **Re-test:** Run test suite before re-enabling
6. **Re-enable gradually:** Follow gradual rollout process

---

## Post-Deployment Optimization

### Week 1-2: Baseline
- Monitor conversion rates
- Listen to Vapi call recordings
- Note common customer questions

### Week 3-4: Tune
- Adjust Vapi prompts based on common issues
- Refine lead scoring weights
- Optimize SMS messaging

### Month 2+: Scale
- Add new lead sources
- Increase reactivation batch size
- Consider additional assistants (e.g., Spanish language)

---

## Support

For issues:
1. Check `docs/TROUBLESHOOTING.md`
2. Review n8n execution logs
3. Check Vapi dashboard for call recordings
4. Verify API credentials haven't expired

---

**Deployment complete! Your HVAC company now has a 24/7 AI workforce.**
