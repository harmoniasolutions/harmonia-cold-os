# Agency Client Acquisition System - Setup Guide

## Overview

This is a complete automated system for finding, qualifying, and closing HVAC companies as clients for your AI automation agency.

### What's Included

| Workflow | Function |
|----------|----------|
| `01-prospect-hunter.json` | Scrapes HVAC companies from Google Places, scores them, identifies pain points |
| `02-cold-outreach-generator.json` | AI-generates personalized 3-email sequences |
| `03-follow-up-sender.json` | Automatically sends follow-up emails on schedule |
| `04-reply-detector.json` | Monitors inbox, scores replies, alerts on hot leads |
| `05-meeting-booker.json` | Books meetings with hot leads, integrates with Calendly |
| `06-proposal-generator.json` | AI-generates custom proposals with ROI calculations |
| `07-deal-pipeline.json` | Daily pipeline briefings, stale deal alerts, win tracking |
| `08-linkedin-outreach.json` | Generates LinkedIn messages for multi-channel outreach |

### Scripts Included

- `scripts/cold-call-script.md` - Full phone script with objection handling

---

## Prerequisites

### Required Accounts

1. **n8n** (self-hosted or cloud) - Workflow automation
2. **Airtable** - Prospect database (free tier works)
3. **Google Cloud** - Places API + Gmail API
4. **OpenAI** - GPT-4 for email/proposal generation
5. **SendGrid** - Email sending
6. **Twilio** - SMS notifications
7. **Calendly** - Meeting scheduling (optional)
8. **Slack** - Team notifications (optional)

### Estimated Monthly Costs

| Service | Cost |
|---------|------|
| n8n Cloud | $20-50/mo (or self-host free) |
| Airtable | Free tier or $20/mo |
| Google Places API | ~$10-30/mo (depends on volume) |
| OpenAI | ~$20-50/mo |
| SendGrid | Free tier (100 emails/day) |
| Twilio | ~$5-10/mo |
| **Total** | **~$50-150/mo** |

---

## Setup Instructions

### Step 1: Create Airtable Base

Create a new Airtable base called "Agency Prospects" with this table:

**Table: Prospects**

| Field Name | Type | Notes |
|------------|------|-------|
| Company Name | Single line text | Primary field |
| Phone | Phone number | |
| Website | URL | |
| Domain | Single line text | Extracted from website |
| Address | Long text | |
| City | Single line text | |
| State | Single line text | |
| Google Rating | Number (1 decimal) | |
| Review Count | Number | |
| Prospect Score | Number | 0-100 |
| Outreach Priority | Number | 0-100 |
| Pain Points | Multiple select | missed_calls, response_time, communication, scheduling, pricing_objections |
| Has Communication Pain | Checkbox | |
| Negative Reviews | Long text | |
| Possible Emails | Long text | |
| Verified Email | Email | |
| Google Maps URL | URL | |
| LinkedIn URL | URL | |
| Contact Name | Single line text | |
| Owner Name | Single line text | |
| Status | Single select | New, Scraped, Outreach, Replied, Meeting, Proposal, Won, Lost |
| Outreach Status | Single select | Pending, Emails Generated, Email 1 Sent, Email 2 Sent, Sequence Complete |
| Email 1 Subject | Single line text | |
| Email 1 Body | Long text | |
| Email 2 Subject | Single line text | |
| Email 2 Body | Long text | |
| Email 3 Subject | Single line text | |
| Email 3 Body | Long text | |
| Email 1 Sent At | Date time | |
| Email 2 Sent At | Date time | |
| Email 3 Sent At | Date time | |
| Reply Received | Checkbox | |
| Reply Date | Date time | |
| Reply Content | Long text | |
| Intent Score | Number | 0-100 |
| Lead Status | Single select | Hot Lead, Warm Lead, Interested, Not Interested, Do Not Contact, Meeting Scheduled, Proposal Sent, Negotiating, Won, Lost |
| Signals Detected | Multiple select | |
| Recommended Action | Single select | book_meeting, follow_up_call, send_more_info, archive, remove |
| Meeting Booked | Checkbox | |
| Meeting Time | Date time | |
| Booked At | Date time | |
| Proposal Generated | Checkbox | |
| Proposal Date | Date time | |
| Proposed Package | Single select | starter, growth, scale |
| Proposed Monthly | Currency | |
| Proposed Setup | Currency | |
| LinkedIn Status | Single select | Not Started, Messages Generated, Request Sent, Connected |
| LinkedIn Connection Msg | Long text | |
| LinkedIn Follow-Up 1 | Long text | |
| LinkedIn Follow-Up 2 | Long text | |
| LinkedIn Follow-Up 3 | Long text | |
| Won Date | Date time | |
| Needs Re-engagement | Checkbox | |
| Scraped At | Date time | |

### Step 2: Get API Keys

#### Google Cloud
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project "Agency Acquisition"
3. Enable APIs:
   - Places API
   - Places API (New)
   - Gmail API
   - Google Calendar API
4. Create API key for Places
5. Create OAuth credentials for Gmail/Calendar

#### OpenAI
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create API key
3. Add billing (GPT-4 required)

#### SendGrid
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Verify sender email
3. Create API key with Mail Send permission

#### Twilio
1. Create account at [twilio.com](https://twilio.com)
2. Get phone number
3. Note Account SID and Auth Token

### Step 3: Configure n8n Environment Variables

In n8n, go to Settings > Variables and add:

```
AGENCY_AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
GOOGLE_MAPS_API_KEY=AIzaXXXXXXXXXXXXXX
OPENAI_API_KEY=sk-XXXXXXXXXXXX
OUTREACH_FROM_EMAIL=you@yourdomain.com
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
YOUR_PHONE=+1XXXXXXXXXX
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXX (optional)
```

### Step 4: Import Workflows

1. Open n8n
2. Go to Workflows > Import
3. Import each JSON file from `workflows/` folder
4. Update credential IDs in each workflow (they reference placeholder IDs)

### Step 5: Create n8n Credentials

Create these credentials in n8n:

1. **Airtable** - Personal Access Token
2. **Google Sheets OAuth2** - For reading/writing sheets
3. **Gmail OAuth2** - For monitoring replies
4. **Google Calendar OAuth2** - For availability checking
5. **HTTP Query Auth** - For Polygon API (name: "Polygon API", key: apiKey)
6. **SendGrid** - API key
7. **Twilio** - Account SID + Auth Token
8. **OpenAI** - API key

### Step 6: Configure Calendly Webhook (Optional)

1. Go to Calendly > Integrations > Webhooks
2. Add webhook URL: `[YOUR_N8N_URL]/webhook/calendly-webhook`
3. Select events: invitee.created

---

## Daily Operations

### Automated Schedule

| Time | Workflow | Action |
|------|----------|--------|
| 6 AM | Prospect Hunter | Scrapes new HVAC companies in rotating cities |
| 7 AM | Pipeline Tracker | Morning briefing SMS + Slack |
| 8 AM | Outreach Generator | Generates emails for high-priority prospects |
| 9 AM | Follow-Up Sender | Sends email 2 and 3 to scheduled recipients |
| 10 AM | Meeting Booker | Sends booking emails to hot leads |
| 11 AM | LinkedIn Outreach | Generates LinkedIn messages, sends task reminder |
| Every 15 min | Reply Detector | Monitors inbox, scores replies, alerts hot leads |
| 5 PM | Pipeline Tracker | Win celebration if deals closed |

### Your Daily Tasks

1. **Morning (5 min)**
   - Review pipeline SMS/Slack briefing
   - Check hot lead alerts

2. **Mid-morning (30 min)**
   - Make calls to flagged prospects (use cold call script)
   - Send LinkedIn connection requests (copy from Airtable)

3. **Afternoon (15 min)**
   - Review AI-generated proposals before sending
   - Follow up on meetings

4. **Evening (5 min)**
   - Mark won/lost deals in Airtable
   - Review next day's meetings

---

## Customization

### Changing Target Markets

Edit `01-prospect-hunter.json` and modify the `targetCities` array in the "Get Target City" code node.

### Adjusting Email Templates

Edit `02-cold-outreach-generator.json` and modify the system prompt in the "AI Generate Email Sequence" node.

### Changing Scoring Criteria

Edit `01-prospect-hunter.json` and modify the scoring logic in "Extract & Score Prospects" and "Enrich & Analyze" nodes.

### Package Pricing

Edit `06-proposal-generator.json` and modify the pricing in "Build Proposal Context" node.

---

## Troubleshooting

### Emails not sending
- Check SendGrid API key
- Verify sender email is authenticated
- Check SendGrid activity log

### Prospects not being scraped
- Check Google Places API quota
- Verify API key is valid
- Check n8n execution logs

### Hot lead alerts not working
- Verify Twilio credentials
- Check phone number format (+1XXXXXXXXXX)
- Verify YOUR_PHONE environment variable

### Reply detection not working
- Re-authorize Gmail OAuth
- Check Gmail API is enabled
- Verify inbox label permissions

---

## Scaling Up

### When you're ready to scale:

1. **Add more cities** to prospect rotation
2. **Increase daily email limits** (upgrade SendGrid)
3. **Add team members** to Slack channel for lead alerts
4. **Use LinkedIn automation tools** (Phantombuster, Dripify) - at your own risk
5. **Hire a VA** to handle cold calls using the provided script
6. **Add a CRM** (Close.io, Pipedrive) for better deal tracking

---

## Support

If you need help:
1. Check n8n execution logs for errors
2. Review workflow connections
3. Verify all API keys are valid
4. Test each workflow individually

Good luck landing those contracts!
