# Harmonia HVAC Automation System

> **The Complete AI-Powered Lead Capture, Qualification & Booking System for HVAC Companies**

Harmonia transforms how HVAC companies handle leads. It answers calls 24/7, qualifies prospects in real-time, books appointments directly into ServiceTitan, and reactivates dormant leads—all automatically.

---

## 🎯 What Harmonia Does

| Workflow | Function | ROI |
|----------|----------|-----|
| **Voice Receptionist** | Answers inbound calls, checks availability, books appointments | Never miss a lead, even at 2 AM |
| **Set & Save** | Captures leads from Google, Facebook, website forms instantly | 10-second speed-to-lead |
| **Lead Reactivation** | Re-engages closed-lost leads with AI-personalized outreach | Revive $10k+ deals from your database |
| **Reply Handler** | Classifies SMS replies, triggers callbacks for interested leads | Automated follow-up at scale |

---

## 📁 System Architecture

```
Harmonia/
├── workflows/                    # n8n workflow JSON files
│   ├── 01-voice-receptionist.json
│   ├── 02-lead-reactivation-sms.json
│   ├── 03-lead-reactivation-email.json
│   ├── 04-reply-handler.json
│   └── 05-set-and-save.json
│
├── vapi-assistants/              # Voice AI configurations
│   ├── inbound-receptionist.json
│   ├── outbound-booking.json
│   └── emergency-dispatcher.json
│
├── configs/                      # Configuration templates
│   ├── .env.example
│   └── n8n-credentials-setup.md
│
├── templates/                    # Database schemas
│   └── airtable-leads-schema.json
│
├── scripts/                      # Deployment & testing
│   ├── test-webhooks.sh
│   ├── deploy-vapi-assistants.js
│   └── validate-env.sh
│
└── docs/                         # Documentation
    ├── README.md (this file)
    ├── DEPLOYMENT.md
    ├── TROUBLESHOOTING.md
    └── API-REFERENCE.md
```

---

## 🚀 Quick Start (30 Minutes)

### Step 1: Prerequisites

- [ ] n8n instance (self-hosted or cloud)
- [ ] ServiceTitan account with API access
- [ ] Vapi account ($25 credit to start)
- [ ] Twilio account (SMS capability)
- [ ] Airtable account (free tier works)
- [ ] OpenAI API key
- [ ] SendGrid account (for emails)

### Step 2: Configure Environment

```bash
cd Harmonia/configs
cp .env.example .env
# Edit .env with your credentials
```

### Step 3: Validate Setup

```bash
cd Harmonia/scripts
chmod +x validate-env.sh
./validate-env.sh
```

### Step 4: Deploy Vapi Assistants

```bash
export VAPI_API_KEY="your-key"
export COMPANY_NAME="Your HVAC Company"
export N8N_WEBHOOK_URL="https://your-n8n.com"
node deploy-vapi-assistants.js
```

### Step 5: Import n8n Workflows

1. Open n8n
2. Go to **Workflows** → **Import from File**
3. Import each JSON from `workflows/` folder
4. Configure credentials (see `configs/n8n-credentials-setup.md`)
5. Activate workflows

### Step 6: Set Up Airtable

1. Create new Airtable base
2. Use schema from `templates/airtable-leads-schema.json`
3. Copy Base ID to your `.env`

### Step 7: Test

```bash
./test-webhooks.sh
```

---

## 📊 Workflow Deep Dives

### 1. Voice Receptionist (Inbound Interceptor)

**Trigger:** Vapi webhook during live inbound call

**Flow:**
```
Caller Dials In
    ↓
Vapi AI Answers: "Thank you for calling {Company}, this is Sam..."
    ↓
AI Extracts: Name, Address, Issue
    ↓
n8n: Lookup Customer in ServiceTitan
    ↓
n8n: Check 48-Hour Availability
    ↓
AI: "I have openings tomorrow at 2 PM or Thursday at 10 AM..."
    ↓
Customer Selects Slot
    ↓
n8n: Create Booking in ServiceTitan
    ↓
n8n: Send SMS Confirmation
    ↓
AI: "You're all set! A technician will call 30 minutes before."
```

**Key Features:**
- Customer history lookup (VIP treatment for returning customers)
- Real-time availability from ServiceTitan
- Human-readable time slots ("tomorrow at 2 PM" not "2024-01-15T14:00:00Z")
- Diagnostic fee objection handling built into AI prompt
- Emergency detection and routing
- Fallback: Manager callback promise if no slots available

---

### 2. Set & Save (Multi-Source Lead Capture)

**Trigger:** Unified webhook accepts Google LSA, Facebook Leads, Elementor forms

**Flow:**
```
Lead Submits Form (any source)
    ↓
n8n: Normalize to unified schema
    ↓
n8n: Calculate Lead Score (1-100)
    ↓
Emergency? ──Yes──→ Alert Tech Lead + Emergency Vapi Call
    │
    No
    ↓
n8n: Trigger Vapi Outbound Call (10-second race)
    ↓
n8n: Create Lead in ServiceTitan (with retry logic)
    ↓
Success? ──No──→ Dead Letter Queue + Manager Alert
    │
    Yes
    ↓
Lead Captured, Call in Progress
```

**Lead Scoring Factors:**
| Factor | Points | Detection |
|--------|--------|-----------|
| Homeowner | +20 | Keywords: "owner", "my house" |
| Renter | -10 | Keywords: "tenant", "landlord" |
| Old System | +15 | Keywords: "10 years old", "original" |
| Emergency | +25 | Keywords: "no heat", "not working" |
| High-Value Service | +20 | Keywords: "replacement", "install" |
| Google LSA Source | +15 | High-intent searcher |
| Facebook Source | +5 | Lower intent |
| Complete Contact Info | +10 | Phone + Email + Address |

---

### 3. Lead Reactivation (The Money Print)

**Trigger:** Daily schedule (9 AM)

**Flow:**
```
Day 1, 9 AM
    ↓
Pull 50 leads: Status=Closed-Lost, LastContact > 90 days
    ↓
For Each Lead:
    ↓
    AI: Generate personalized SMS based on Loss Reason
    ↓
    Twilio: Send SMS
    ↓
    Airtable: Update record
    ↓

Day 2, 9:30 AM (24h later)
    ↓
Pull leads: SMS sent, No reply, No email yet
    ↓
SendGrid: Send follow-up email
```

**AI SMS Personalization:**
- Loss Reason: "Price too high" → Value offer angle
- Loss Reason: "Timing not right" → Timing check angle
- Loss Reason: "Went with competitor" → Service quality angle
- Seasonal awareness (summer = AC focus, winter = heating focus)

---

### 4. Reply Handler

**Trigger:** Twilio webhook for inbound SMS

**Flow:**
```
Customer Replies to SMS
    ↓
n8n: Parse message
    ↓
Quick STOP check (bypass AI for obvious unsubscribes)
    ↓
AI: Classify Intent
    ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ INTERESTED  │NOT_INTERESTED│   STOP      │  QUESTION   │
│             │             │             │             │
│ Vapi Call   │ Nurture     │ Add to DNC  │ Alert       │
│ Immediately │ Later       │ List        │ Manager     │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

---

## 🎙️ Vapi Assistant Configuration

### Inbound Receptionist

**Voice:** ElevenLabs "Rachel" (warm, professional)
**Model:** GPT-4o (best for conversation)
**Key Behaviors:**
- Never admits to being AI
- Uses contractions and filler words
- Empathizes with HVAC problems
- Handles diagnostic fee objection smoothly
- Detects emergencies and escalates

### Outbound Booking Agent

**Voice:** Same as inbound (brand consistency)
**Key Behaviors:**
- Short, punchy opener (respect their time)
- Assumes the sale (confident scheduling)
- Handles "I'm busy" gracefully
- Leaves effective voicemails
- Triggers follow-up SMS after voicemail

### Emergency Dispatcher

**Voice:** Slightly faster pace, more urgent
**Key Behaviors:**
- Safety-first (gas smell = evacuate)
- Offers ONE slot, not multiple options
- Takes charge of stressed callers
- Shorter conversation, faster booking

---

## 💰 Pricing & ROI Calculator

### Monthly Costs (Estimated)

| Service | Usage | Cost |
|---------|-------|------|
| Vapi | 500 minutes | ~$75 |
| Twilio SMS | 1,000 messages | ~$15 |
| OpenAI | Lead scoring + personalization | ~$20 |
| SendGrid | 500 emails | Free tier |
| Airtable | Database | Free tier |
| n8n | Self-hosted or $20/mo cloud | $0-20 |
| **Total** | | **~$110-130/mo** |

### ROI Example

```
Before Harmonia:
- 30% of calls go to voicemail
- Average lead response time: 4 hours
- Closed-lost leads: Never recontacted

After Harmonia:
- 0% missed calls (AI answers 24/7)
- Lead response time: <10 seconds
- Closed-lost reactivation: 50 leads/day

Math:
- 1 extra booking/week from AI answering = $150 diagnostic
- 1 install/month from reactivation = $8,000
- Annual value: $150 × 52 + $8,000 × 12 = $103,800
- Annual cost: $130 × 12 = $1,560
- ROI: 6,553%
```

---

## 🔧 Customization Guide

### Changing the Diagnostic Fee

1. Update `.env`: `DIAGNOSTIC_FEE="99"`
2. Update Vapi assistant prompts (search for `diagnosticFee`)
3. Redeploy assistants: `node deploy-vapi-assistants.js`

### Adding a New Lead Source

1. Add normalization logic in `05-set-and-save.json` → "Normalize Lead Data" node
2. Add source to lead scoring in "Calculate Lead Score" node
3. Test with `test-webhooks.sh`

### Changing Business Hours

1. Update `.env`: `BUSINESS_HOURS_START` and `BUSINESS_HOURS_END`
2. Modify availability query in workflows if needed

### Adding New Languages

1. Create new Vapi assistant with translated prompts
2. Add language detection in n8n workflow
3. Route to appropriate assistant based on caller preference

---

## 🚨 Emergency Handling

Harmonia prioritizes safety. When these keywords are detected:

**Immediate Evacuation Required:**
- Gas smell
- Burning smell
- Smoke
- Carbon monoxide alarm

**AI Response:** "I need you to stop. If you're smelling gas, please leave the house immediately and call 911. Your safety is the most important thing."

**High Priority (Same-Day):**
- No heat (in winter)
- No AC (in summer)
- Water leak
- System completely stopped

**AI Response:** Bypasses normal flow, alerts tech lead, offers first available emergency slot.

---

## 📈 Metrics to Track

### In Airtable
- Lead Score distribution
- Conversion rate by source
- Reactivation success rate
- Time to first contact

### In n8n
- Workflow execution success rate
- API error rates
- Average execution time

### In Vapi
- Call duration
- Booking conversion rate
- Voicemail rate

### In ServiceTitan
- Bookings created by "Harmonia AI"
- Revenue from AI-booked appointments

---

## 🆘 Support & Resources

- **Vapi Documentation:** https://docs.vapi.ai
- **n8n Documentation:** https://docs.n8n.io
- **ServiceTitan Developer Portal:** https://developer.servicetitan.io
- **Twilio Documentation:** https://www.twilio.com/docs

---

## 📄 License

This system is provided as-is for educational and commercial use. Customize freely for your HVAC business.

---

**Built with 🔥 for HVAC companies who refuse to miss another lead.**
