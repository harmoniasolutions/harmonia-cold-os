# HARMONIA

> AI-Powered Automation System for HVAC Companies

**Last Updated:** 2026-01-20

---

## What is Harmonia?

Harmonia is a complete AI automation system built on n8n that handles three critical HVAC business functions:

1. **Voice Receptionist** - 24/7 AI answers calls, qualifies leads, books appointments into ServiceTitan
2. **Set & Save** - Captures leads from Google LSA, Facebook, web forms → makes AI calls within 10 seconds
3. **Lead Reactivation** - Re-engages closed-lost leads with personalized SMS/email sequences

**ROI:** ~6,553% (costs $130-160/mo, generates $103,800+/year in recovered revenue)

---

## Project Structure

```
~/Desktop/Harmonia/
├── workflows/                          # Core n8n automation workflows
│   ├── 01-voice-receptionist.json      # Answers inbound calls via Vapi AI
│   ├── 02-lead-reactivation-sms.json   # Daily SMS to closed-lost leads
│   ├── 03-lead-reactivation-email.json # Follow-up emails 24h after SMS
│   ├── 04-reply-handler.json           # Processes SMS replies, manages DNC
│   └── 05-set-and-save.json            # Multi-source lead capture + AI calls
│
├── vapi-assistants/                    # Voice AI configurations
│   ├── inbound-receptionist.json       # Handles inbound customer calls
│   ├── outbound-booking.json           # Makes outbound calls to new leads
│   └── emergency-dispatcher.json       # Handles emergency situations
│
├── agency-acquisition/                 # B2B module for selling Harmonia
│   ├── workflows/
│   │   ├── 01-prospect-hunter.json     # Scrapes HVAC companies daily
│   │   ├── 02-cold-outreach-generator.json  # AI writes personalized emails
│   │   ├── 03-follow-up-sender.json    # Auto-sends follow-up sequences
│   │   ├── 04-reply-detector.json      # Monitors inbox, scores intent
│   │   ├── 05-meeting-booker.json      # Books meetings + Calendly
│   │   ├── 06-proposal-generator.json  # AI generates ROI proposals
│   │   ├── 07-deal-pipeline.json       # Daily briefings, deal tracking
│   │   └── 08-linkedin-outreach.json   # Multi-touch LinkedIn messages
│   ├── scripts/
│   │   └── cold-call-script.md         # Phone script with objection handling
│   └── SETUP-GUIDE.md                  # Agency module setup instructions
│
├── scripts/                            # Deployment & testing utilities
│   ├── deploy-vapi-assistants.js       # Deploy voice AI configs to Vapi
│   ├── validate-env.sh                 # Validate all credentials & APIs
│   └── test-webhooks.sh                # Test all webhook endpoints
│
├── configs/                            # Configuration templates
│   ├── .env.example                    # Environment variable template
│   └── n8n-credentials-setup.md        # Credential configuration guide
│
├── templates/                          # Database schemas
│   └── airtable-leads-schema.json      # Complete Airtable schema (4 tables)
│
├── docs/                               # Documentation
│   ├── README.md                       # Main system overview
│   ├── DEPLOYMENT.md                   # Step-by-step deployment guide
│   ├── API-REFERENCE.md                # Webhook & API reference
│   ├── TROUBLESHOOTING.md              # Common issues & solutions
│   └── SALES-DECK.md                   # B2B sales pitch materials
│
├── HVAC/Workflows/                     # User-specific workflows (empty)
├── QUICKSTART.md                       # 5-minute quick start guide
└── HARMONIA.md                         # This file
```

---

## How It Works

### Core HVAC Automation Flow

```
INBOUND CALLS                          OUTBOUND LEADS
     │                                      │
     ▼                                      ▼
┌─────────────────┐               ┌─────────────────┐
│ Voice           │               │ Set & Save      │
│ Receptionist    │               │ (10-sec calls)  │
└────────┬────────┘               └────────┬────────┘
         │                                 │
         ▼                                 ▼
    ┌─────────────────────────────────────────┐
    │           ServiceTitan CRM              │
    │    (Appointments, Customer Records)     │
    └─────────────────────────────────────────┘
                       │
                       ▼
              ┌───────────────┐
              │   Airtable    │
              │  Lead Tracker │
              └───────┬───────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│ Lead Reactivation│       │ Reply Handler   │
│ SMS + Email      │       │ (Intent Scoring)│
└─────────────────┘       └─────────────────┘
```

### Daily Automation Schedule

| Time | Action |
|------|--------|
| **Continuous** | Voice Receptionist answers inbound calls |
| **On trigger** | Set & Save captures leads, calls within 10 seconds |
| **9 AM** | Lead Reactivation SMS sends to 50 closed-lost leads |
| **+24 hours** | Follow-up emails sent to non-responders |
| **Every 5 min** | Reply Handler processes SMS responses |

### You Just Need To:
- Handle emergency escalations
- Review hot lead alerts
- Close complex sales
- Monitor dashboards

---

## Key Features

### Voice AI
- **GPT-4o powered** conversations with natural speech
- **ElevenLabs** voice synthesis (Rachel voice)
- **Real-time** ServiceTitan availability checking
- **Emergency detection** (gas leaks, no heat, etc.)

### Lead Scoring Algorithm
```
Base: 50 points
+ Homeowner:        +20
+ Old HVAC system:  +15
+ Emergency:        +25
+ High-value job:   +20
+ Google LSA:       +15
+ Complete info:    +10
- Renter:           -10

HOT:  >= 85  |  WARM: >= 70  |  COOL: >= 50  |  COLD: < 50
```

### Compliance
- DNC list management
- Automatic STOP handling
- Max 3 reactivation attempts
- TCPA-compliant formatting

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Workflow Engine | n8n (self-hosted or cloud) |
| Voice AI | Vapi + OpenAI GPT-4o + ElevenLabs |
| CRM | ServiceTitan API (REST, OAuth2) |
| Database | Airtable (4 tables) |
| SMS | Twilio |
| Email | SendGrid |
| Scripts | Node.js 18+, Bash |

---

## Agency Acquisition Module

For selling Harmonia to other HVAC companies:

```
~/Desktop/Harmonia/agency-acquisition/
├── workflows/
│   ├── 01-prospect-hunter.json       # Scrapes HVAC companies daily
│   ├── 02-cold-outreach-generator.json   # AI writes personalized emails
│   ├── 03-follow-up-sender.json      # Auto-sends email 2 & 3 on schedule
│   ├── 04-reply-detector.json        # Monitors inbox, scores intent
│   ├── 05-meeting-booker.json        # Books meetings + Calendly
│   ├── 06-proposal-generator.json    # AI generates ROI proposals
│   ├── 07-deal-pipeline.json         # Daily briefings, deal tracking
│   └── 08-linkedin-outreach.json     # Multi-touch LinkedIn messages
├── scripts/
│   └── cold-call-script.md           # Full phone script with objections
└── SETUP-GUIDE.md                    # Complete setup instructions
```

### Agency Automation Flow
1. **6 AM** - Prospect Hunter scrapes new HVAC companies (rotates cities)
2. **8 AM** - AI generates personalized email sequences for top prospects
3. **9 AM** - Follow-ups send automatically (day 3 & day 7)
4. **Every 15 min** - Reply detector scores responses, texts you hot leads
5. **10 AM** - Meeting booker reaches out to hot leads
6. **On demand** - Proposal generator creates custom ROI proposals

**Cost:** ~$50-150/mo for all APIs

---

## Monthly Costs

| Service | Cost |
|---------|------|
| n8n (cloud) | $20-50/mo |
| Vapi | $30-50/mo |
| OpenAI | $20-40/mo |
| Twilio | $20-30/mo |
| Airtable | Free-$20/mo |
| SendGrid | Free-$20/mo |
| **Total** | **$90-210/mo** |

---

## Quick Start

1. Clone/copy the Harmonia folder
2. Copy `configs/.env.example` to `.env` and fill in credentials
3. Run `scripts/validate-env.sh` to verify setup
4. Import workflows into n8n
5. Run `scripts/deploy-vapi-assistants.js` to deploy voice AI
6. Configure Airtable using `templates/airtable-leads-schema.json`
7. Test with `scripts/test-webhooks.sh`

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

---

## Documentation

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](QUICKSTART.md) | 5-minute setup guide |
| [docs/README.md](docs/README.md) | Full system overview |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 7-phase deployment guide |
| [docs/API-REFERENCE.md](docs/API-REFERENCE.md) | Webhook specs & payloads |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & fixes |

---

## File Registry & Change Protocol

> **PURPOSE:** Prevent duplicate files and ensure all changes are tracked. Before ANY edit or new file creation, follow this protocol.

### Change Protocol Checklist

Before making changes to any Harmonia file:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHANGE PROTOCOL WORKFLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CHECK REGISTRY                                               │
│     └─► Does this file already exist in the registry below?     │
│         • YES → Go to step 2                                     │
│         • NO  → Is there a similar file? Check "Related Files"  │
│                                                                  │
│  2. READ CURRENT STATE                                           │
│     └─► Read the existing file completely                        │
│     └─► Note: version, node count, key functions                 │
│     └─► Document current behavior                                │
│                                                                  │
│  3. ANALYZE IMPACT                                               │
│     └─► What nodes/functions will change?                        │
│     └─► What dependencies exist?                                 │
│     └─► Will this break other workflows?                         │
│     └─► List affected integrations                               │
│                                                                  │
│  4. PRESENT CHANGES TO USER                                      │
│     └─► Show: CURRENT STATE vs PROPOSED STATE                    │
│     └─► Highlight: What stays, what changes, what's new          │
│     └─► Risk level: Low/Medium/High                              │
│                                                                  │
│  5. EXECUTE (after approval)                                     │
│     └─► Make changes to EXISTING file (never duplicate)          │
│     └─► Update registry entry below                              │
│     └─► Update Session Log                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### File Registry

> **IMPORTANT:** Every file has a unique ID. NEVER create a new file if one with the same purpose exists.

#### Core Workflows

| ID | File | Version | Nodes | Key Functions | Last Modified | Related Files |
|----|------|---------|-------|---------------|---------------|---------------|
| W01 | `workflows/01-voice-receptionist.json` | 1.0 | ~15 | Vapi webhook, ServiceTitan lookup, appointment booking | 2026-01-20 | V01, V03 |
| W02 | `workflows/02-lead-reactivation-sms.json` | 1.0 | ~12 | Airtable query, AI personalization, Twilio send | 2026-01-20 | W04 |
| W03 | `workflows/03-lead-reactivation-email.json` | 1.0 | ~8 | SendGrid integration, follow-up logic | 2026-01-20 | W02 |
| W04 | `workflows/04-reply-handler.json` | 1.0 | ~18 | Intent classification, DNC management, callback routing | 2026-01-20 | W02, W03 |
| W05 | `workflows/05-set-and-save.json` | 1.0 | ~14 | Multi-source capture, lead scoring, Vapi outbound | 2026-01-20 | V02 |

#### Agency Workflows

| ID | File | Version | Nodes | Key Functions | Last Modified | Related Files |
|----|------|---------|-------|---------------|---------------|---------------|
| A01 | `agency-acquisition/workflows/01-prospect-hunter.json` | 1.0 | ~10 | Google Places scrape, pain point scoring | 2026-01-20 | A02 |
| A02 | `agency-acquisition/workflows/02-cold-outreach-generator.json` | 1.0 | ~8 | AI email generation, 3-email sequences | 2026-01-20 | A03 |
| A03 | `agency-acquisition/workflows/03-follow-up-sender.json` | 1.0 | ~6 | Scheduled email sends | 2026-01-20 | A02 |
| A04 | `agency-acquisition/workflows/04-reply-detector.json` | 1.0 | ~10 | Inbox monitoring, intent scoring | 2026-01-20 | A05 |
| A05 | `agency-acquisition/workflows/05-meeting-booker.json` | 1.0 | ~8 | Calendly integration, hot lead outreach | 2026-01-20 | A04 |
| A06 | `agency-acquisition/workflows/06-proposal-generator.json` | 1.0 | ~6 | ROI calculation, proposal PDF | 2026-01-20 | — |
| A07 | `agency-acquisition/workflows/07-deal-pipeline.json` | 1.0 | ~8 | Daily briefings, stale alerts | 2026-01-20 | A01-A06 |
| A08 | `agency-acquisition/workflows/08-linkedin-outreach.json` | 1.0 | ~6 | Multi-touch LinkedIn messages | 2026-01-20 | A01 |

#### Voice AI Configurations

| ID | File | Version | Functions | Voice/Model | Last Modified | Related Files |
|----|------|---------|-----------|-------------|---------------|---------------|
| V01 | `vapi-assistants/inbound-receptionist.json` | 1.0 | checkAvailability, bookAppointment, customerLookup, transferToHuman | Rachel/GPT-4o | 2026-01-20 | W01 |
| V02 | `vapi-assistants/outbound-booking.json` | 1.0 | Same as V01 + voicemail handling | Rachel/GPT-4o | 2026-01-20 | W05 |
| V03 | `vapi-assistants/emergency-dispatcher.json` | 1.0 | emergencyEscalation, safetyProtocol | Rachel (fast)/GPT-4o | 2026-01-20 | W01 |

#### Scripts & Configs

| ID | File | Version | Purpose | Last Modified | Related Files |
|----|------|---------|---------|---------------|---------------|
| S01 | `scripts/deploy-vapi-assistants.js` | 1.0 | Deploy V01-V03 to Vapi | 2026-01-20 | V01, V02, V03 |
| S02 | `scripts/validate-env.sh` | 1.0 | Verify all API credentials | 2026-01-20 | C01 |
| S03 | `scripts/test-webhooks.sh` | 1.0 | Test all webhook endpoints | 2026-01-20 | W01-W05 |
| S04 | `agency-acquisition/scripts/cold-call-script.md` | 1.0 | Phone sales script | 2026-01-20 | — |
| C01 | `configs/.env.example` | 1.0 | Environment template | 2026-01-20 | All |
| C02 | `configs/n8n-credentials-setup.md` | 1.0 | Credential guide | 2026-01-20 | W01-W05, A01-A08 |
| T01 | `templates/airtable-leads-schema.json` | 1.0 | Database schema | 2026-01-20 | W01-W05 |

#### Documentation

| ID | File | Version | Purpose | Last Modified | Related Files |
|----|------|---------|---------|---------------|---------------|
| D00 | `HARMONIA.md` | 1.1 | Master reference (this file) | 2026-01-20 | All |
| D01 | `QUICKSTART.md` | 1.0 | 5-min setup | 2026-01-20 | C01, S02 |
| D02 | `docs/README.md` | 1.0 | System overview | 2026-01-20 | — |
| D03 | `docs/DEPLOYMENT.md` | 1.0 | Deployment guide | 2026-01-20 | S01, S02, S03 |
| D04 | `docs/API-REFERENCE.md` | 1.0 | Webhook specs | 2026-01-20 | W01-W05 |
| D05 | `docs/TROUBLESHOOTING.md` | 1.0 | Issue solutions | 2026-01-20 | All |
| D06 | `docs/SALES-DECK.md` | 1.0 | Sales materials | 2026-01-20 | — |
| D07 | `agency-acquisition/SETUP-GUIDE.md` | 1.0 | Agency setup | 2026-01-20 | A01-A08 |

### Example: Modifying Voice Receptionist

If asked to modify the Voice Receptionist workflow, I will:

```
═══════════════════════════════════════════════════════════════════
CHANGE REQUEST: Modify Voice Receptionist
═══════════════════════════════════════════════════════════════════

📋 STEP 1: REGISTRY CHECK
   └─► File exists: W01 - workflows/01-voice-receptionist.json
   └─► Version: 1.0
   └─► Related: V01 (inbound-receptionist.json), V03 (emergency-dispatcher)

📖 STEP 2: CURRENT STATE
   ┌─────────────────────────────────────────────────────────────┐
   │ workflows/01-voice-receptionist.json                        │
   ├─────────────────────────────────────────────────────────────┤
   │ Nodes: 15                                                   │
   │ Trigger: Vapi webhook                                       │
   │ Functions:                                                  │
   │   • Customer lookup (ServiceTitan)                          │
   │   • Availability check (ServiceTitan)                       │
   │   • Appointment booking                                     │
   │   • Emergency detection → V03                               │
   │   • Human transfer                                          │
   │ Integrations: Vapi, ServiceTitan, Airtable                  │
   └─────────────────────────────────────────────────────────────┘

⚠️  STEP 3: IMPACT ANALYSIS
   ┌─────────────────────────────────────────────────────────────┐
   │ Proposed Change: [describe change here]                     │
   ├─────────────────────────────────────────────────────────────┤
   │ AFFECTED:                                                   │
   │   • Node X will be modified                                 │
   │   • Node Y will be added/removed                            │
   │                                                             │
   │ DEPENDENCIES:                                               │
   │   • V01 may need prompt update if behavior changes          │
   │   • Airtable schema may need new field                      │
   │                                                             │
   │ RISK LEVEL: [Low/Medium/High]                               │
   └─────────────────────────────────────────────────────────────┘

🔄 STEP 4: PROPOSED CHANGES
   ┌─────────────────────────────────────────────────────────────┐
   │ CURRENT                    →    PROPOSED                    │
   ├─────────────────────────────────────────────────────────────┤
   │ [current behavior]         →    [new behavior]              │
   │ [current node]             →    [modified node]             │
   └─────────────────────────────────────────────────────────────┘

   Approve changes? [Yes/No/Modify]

✅ STEP 5: EXECUTE & UPDATE REGISTRY
   └─► Edit W01 (never create W01-v2 or voice-receptionist-new)
   └─► Update version: 1.0 → 1.1
   └─► Update Last Modified date
   └─► Log in Session Log
═══════════════════════════════════════════════════════════════════
```

### Rules for File Management

1. **NEVER duplicate** - If `voice-receptionist.json` exists, edit it. Don't create `voice-receptionist-v2.json`
2. **ALWAYS check registry** - Before any file operation, consult the registry above
3. **UPDATE versions** - Increment version on each change (1.0 → 1.1 → 1.2)
4. **TRACK dependencies** - Note which files are affected by changes
5. **LOG everything** - Every change goes in the Session Log

### Quick Reference: File Lookup

```
Need to modify...          →  Check registry ID  →  Read file first
─────────────────────────────────────────────────────────────────────
Inbound calls              →  W01, V01           →  workflows/01-voice-receptionist.json
Outbound calls             →  W05, V02           →  workflows/05-set-and-save.json
SMS campaigns              →  W02                →  workflows/02-lead-reactivation-sms.json
Email follow-ups           →  W03                →  workflows/03-lead-reactivation-email.json
Reply handling             →  W04                →  workflows/04-reply-handler.json
Voice AI prompts           →  V01, V02, V03      →  vapi-assistants/*.json
Lead database              →  T01                →  templates/airtable-leads-schema.json
Agency prospecting         →  A01-A08            →  agency-acquisition/workflows/*.json
Environment setup          →  C01                →  configs/.env.example
```

---

## Digital Assets Inventory

> **Updated:** 2026-01-20

### Workflows (n8n JSON)

| File | Purpose | Status |
|------|---------|--------|
| `workflows/01-voice-receptionist.json` | Inbound call handling | Active |
| `workflows/02-lead-reactivation-sms.json` | Daily SMS campaigns | Active |
| `workflows/03-lead-reactivation-email.json` | Email follow-ups | Active |
| `workflows/04-reply-handler.json` | SMS reply processing | Active |
| `workflows/05-set-and-save.json` | Multi-source lead capture | Active |
| `agency-acquisition/workflows/01-prospect-hunter.json` | HVAC company scraping | Active |
| `agency-acquisition/workflows/02-cold-outreach-generator.json` | AI email generation | Active |
| `agency-acquisition/workflows/03-follow-up-sender.json` | Automated follow-ups | Active |
| `agency-acquisition/workflows/04-reply-detector.json` | Reply intent scoring | Active |
| `agency-acquisition/workflows/05-meeting-booker.json` | Meeting scheduling | Active |
| `agency-acquisition/workflows/06-proposal-generator.json` | ROI proposal creation | Active |
| `agency-acquisition/workflows/07-deal-pipeline.json` | Deal tracking | Active |
| `agency-acquisition/workflows/08-linkedin-outreach.json` | LinkedIn automation | Active |

### Voice AI Configurations

| File | Purpose | Status |
|------|---------|--------|
| `vapi-assistants/inbound-receptionist.json` | Inbound call AI | Active |
| `vapi-assistants/outbound-booking.json` | Outbound call AI | Active |
| `vapi-assistants/emergency-dispatcher.json` | Emergency handling AI | Active |

### Scripts & Utilities

| File | Purpose | Status |
|------|---------|--------|
| `scripts/deploy-vapi-assistants.js` | Vapi deployment script | Active |
| `scripts/validate-env.sh` | Environment validation | Active |
| `scripts/test-webhooks.sh` | Webhook testing | Active |
| `agency-acquisition/scripts/cold-call-script.md` | Sales call script | Active |

### Configuration Templates

| File | Purpose | Status |
|------|---------|--------|
| `configs/.env.example` | Environment template | Active |
| `configs/n8n-credentials-setup.md` | Credential setup guide | Active |
| `templates/airtable-leads-schema.json` | Database schema | Active |

### Documentation

| File | Purpose | Status |
|------|---------|--------|
| `HARMONIA.md` | Master reference (this file) | Active |
| `QUICKSTART.md` | Quick start guide | Active |
| `docs/README.md` | System overview | Active |
| `docs/DEPLOYMENT.md` | Deployment guide | Active |
| `docs/API-REFERENCE.md` | API documentation | Active |
| `docs/TROUBLESHOOTING.md` | Troubleshooting guide | Active |
| `docs/SALES-DECK.md` | Sales materials | Active |
| `agency-acquisition/SETUP-GUIDE.md` | Agency module setup | Active |

### Media Assets

| Type | Count | Notes |
|------|-------|-------|
| Images | 0 | None - system uses cloud services |
| Audio | 0 | None - ElevenLabs handles voice |
| Fonts | 0 | None - no custom fonts |
| Icons | 0 | None - no icon assets |

---

## File Statistics

| Category | Count | Lines/Size |
|----------|-------|------------|
| Core Workflows | 5 | ~2,409 lines |
| Agency Workflows | 8 | ~1,500 lines |
| Vapi Configs | 3 | ~250 lines |
| Documentation | 8 | ~2,451 lines |
| Scripts | 4 | ~333 lines |
| Config Templates | 3 | ~663 lines |
| **Total Files** | **33** | **424 KB** |

---

## Session Log

| Date | Changes Made |
|------|--------------|
| 2026-01-20 | Created HARMONIA.md - initial documentation and asset inventory |
| 2026-01-20 | Added File Registry & Change Protocol section with unique IDs, version tracking, dependency mapping, and 5-step change workflow |
| 2026-01-30 | Created SAM HVAC Knowledge Base (knowledge-base/sam-hvac-knowledge.md) - comprehensive receptionist reference |
| 2026-01-30 | Created Google Sheets Schema (templates/google-sheets-schema.md) - 4-sheet data structure for call logging |
| 2026-01-30 | Added Google Sheets integration to n8n workflow (3 nodes: Appointments, Leads, Call_Log) |
| 2026-01-30 | Updated SAM HVAC Vapi assistant with improved system prompt and tool usage guidelines |

---

*This file is the master reference for Harmonia. Update the Digital Assets Inventory and Session Log at the end of each session.*
