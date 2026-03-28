# Harmonia Quick Start

## 5-Minute Overview

Harmonia is a complete AI automation system for HVAC companies built on n8n.

### What's Inside

```
Harmonia/
├── workflows/          ← Import these into n8n
├── vapi-assistants/    ← Deploy to Vapi
├── configs/            ← Your credentials go here
├── scripts/            ← Setup and testing tools
├── templates/          ← Database schemas
└── docs/               ← Full documentation
```

### Quick Setup

1. **Copy environment template:**
   ```bash
   cd configs && cp .env.example .env
   ```

2. **Fill in your credentials** (see `.env` file)

3. **Validate setup:**
   ```bash
   cd scripts && ./validate-env.sh
   ```

4. **Deploy Vapi assistants:**
   ```bash
   node deploy-vapi-assistants.js
   ```

5. **Import workflows into n8n:**
   - Open n8n → Workflows → Import
   - Import each JSON from `workflows/`

6. **Test:**
   ```bash
   ./test-webhooks.sh
   ```

### Core Workflows

| Workflow | What It Does |
|----------|--------------|
| `01-voice-receptionist` | Answers calls, books appointments |
| `02-lead-reactivation-sms` | Sends reactivation texts daily |
| `03-lead-reactivation-email` | Follows up with email after 24h |
| `04-reply-handler` | Processes SMS replies |
| `05-set-and-save` | Captures leads, scores them, calls immediately |

### Need Help?

- Full docs: `docs/README.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- API reference: `docs/API-REFERENCE.md`

---

**Built for HVAC. Powered by n8n + Vapi + ServiceTitan.**
