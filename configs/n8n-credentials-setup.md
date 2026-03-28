# n8n Credentials Setup Guide

This guide walks you through setting up all required credentials in n8n for the Harmonia HVAC system.

## Prerequisites

1. n8n instance running (self-hosted or cloud)
2. All API keys from `.env.example` obtained
3. Access to n8n Settings > Credentials

---

## Step 1: ServiceTitan OAuth2 API

**Credential Type:** `HTTP Request` (with OAuth2)

1. Go to **Settings** > **Credentials** > **Add Credential**
2. Search for **HTTP Request**
3. Configure:

```
Name: ServiceTitan API
Authentication: OAuth2
Grant Type: Client Credentials

OAuth2 Settings:
- Token URL: https://auth.servicetitan.io/connect/token
- Client ID: [Your ST_CLIENT_ID]
- Client Secret: [Your ST_CLIENT_SECRET]
- Scope: (leave empty)
```

**Note:** ServiceTitan tokens expire in 15 minutes. n8n will auto-refresh.

---

## Step 2: Twilio API

**Credential Type:** `Twilio API`

1. Add new credential
2. Search for **Twilio API**
3. Configure:

```
Name: Twilio Production
Account SID: [Your TWILIO_ACCOUNT_SID]
Auth Token: [Your TWILIO_AUTH_TOKEN]
```

---

## Step 3: Airtable Token API

**Credential Type:** `Airtable Token API`

1. Add new credential
2. Search for **Airtable Token API**
3. Configure:

```
Name: Airtable - Harmonia
Access Token: [Your AIRTABLE_API_KEY]
```

---

## Step 4: OpenAI API

**Credential Type:** `OpenAI API`

1. Add new credential
2. Search for **OpenAI API**
3. Configure:

```
Name: OpenAI - Harmonia
API Key: [Your OPENAI_API_KEY]
```

---

## Step 5: SendGrid API

**Credential Type:** `SendGrid API`

1. Add new credential
2. Search for **SendGrid API**
3. Configure:

```
Name: SendGrid - Harmonia
API Key: [Your SENDGRID_API_KEY]
```

---

## Step 6: Google Sheets OAuth2

**Credential Type:** `Google Sheets OAuth2 API`

1. Add new credential
2. Search for **Google Sheets OAuth2 API**
3. Click **Connect my account**
4. Authorize with Google account that has access to Dead Letter sheet

---

## Step 7: Environment Variables

In n8n, go to **Settings** > **Variables** and add:

| Variable | Value |
|----------|-------|
| `COMPANY_NAME` | Your HVAC Company |
| `COMPANY_PHONE` | +15551234567 |
| `ST_TENANT_ID` | Your tenant ID |
| `ST_APP_KEY` | Your app key |
| `DIAGNOSTIC_JOB_TYPE_ID` | ST job type ID |
| `DIAGNOSTIC_FEE` | 89 |
| `EMERGENCY_FEE` | 149 |
| `VAPI_API_KEY` | Your Vapi key |
| `VAPI_BOOKING_ASSISTANT_ID` | asst_xxxx |
| `VAPI_EMERGENCY_ASSISTANT_ID` | asst_xxxx |
| `VAPI_PHONE_NUMBER_ID` | Your Vapi phone |
| `MANAGER_PHONE` | +15551112222 |
| `TECH_LEAD_PHONE` | +15553334444 |
| `TWILIO_PHONE_NUMBER` | +15559876543 |
| `AIRTABLE_BASE_ID` | appXXXXXXXXXXXX |
| `SENDGRID_FROM_EMAIL` | service@company.com |
| `DEAD_LETTER_SHEET_ID` | Google Sheet ID |
| `REACTIVATION_DISCOUNT` | 50 |

---

## Step 8: Verify Credentials

1. Open each workflow
2. Click on nodes that use credentials
3. Select the appropriate credential from the dropdown
4. Save the workflow

---

## Testing

### Test ServiceTitan Connection:
```bash
curl -X POST https://auth.servicetitan.io/connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

### Test Twilio:
```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_SID/Messages.json \
  -u "YOUR_SID:YOUR_TOKEN" \
  -d "From=+15559876543" \
  -d "To=+15551234567" \
  -d "Body=Test from Harmonia"
```

### Test Vapi:
```bash
curl https://api.vapi.ai/assistant \
  -H "Authorization: Bearer YOUR_VAPI_KEY"
```

---

## Troubleshooting

### ServiceTitan 401 Error
- Check Client ID and Secret
- Ensure app is connected in ST Settings > Integrations
- Verify tenant ID is correct

### Twilio Messages Not Sending
- Check phone number is verified (trial accounts)
- Verify From number is your Twilio number
- Check account balance

### Airtable Permission Denied
- Regenerate token with correct scopes
- Ensure base ID is correct
- Check table names match exactly

---

## Security Notes

1. **Never** commit credentials to version control
2. Use n8n's encrypted credential storage
3. Rotate API keys quarterly
4. Use separate credentials for production vs testing
5. Enable audit logs in n8n
