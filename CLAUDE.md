# Harmonia

AI-powered HVAC automation system for 24/7 lead capture, qualification, and appointment booking.

## What This Project Does

- **Voice Receptionist**: AI answers inbound calls via Vapi + GPT-4o + ElevenLabs
- **Set & Save**: Multi-source lead capture (Google LSA, Facebook, web forms) with instant outbound calls
- **Lead Reactivation**: SMS/email campaigns to closed-lost leads with intent classification
- **Agency Acquisition**: B2B sales automation for selling Harmonia to other HVAC companies

## Tech Stack

| Component | Technology |
|-----------|------------|
| Workflow Engine | n8n (self-hosted or cloud) |
| Voice AI | Vapi + GPT-4o + ElevenLabs |
| CRM | ServiceTitan (REST API) |
| Database | Airtable (4 tables) |
| SMS | Twilio |
| Email | SendGrid |
| Scripts | Node.js, Bash |

## Project Structure

```
workflows/           # 5 core n8n workflows (JSON)
vapi-assistants/     # 3 Vapi voice AI configs
agency-acquisition/  # B2B sales module (8 workflows)
scripts/             # Deployment & testing utilities
configs/             # Environment templates
templates/           # Airtable schema
docs/                # Full documentation
```

## Key Files

- `workflows/05-set-and-save.json` - Main lead capture workflow
- `workflows/01-voice-receptionist.json` - Inbound call handling
- `vapi-assistants/inbound-receptionist.json` - Voice AI config
- `scripts/deploy-vapi-assistants.js` - Deploy assistants to Vapi
- `scripts/validate-env.sh` - Validate all credentials

## Common Commands

```bash
# Validate environment setup
./scripts/validate-env.sh

# Deploy Vapi assistants
node scripts/deploy-vapi-assistants.js

# Test webhooks
./scripts/test-webhooks.sh
```

## Webhook Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/webhook/lead-intake` | Multi-source lead capture |
| `/webhook/twilio-inbound-sms` | SMS reply handling |
| `/webhook/vapi-inbound` | Inbound call events |

## Lead Scoring

- HOT (>=85): Immediate Vapi call
- WARM (>=70): Priority outreach
- COOL (>=50): Nurture sequence
- COLD (<50): Storage/re-engagement

## Agent Behavior

- **Dangerously accept command**: When suggesting terminal commands (e.g. running scripts, `npm install`, validations, deploys), Claude may treat them as accepted and run them without asking for permission each time, as long as the command is appropriate for the Harmonia project and current task.

## Important Notes

- Voice AI identifies as "Sam, Senior Dispatcher" (not AI)
- Emergency detection triggers immediate alerts (gas smell = 911)
- All SMS campaigns are TCPA-compliant with DNC handling
- ServiceTitan integration creates appointments in real-time
