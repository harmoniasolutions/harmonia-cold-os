# Harmonia Troubleshooting Guide

Solutions for common issues with the Harmonia HVAC Automation System.

---

## Quick Diagnostics

### Check System Health

```bash
cd Harmonia/scripts
./validate-env.sh
```

### Check n8n Workflow Status

1. Open n8n
2. Go to **Executions**
3. Filter by "Failed"
4. Check error messages

### Check Vapi Call Logs

1. Open Vapi dashboard
2. Go to **Calls**
3. Review recent calls for errors

---

## Common Issues

### 1. Vapi Not Answering Calls

**Symptoms:**
- Calls go to voicemail or disconnect
- No call records in Vapi dashboard

**Solutions:**

1. **Check phone number routing:**
   - Vapi Dashboard → Phone Numbers → Your Number
   - Verify "Inbound Assistant" is set correctly

2. **Check assistant is valid:**
   ```bash
   curl -H "Authorization: Bearer $VAPI_API_KEY" \
     https://api.vapi.ai/assistant/$VAPI_INBOUND_ASSISTANT_ID
   ```
   Should return assistant details, not an error.

3. **Check Vapi account balance:**
   - Dashboard → Billing
   - Ensure sufficient credits

4. **Check phone number status:**
   - Vapi may have suspended the number
   - Contact Vapi support if needed

---

### 2. ServiceTitan API Errors

**Symptoms:**
- Bookings not appearing in ST
- "401 Unauthorized" errors
- "403 Forbidden" errors

**Solutions:**

1. **Token expired (401):**
   - n8n should auto-refresh, but if not:
   - Delete and recreate the credential in n8n
   - Test with:
   ```bash
   curl -X POST https://auth.servicetitan.io/connect/token \
     -d "grant_type=client_credentials&client_id=$ST_CLIENT_ID&client_secret=$ST_CLIENT_SECRET"
   ```

2. **Missing permissions (403):**
   - In ServiceTitan: Settings → Integrations → API Application Access
   - Click your app and check scopes
   - Required: CRM read/write, Dispatch read, Bookings write

3. **Wrong Tenant ID:**
   - Verify `ST_TENANT_ID` matches your account
   - Find in ST URL: `go.servicetitan.com/#/tenant/XXXXX/...`

4. **Booking Provider Tag not set:**
   - Settings → Integrations → Booking Provider Tags
   - Create tag and connect to your API app

---

### 3. Leads Not Appearing in Airtable

**Symptoms:**
- Webhook fires but no record created
- "401" or "403" from Airtable

**Solutions:**

1. **Check API token scopes:**
   - Regenerate token at https://airtable.com/create/tokens
   - Include scopes: `data.records:read`, `data.records:write`
   - Add your base to the token's access

2. **Check Base ID:**
   - Open base in Airtable
   - URL format: `airtable.com/appXXXXXXXXXXXXXX/...`
   - Verify `AIRTABLE_BASE_ID` matches

3. **Check table name:**
   - Table name in workflow must match exactly (case-sensitive)
   - Default: "Leads"

4. **Field name mismatch:**
   - Airtable field names must match workflow exactly
   - Check for typos or extra spaces

---

### 4. SMS Not Sending

**Symptoms:**
- No confirmation texts received
- Twilio errors in n8n logs

**Solutions:**

1. **Check Twilio credentials:**
   ```bash
   curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
     -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
     -d "From=$TWILIO_PHONE_NUMBER" \
     -d "To=+15551234567" \
     -d "Body=Test from Harmonia"
   ```

2. **Phone number not SMS-enabled:**
   - Twilio Console → Phone Numbers → Your Number
   - Check "Messaging" capability is checked

3. **Trial account restrictions:**
   - Can only send to verified numbers
   - Upgrade or verify recipient numbers

4. **Geographic restrictions:**
   - Some Twilio numbers can't send to certain countries
   - Check number capabilities

---

### 5. Inbound SMS Not Processed

**Symptoms:**
- Replies not triggering workflows
- Intent classification not happening

**Solutions:**

1. **Check Twilio webhook configuration:**
   - Twilio Console → Phone Numbers → Your Number
   - Messaging webhook URL should be:
     `https://your-n8n.com/webhook/twilio-inbound-sms`
   - Method: POST

2. **Webhook not reachable:**
   - Test with:
   ```bash
   curl -X POST "https://your-n8n.com/webhook/twilio-inbound-sms" \
     -d "From=+15551234567&To=+15559876543&Body=test&MessageSid=test123"
   ```
   - Should return XML response

3. **Workflow not active:**
   - n8n → Workflows → "Reply Handler"
   - Ensure toggle is ON

4. **Phone number format mismatch:**
   - Workflow expects E.164 format (+15551234567)
   - Check normalization in "Parse Twilio Data" node

---

### 6. AI Responses Sound Wrong

**Symptoms:**
- AI says something unexpected
- Doesn't handle objections well
- Too robotic

**Solutions:**

1. **Update system prompt:**
   - Open Vapi Dashboard → Assistants → Edit
   - Modify the system prompt
   - Test with test calls

2. **Temperature too low/high:**
   - Low (0.3): More predictable but robotic
   - High (0.9): More creative but unpredictable
   - Recommended: 0.7 for conversation

3. **Model upgrade:**
   - Switch from gpt-4o-mini to gpt-4o for better quality
   - Higher cost but better conversation

4. **Add examples to prompt:**
   - In system prompt, add "Example conversations" section
   - Show the AI how to handle specific scenarios

---

### 7. Lead Scoring Inaccurate

**Symptoms:**
- Cold leads marked as HOT
- Emergencies not detected
- Wrong priority routing

**Solutions:**

1. **Review scoring factors:**
   - Open `05-set-and-save.json`
   - Find "Calculate Lead Score" node
   - Review keyword lists

2. **Add missing keywords:**
   ```javascript
   // In the scoring node, add to emergencyKeywords:
   const emergencyKeywords = [
     'no heat', 'no cooling', 'no ac',
     // Add your common emergency phrases:
     'frozen pipes', 'water everywhere', 'sparking'
   ];
   ```

3. **Adjust weights:**
   - Emergency: Currently +25, increase if needed
   - Source scoring: Adjust based on your data

---

### 8. Workflow Timeouts

**Symptoms:**
- n8n executions fail with timeout
- Partial completion

**Solutions:**

1. **Increase timeout:**
   - n8n settings → Execution timeout
   - Increase to 120+ seconds

2. **ServiceTitan API slow:**
   - Add retry logic (already in Set & Save)
   - Check ST status page for outages

3. **Vapi call initiation slow:**
   - Normal: 2-5 seconds
   - If longer, check Vapi status

4. **Split long workflows:**
   - Use webhook handoffs between workflows
   - Process in background where possible

---

### 9. Dead Letter Queue Growing

**Symptoms:**
- Many entries in failed syncs sheet
- ST sync failures

**Solutions:**

1. **Check ST API status:**
   - ServiceTitan occasionally has maintenance
   - Retry failed entries manually or wait

2. **Rate limiting:**
   - ST has API rate limits
   - Add delays between batch operations

3. **Invalid data:**
   - Check dead letter entries for pattern
   - Often: missing required fields, invalid addresses

4. **Manual recovery:**
   - Export dead letter sheet
   - Fix data issues
   - Re-submit via workflow or manual ST entry

---

### 10. Vapi Call Quality Issues

**Symptoms:**
- Choppy audio
- Long pauses
- Transcription errors

**Solutions:**

1. **Check transcriber settings:**
   - Use Deepgram Nova-2 (recommended)
   - Enable smart formatting

2. **Adjust voice settings:**
   - Reduce stability for more natural sound
   - Increase similarity boost for consistency

3. **Network issues:**
   - Vapi/caller network problems
   - Check call recordings for patterns

4. **Model latency:**
   - GPT-4o has higher latency than GPT-4o-mini
   - Trade quality for speed if needed

---

## Getting Help

### Log Collection

When reporting issues, include:

1. **n8n execution log:**
   - Executions → Failed execution → Copy JSON

2. **Vapi call recording:**
   - Calls → Select call → Download recording

3. **Environment info:**
   ```bash
   ./validate-env.sh 2>&1 | tee harmonia-diagnostics.txt
   ```

### Support Channels

- **Vapi:** https://discord.gg/vapi
- **n8n:** https://community.n8n.io
- **ServiceTitan:** Partner support portal

---

## Preventive Maintenance

### Weekly
- [ ] Review n8n failed executions
- [ ] Check dead letter queue
- [ ] Listen to 5 random Vapi calls

### Monthly
- [ ] Rotate API keys
- [ ] Review lead scoring accuracy
- [ ] Update Vapi prompts based on feedback
- [ ] Check ServiceTitan API changelog for breaking changes

### Quarterly
- [ ] Full system test (all workflows)
- [ ] Review and optimize lead scoring weights
- [ ] Update keywords for seasonal relevance
- [ ] Backup Airtable data
