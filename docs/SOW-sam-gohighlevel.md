# Scope of Work: SAM AI Receptionist — GoHighLevel (GHL) Integration

> **Version:** 1.0
> **Date:** 2026-02-18
> **Project:** Harmonia — SAM HVAC AI Receptionist
> **CRM Target:** GoHighLevel (GHL)
> **Prepared For:** Implementation Engineer

---

## 1. Executive Summary

Build a production-ready integration between the SAM AI Voice Receptionist (Vapi + GPT-4o + ElevenLabs) and GoHighLevel's all-in-one CRM/marketing platform. Unlike the Housecall Pro integration (which replaces a field-service CRM), GHL is a marketing-first platform — so this integration must bridge GHL's contact/pipeline/calendar model to SAM's HVAC-specific dispatch workflow.

**Key Difference from HCP SOW:** GoHighLevel doesn't have native field-service concepts (jobs, dispatch, technician routing). The engineer must map SAM's booking flow onto GHL's **Calendars + Pipelines + Opportunities** model. GHL's strength is its built-in marketing automation (SMS, email, funnels) — this integration should leverage those where they overlap with Harmonia's existing capabilities.

**Deliverable:** A fully functional SAM instance connected to GHL that answers inbound calls 24/7, creates/updates contacts, checks calendar availability, books appointments via GHL calendars, moves contacts through pipeline stages, and triggers GHL automations — while maintaining SAM's full persona and HVAC-specific behavior.

---

## 2. Current System Architecture (Reference)

Same as the HCP SOW — the engineer's job is to **swap the CRM layer**. Everything below already exists and should NOT be rebuilt.

### What Already Exists (DO NOT Rebuild)

| Component | Status | Details |
|-----------|--------|---------|
| SAM Voice AI (Vapi) | Built | 3 assistants: inbound receptionist, outbound booking, emergency dispatcher |
| SAM Knowledge Base | Built | 502-line persona doc with call flows, objection handling, emergency protocols |
| n8n Workflow Engine | Built | 5 core workflows + 8 agency acquisition workflows |
| Lead Scoring Algorithm | Built | 0-100 scoring with HOT/WARM/COOL/COLD tiers |
| Twilio SMS | Built | Confirmation texts, reply handling, DNC compliance |
| SendGrid Email | Built | Follow-up email sequences |
| Google Sheets Logging | Built | 4-sheet schema (Call_Log, Appointments, Leads, Daily_Analytics) |

### What Needs to Be Built (This SOW)

| Component | Work Required |
|-----------|---------------|
| GHL Contact Lookup/Create | New n8n nodes hitting GHL Contacts API |
| GHL Calendar Availability | New n8n nodes hitting GHL Calendars API |
| GHL Appointment Booking | New n8n nodes to create calendar events in GHL |
| GHL Pipeline/Opportunity | Move contacts through sales pipeline stages |
| GHL Webhook Receivers | Ingest GHL events (appointment status, pipeline changes) |
| GHL → Harmonia SMS Decision | Decide which system sends SMS (GHL native vs. Twilio) |
| n8n Credential Config | API key or OAuth2 setup for GHL |
| Data Mapping Layer | Translate SAM's HVAC schema to GHL's marketing-CRM model |

---

## 3. SAM Persona Specs (Immutable — Do Not Modify)

Identical to the HCP SOW. These are **locked**.

### 3.1 Identity

- **Name:** Sam
- **Role:** Senior Dispatcher at {{companyName}}
- **Personality:** Warm, professional, efficient, genuinely helpful
- **Critical Rule:** SAM never identifies as AI

### 3.2 Call Flow (7 Phases)

| Phase | Duration | SAM Behavior | GHL Integration Required |
|-------|----------|--------------|--------------------------|
| 1. Greeting | 5-10s | "Thank you for calling {{companyName}}, this is Sam..." | None |
| 2. Issue Discovery | 30-90s | Empathy + clarifying questions | None |
| 3. Qualification | 30-60s | Name, phone, address, homeowner status | **GHL Contact Lookup** (by phone) |
| 4. Availability & Booking | 60-90s | "Let me check what we have open..." | **GHL Calendar Availability** → **GHL Appointment Creation** |
| 5. Fee Discussion | If asked | Diagnostic fee handling + objection scripts | None |
| 6. Confirmation | 20-30s | Recap appointment details | **GHL Opportunity** created/updated |
| 7. Closing | 5-10s | "Stay comfortable!" | **SMS confirmation** (GHL native or Twilio) |

### 3.3 Emergency Protocol

Same as HCP SOW — gas/CO/fire = evacuate + 911, log emergency, alert staff. No GHL appointment created for emergencies.

### 3.4 Data SAM Collects (Every Call)

| Field | GHL Mapping Required | Notes |
|-------|---------------------|-------|
| caller_name | `contact.firstName` + `contact.lastName` | Split on space |
| caller_phone | `contact.phone` | E.164 format |
| service_address | `contact.address1`, `contact.city`, `contact.state`, `contact.postalCode` | GHL has flat address fields |
| issue_description | `contact.customField.issue_description` OR `opportunity.name` | Custom field required |
| issue_category | `contact.tags[]` | "hvac-heating" / "hvac-cooling" etc. |
| urgency_level | `contact.tags[]` + `opportunity.pipeline_stage` | Map to pipeline stages |
| homeowner_status | `contact.customField.homeowner_status` | Custom field required |
| email (optional) | `contact.email` | Direct |

---

## 4. GoHighLevel API Integration Specs

### 4.1 Authentication

| Item | Detail |
|------|--------|
| Auth Method | API Key (Location-level) or OAuth2 (Agency-level) |
| Base URL | `https://services.leadconnectorhq.com` (GHL API v2) |
| Rate Limits | 100 requests/10 seconds (burst), then throttled |
| Required Scopes (OAuth2) | contacts.readonly, contacts.write, calendars.readonly, calendars.write, opportunities.readonly, opportunities.write, locations.readonly |
| API Key Header | `Authorization: Bearer {api_key}` + `Version: 2021-07-28` |

**n8n Implementation:** Create an HTTP Header Auth credential in n8n. For agency-level deployments, use OAuth2 with location switching.

### 4.2 GHL Concepts → HVAC Mapping

GHL doesn't think in "jobs" and "dispatch." Here's the conceptual mapping:

| HVAC Concept | GHL Equivalent | Notes |
|-------------|----------------|-------|
| Customer | Contact | GHL contacts have custom fields for HVAC-specific data |
| Job/Booking | Calendar Event (Appointment) | GHL calendars with appointment slots |
| Job Type | Calendar (separate calendars per type) | e.g., "HVAC Diagnostic", "HVAC Maintenance" |
| Technician | Team Member / Calendar Resource | Assign via calendar or round-robin |
| Lead Score | Opportunity Pipeline Stage | HOT/WARM/COOL/COLD = Pipeline stages |
| Dispatch Status | Pipeline Stage Progression | Scheduled → Confirmed → En Route → Completed |
| Service History | Contact Notes + Custom Fields | No native job history — use custom fields |

### 4.3 API Endpoints to Implement

#### 4.3.1 Contact Lookup

**Purpose:** Check if caller exists as a GHL contact.

```
GET /contacts/lookup?phone={phone}&locationId={locationId}
```

OR search:

```
GET /contacts/?query={phone}&locationId={locationId}
```

**n8n Node:** HTTP Request
**Trigger:** Phase 3 of call flow

**Response Handling:**
| Scenario | Action |
|----------|--------|
| Contact found | Return contact ID, name, tags, custom fields, last appointment |
| Contact NOT found | Queue creation for after booking confirmation |
| Multiple matches | Return most recently updated contact |

**SAM Behavior on Match:**
```
"Welcome back! Let me pull up your account... I see we last helped
you with [issue from custom field]. Is this related, or something new?"
```

#### 4.3.2 Contact Creation

**Purpose:** Create a new GHL contact for first-time callers.

```
POST /contacts/
```

**Payload:**
```json
{
  "locationId": "{ghl_location_id}",
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+16025551234",
  "email": "john@email.com",
  "address1": "123 Main St",
  "city": "Phoenix",
  "state": "AZ",
  "postalCode": "85001",
  "source": "Harmonia AI",
  "tags": ["harmonia-ai", "inbound-call", "hvac-cooling"],
  "customFields": [
    {
      "key": "homeowner_status",
      "field_value": "owner"
    },
    {
      "key": "issue_description",
      "field_value": "AC not cooling - warm air only"
    },
    {
      "key": "system_age",
      "field_value": "12 years"
    },
    {
      "key": "urgency_level",
      "field_value": "high"
    },
    {
      "key": "lead_score",
      "field_value": "85"
    }
  ]
}
```

**Pre-Requisite:** Custom fields must be created in GHL BEFORE deployment. See Section 6 for required custom fields.

#### 4.3.3 Calendar Availability

**Purpose:** Get available appointment slots from GHL calendar.

```
GET /calendars/{calendarId}/free-slots
  ?startDate={timestamp_ms}
  &endDate={timestamp_ms}
  &timezone={tz}
```

**n8n Node:** HTTP Request → Code node (format slots)

**Critical Design Decision — Calendar Structure:**

| Option | Calendar Setup | Best For |
|--------|---------------|----------|
| A. Single calendar | One "HVAC Service" calendar with all slot types | Small operation, 1-3 techs |
| B. Multi-calendar | Separate calendars: "Diagnostic", "Maintenance", "Emergency" | Larger teams, different durations |
| C. Round-robin | Team calendar with auto-assignment | Multiple techs, balanced load |

**Recommendation:** Option B (multi-calendar) for most HVAC companies. Map SAM's `job_type` to the correct calendar ID.

**Calendar ID Mapping (configure per client):**

```bash
GHL_CALENDAR_DIAGNOSTIC=cal_abc123
GHL_CALENDAR_MAINTENANCE=cal_def456
GHL_CALENDAR_EMERGENCY=cal_ghi789
GHL_CALENDAR_INSTALL_ESTIMATE=cal_jkl012
```

**Output Format (to SAM) — same as HCP:**
```json
{
  "hasAvailability": true,
  "speakableSlots": "I have a technician available tomorrow between 8 and noon, or Thursday afternoon between 1 and 5. Which works better for you?",
  "slotsOffered": [
    {
      "displayTime": "Tomorrow, 8 AM - 12 PM",
      "isoStart": "2026-02-19T08:00:00-07:00",
      "isoEnd": "2026-02-19T12:00:00-07:00",
      "calendarId": "cal_abc123",
      "slotId": "slot_xyz"
    }
  ]
}
```

#### 4.3.4 Book Appointment

**Purpose:** Create a calendar appointment in GHL.

```
POST /calendars/events/appointments
```

**Payload:**
```json
{
  "calendarId": "{calendar_id}",
  "locationId": "{location_id}",
  "contactId": "{ghl_contact_id}",
  "startTime": "2026-02-19T08:00:00-07:00",
  "endTime": "2026-02-19T12:00:00-07:00",
  "title": "HVAC Diagnostic - John Smith",
  "appointmentStatus": "confirmed",
  "address": "123 Main St, Phoenix, AZ 85001",
  "notes": "Issue: AC not cooling, warm air only. System is 12 years old. Homeowner. Diagnostic fee $89 quoted. AI Booked by SAM.",
  "toNotify": true
}
```

**`toNotify: true`** — This tells GHL to fire its native appointment confirmation workflow (if configured). Decide whether to use GHL's native SMS or Harmonia's Twilio — see Section 5.

**Post-Booking Actions:**
1. Create/update GHL Opportunity (move to "Booked" stage)
2. Send SMS confirmation (GHL or Twilio — choose one, not both)
3. Log to Google Sheets `Appointments` sheet
4. Log to Google Sheets `Call_Log` sheet

#### 4.3.5 Create/Update Opportunity

**Purpose:** Track the lead through a sales pipeline in GHL.

```
POST /opportunities/
```

**Payload:**
```json
{
  "pipelineId": "{hvac_pipeline_id}",
  "locationId": "{location_id}",
  "name": "HVAC Diagnostic - John Smith - AC Issue",
  "stageId": "{booked_stage_id}",
  "contactId": "{ghl_contact_id}",
  "status": "open",
  "monetaryValue": 8900,
  "source": "Harmonia AI - Inbound Call",
  "customFields": [
    {
      "key": "issue_category",
      "field_value": "cooling"
    },
    {
      "key": "urgency",
      "field_value": "high"
    }
  ]
}
```

**Pipeline Stages (to create in GHL):**

| Stage Name | Stage ID (configure) | Trigger |
|------------|---------------------|---------|
| New Lead | `stage_new` | Contact created, no appointment |
| Appointment Booked | `stage_booked` | SAM books appointment |
| Appointment Confirmed | `stage_confirmed` | Customer confirms (SMS reply or GHL automation) |
| Service Completed | `stage_completed` | Tech marks job done (manual or HCP/ST sync) |
| Quote Sent | `stage_quoted` | If upsell/replacement quoted |
| Won | `stage_won` | Job paid/closed |
| Lost | `stage_lost` | No-show, cancelled, went with competitor |

#### 4.3.6 GHL Webhook Receiver

**Purpose:** Receive events FROM GHL to update Harmonia's state.

```
POST /webhook/ghl-events
```

**GHL Webhook Events to Subscribe:**

| Event | Action in Harmonia |
|-------|-------------------|
| `ContactCreate` | Sync to Google Sheets if not already logged |
| `AppointmentCreate` | Confirm in Sheets, send Twilio SMS if GHL SMS disabled |
| `AppointmentUpdate` | Update Sheets (reschedule, cancel) |
| `OpportunityStageUpdate` | Update lead status in Sheets |
| `InboundMessage` | Route to Reply Handler workflow if SMS |
| `ContactTagUpdate` | Sync tags to Sheets |

---

## 5. SMS Strategy: GHL Native vs. Twilio

This is a critical architectural decision.

### Option A: Use GHL's Built-in SMS (Recommended for GHL-heavy clients)

| Pros | Cons |
|------|------|
| All communication in one GHL thread | Less control over timing/content |
| GHL conversation view unified | GHL SMS costs may be higher |
| GHL automations can trigger follow-ups | Relies on GHL's delivery infrastructure |
| Client already paying for GHL SMS | Harder to customize from n8n |

**Implementation:** After booking, trigger a GHL workflow via API that sends the confirmation SMS. Disable Harmonia's Twilio confirmation node.

```
POST /contacts/{contactId}/workflow/{workflowId}
```

### Option B: Keep Twilio (Recommended for Harmonia-first deployments)

| Pros | Cons |
|------|------|
| Full control over message content/timing | Two SMS threads for the customer |
| Already built and tested | GHL conversation view misses Twilio messages |
| Consistent across CRM backends | Client pays for both GHL + Twilio |
| n8n has direct Twilio integration | |

**Implementation:** Keep existing Twilio SMS confirmation flow. Disable GHL's `toNotify` on appointment creation.

### Recommendation

**Default to Option B (Twilio)** for initial deployment — it's already built, tested, and CRM-agnostic. Offer Option A as a Phase 2 enhancement for clients who want everything in GHL.

---

## 6. GHL Setup Requirements (Pre-Deployment)

The following must be configured in the client's GHL account BEFORE the engineer begins integration work.

### 6.1 Custom Fields (Contact Level)

| Field Name | Field Key | Type | Options |
|-----------|-----------|------|---------|
| Homeowner Status | `homeowner_status` | Dropdown | Owner, Renter, Property Manager, Business |
| Issue Description | `issue_description` | Multi-line Text | — |
| Issue Category | `issue_category` | Dropdown | Heating, Cooling, Both, Maintenance, Installation, Emergency, Other |
| Urgency Level | `urgency_level` | Dropdown | Emergency, Urgent, High, Normal, Low |
| System Age | `system_age` | Text | — |
| System Brand | `system_brand` | Text | — |
| Lead Score | `lead_score` | Number | — |
| Lead Temperature | `lead_temperature` | Dropdown | Hot, Warm, Cool, Cold |
| Diagnostic Fee Quoted | `diagnostic_fee` | Number | — |
| Last Service Date | `last_service_date` | Date | — |
| Service Address | `service_address_full` | Text | (if different from contact address) |

### 6.2 Calendars

| Calendar Name | Duration | Type | Purpose |
|--------------|----------|------|---------|
| HVAC Diagnostic | 4 hrs (window) | Round-robin or Assigned | Standard diagnostic calls |
| HVAC Maintenance | 2 hrs | Round-robin | Tune-ups, maintenance |
| HVAC Emergency | 2 hrs | First-available | After-hours/urgent |
| HVAC Install Estimate | 2 hrs | Assigned | New system consultations |

### 6.3 Pipeline

| Pipeline Name | Stages |
|--------------|--------|
| HVAC Service Pipeline | New Lead → Appointment Booked → Confirmed → Service Completed → Quote Sent → Won → Lost |

### 6.4 Tags (Standardized)

```
harmonia-ai, inbound-call, outbound-call
hvac-heating, hvac-cooling, hvac-maintenance, hvac-emergency, hvac-install
lead-hot, lead-warm, lead-cool, lead-cold
homeowner, renter, property-manager
diagnostic-booked, no-book, callback-requested
```

### 6.5 Workflow Automations (Optional — Phase 2)

| GHL Workflow | Trigger | Action |
|-------------|---------|--------|
| Appointment Reminder | 24 hrs before appointment | SMS + Email reminder |
| No-Show Follow-Up | Appointment marked no-show | SMS + call task created |
| Review Request | Opportunity → Won | SMS with Google review link |
| Re-engagement | Contact inactive 90 days | Add to reactivation campaign |

---

## 7. n8n Workflow Modifications

### 7.1 Workflows to Modify

| Workflow | File | Changes Required |
|----------|------|------------------|
| Voice Receptionist | `workflows/01-voice-receptionist.json` | Replace ServiceTitan nodes with GHL API calls |
| Set & Save | `workflows/05-set-and-save.json` | Replace ST lead creation with GHL contact + opportunity |
| Reply Handler | `workflows/04-reply-handler.json` | Route SMS replies → GHL contact update + opportunity stage |

### 7.2 Workflows That Need No Changes

| Workflow | File | Reason |
|----------|------|--------|
| Lead Reactivation SMS | `workflows/02-lead-reactivation-sms.json` | Reads from Sheets, not CRM — OR optionally migrate to GHL campaigns (Phase 2) |
| Lead Reactivation Email | `workflows/03-lead-reactivation-email.json` | SendGrid only — OR optionally migrate to GHL email (Phase 2) |

### 7.3 New n8n Nodes Required

| Node Name | Type | Purpose |
|-----------|------|---------|
| GHL: Lookup Contact | HTTP Request | GET /contacts/lookup by phone |
| GHL: Create Contact | HTTP Request | POST /contacts with custom fields |
| GHL: Update Contact | HTTP Request | PUT /contacts/{id} |
| GHL: Get Calendar Slots | HTTP Request | GET /calendars/{id}/free-slots |
| GHL: Book Appointment | HTTP Request | POST /calendars/events/appointments |
| GHL: Create Opportunity | HTTP Request | POST /opportunities |
| GHL: Update Opportunity Stage | HTTP Request | PUT /opportunities/{id}/status |
| GHL: Format Slots | Code (JS) | Convert GHL free-slots → speakable text |
| GHL: Map Data | Code (JS) | Translate SAM fields ↔ GHL fields |
| GHL: Error Handler | If/Switch | Handle API errors, trigger fallbacks |
| GHL: Add Tags | HTTP Request | POST /contacts/{id}/tags |

### 7.4 Vapi Webhook Handler Updates

Function names stay the same — backend changes:

| Vapi Function | Current Backend | New Backend |
|---------------|-----------------|-------------|
| `check_availability` | ServiceTitan API | GHL Calendar API |
| `book_appointment` | ServiceTitan API | GHL Calendar + Opportunity API |
| `lookup_customer` | ServiceTitan API | GHL Contacts API |
| `transfer_to_human` | n8n routing (unchanged) | n8n routing (unchanged) |

---

## 8. Data Mapping Reference

### SAM → GoHighLevel Field Mapping

| SAM Field | GHL Field | Transform |
|-----------|-----------|-----------|
| `caller_name` | `contact.firstName` + `contact.lastName` | Split on first space |
| `caller_phone` | `contact.phone` | Ensure E.164 |
| `service_address` | `contact.address1` | Direct |
| `city` | `contact.city` | Direct |
| `state` | `contact.state` | 2-letter code |
| `zip_code` | `contact.postalCode` | 5-digit |
| `email` | `contact.email` | Direct (optional) |
| `issue_description` | `contact.customFields.issue_description` | Free text |
| `issue_category` | `contact.tags[]` | "hvac-heating" / "hvac-cooling" etc. |
| `urgency_level` | `contact.customFields.urgency_level` + `contact.tags[]` | Dropdown + tag |
| `homeowner_status` | `contact.customFields.homeowner_status` | Dropdown value |
| `diagnostic_fee_quoted` | `opportunity.monetaryValue` | Cents (8900 = $89) |
| `call_outcome` | `opportunity.stageId` + `contact.tags[]` | Map to pipeline stage |
| `lead_source` | `contact.source` | "Harmonia AI" |
| `lead_score` | `contact.customFields.lead_score` | 0-100 integer |
| `lead_tier` | `contact.customFields.lead_temperature` + `contact.tags[]` | HOT/WARM/COOL/COLD |

### Call Outcome → GHL Pipeline Stage Mapping

| SAM Outcome | GHL Pipeline Stage | GHL Tags Added |
|-------------|-------------------|----------------|
| booked | Appointment Booked | `diagnostic-booked` |
| callback | New Lead | `callback-requested` |
| no_book (price) | New Lead | `no-book`, `objection-price` |
| no_book (timing) | New Lead | `no-book`, `objection-timing` |
| transfer | (no opportunity) | `transferred` |
| emergency | (no opportunity) | `hvac-emergency` |

---

## 9. Error Handling & Fallbacks

### API Failure Scenarios

| Scenario | SAM Says | System Does |
|----------|----------|-------------|
| GHL API timeout | "Let me check on that..." (natural pause, retry) | Retry 1x with 3s delay |
| GHL API down | "I'm having a little trouble pulling up the schedule. Let me take your info and have someone call you back within 15 minutes." | Log lead to Sheets, alert manager |
| No calendar slots | "We're fully booked for the next couple days, but I can have our manager call you back today to work something out." | Create contact + opportunity (New Lead stage), set callback tag |
| Contact creation fails | (Transparent to caller) | Log error, queue for manual creation |
| Appointment creation fails | "I've noted all your information. You'll get a confirmation text shortly." | Queue for manual booking, alert dispatch |
| Rate limited (429) | (Transparent — retry after backoff) | Exponential backoff: 1s, 2s, 4s |

---

## 10. Testing Requirements

### 10.1 Unit Tests (Per Node)

| Test | Input | Expected Output |
|------|-------|-----------------|
| Contact lookup — existing | Phone: +16025551234 | Returns contact with ID, tags, custom fields |
| Contact lookup — new | Phone: +16025559999 | Returns empty, triggers create flow |
| Contact creation | Full SAM data payload | Creates contact with all custom fields + tags |
| Calendar availability — slots | Date: tomorrow, calendar: diagnostic | Returns 2-3 formatted slots |
| Calendar availability — none | Fully booked calendar | Returns "no availability" |
| Appointment booking | Valid contact + slot | Returns appointment ID |
| Opportunity creation | Contact ID + stage | Returns opportunity ID |
| Pipeline stage update | Opportunity ID → "Booked" | Stage updated successfully |

### 10.2 End-to-End Tests

| Test Scenario | How to Test |
|---------------|-------------|
| Full happy path | Call Vapi number → SAM answers → provide info → SAM checks GHL calendar → select slot → appointment created in GHL → contact tagged → opportunity created → SMS sent |
| Returning customer | Call from existing GHL contact phone → SAM references history from custom fields |
| Emergency call | Say "I smell gas" → evacuation protocol → emergency logged, no appointment |
| No availability | Call when calendar full → SAM offers callback → contact created with "callback-requested" tag |
| Fee objection | Ask about cost → SAM handles → still books → opportunity monetary value set |
| Pipeline progression | Book appointment → verify contact in "Appointment Booked" stage → manual: mark completed → verify "Service Completed" stage |

### 10.3 Acceptance Criteria

- [ ] SAM answers inbound calls within 3 rings
- [ ] Contact lookup against GHL completes in <2 seconds
- [ ] Calendar availability returns speakable slots in <3 seconds
- [ ] Appointment created in GHL within 5 seconds of customer confirming
- [ ] Contact created with all custom fields and correct tags
- [ ] Opportunity created and placed in correct pipeline stage
- [ ] SMS confirmation sent within 10 seconds (via Twilio or GHL)
- [ ] All calls logged to Google Sheets regardless of outcome
- [ ] Emergency protocol fires correctly on trigger words
- [ ] Graceful fallback when GHL API is unavailable
- [ ] SAM never reveals it's an AI or mentions system errors

---

## 11. Environment Variables

Add these to the existing `.env` configuration:

```bash
# GoHighLevel
GHL_API_KEY=your-ghl-api-key
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_LOCATION_ID=your-location-id
GHL_PIPELINE_ID=your-hvac-pipeline-id

# GHL Pipeline Stage IDs
GHL_STAGE_NEW_LEAD=stage_id_new
GHL_STAGE_BOOKED=stage_id_booked
GHL_STAGE_CONFIRMED=stage_id_confirmed
GHL_STAGE_COMPLETED=stage_id_completed
GHL_STAGE_QUOTED=stage_id_quoted
GHL_STAGE_WON=stage_id_won
GHL_STAGE_LOST=stage_id_lost

# GHL Calendar IDs
GHL_CALENDAR_DIAGNOSTIC=cal_id_diagnostic
GHL_CALENDAR_MAINTENANCE=cal_id_maintenance
GHL_CALENDAR_EMERGENCY=cal_id_emergency
GHL_CALENDAR_INSTALL_ESTIMATE=cal_id_install

# GHL Custom Field Keys
GHL_CF_HOMEOWNER=custom_field_key_homeowner
GHL_CF_ISSUE_DESC=custom_field_key_issue
GHL_CF_ISSUE_CATEGORY=custom_field_key_category
GHL_CF_URGENCY=custom_field_key_urgency
GHL_CF_LEAD_SCORE=custom_field_key_score
GHL_CF_LEAD_TEMP=custom_field_key_temp
GHL_CF_SYSTEM_AGE=custom_field_key_age
GHL_CF_DIAG_FEE=custom_field_key_fee

# SMS Strategy
GHL_SMS_ENABLED=false  # true = use GHL SMS, false = use Twilio
GHL_CONFIRM_WORKFLOW_ID=workflow_id_for_sms  # only if GHL_SMS_ENABLED=true
```

---

## 12. Deliverables Checklist

| # | Deliverable | Priority |
|---|-------------|----------|
| 1 | GHL API credential configured in n8n | P0 |
| 2 | GHL custom fields created (11 fields) | P0 |
| 3 | GHL calendars created (4 calendars) | P0 |
| 4 | GHL pipeline + stages created | P0 |
| 5 | Contact lookup node (by phone) | P0 |
| 6 | Contact creation node (with custom fields + tags) | P0 |
| 7 | Calendar availability node + slot formatter | P0 |
| 8 | Appointment booking node | P0 |
| 9 | Opportunity create/update nodes | P0 |
| 10 | Voice Receptionist workflow updated (01) | P0 |
| 11 | Set & Save workflow updated (05) | P1 |
| 12 | Data mapping layer (SAM ↔ GHL) | P0 |
| 13 | Error handling + fallback flows | P0 |
| 14 | SMS strategy implemented (GHL or Twilio) | P1 |
| 15 | End-to-end test — happy path | P0 |
| 16 | End-to-end test — edge cases | P1 |
| 17 | GHL webhook receiver (appointment/pipeline events) | P2 |
| 18 | Reply Handler workflow updated (04) | P2 |
| 19 | GHL native automations setup (reminders, reviews) | P2 |
| 20 | Documentation / runbook | P2 |

---

## 13. Estimated Level of Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| GHL Account Setup | Custom fields, calendars, pipeline, tags | 3-5 hrs |
| API Setup | Credentials, n8n config, test connectivity | 2-3 hrs |
| Core Integration | Contact CRUD, calendar availability, appointment booking | 10-14 hrs |
| Pipeline/Opportunity | Create + stage management logic | 4-6 hrs |
| Workflow Updates | Modify workflows 01, 05, 04 | 6-8 hrs |
| Data Mapping | Field translation + custom field handling | 4-5 hrs |
| Error Handling | Fallback flows, retry logic, alerting | 4-6 hrs |
| SMS Strategy | Implement chosen approach, test delivery | 2-3 hrs |
| Testing | Unit + E2E + UAT | 8-10 hrs |
| **Total** | | **43-60 hrs** |

**Note:** GHL integration is ~40% more effort than HCP due to the conceptual mapping (no native FSM), custom field setup, and pipeline management overhead.

---

## 14. Dependencies & Assumptions

### Dependencies
- Active GoHighLevel account (Agency or Sub-account level)
- GHL API key or OAuth2 credentials provided before work starts
- GHL account has Calendars, Pipelines, and Custom Fields features enabled
- Existing Harmonia n8n instance accessible
- Vapi account with SAM assistant deployed (ID: `10c0b569-2b59-48ca-a6cd-aa36ba1f8132`)
- Twilio number configured (if using Twilio SMS strategy)

### Assumptions
- GHL API v2 is stable and documented
- Client's GHL plan supports API access + custom fields + calendars + pipelines
- Custom fields can be created programmatically or are pre-configured by client/admin
- No existing GHL workflows will conflict with Harmonia's integration
- Google Sheets dual-write continues alongside GHL
- The HVAC company is willing to adopt the prescribed pipeline structure

---

## 15. Out of Scope

- Changes to SAM's persona, voice, or conversation flow
- GHL funnel/landing page design or setup
- GHL reputation management setup
- GHL social media integration
- Migrating existing data into GHL
- GHL mobile app customizations
- GHL membership/invoicing setup
- Multi-location GHL setup (single location per deployment)
- Outbound calling campaigns (separate SOW)
- Full migration of Twilio SMS → GHL SMS (Phase 2)
- Full migration of SendGrid Email → GHL Email (Phase 2)

---

## 16. Phase 2 Opportunities (Post-Initial Deployment)

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| GHL Native SMS | Migrate confirmations + follow-ups to GHL's SMS | 4-6 hrs |
| GHL Native Email | Migrate lead reactivation emails to GHL campaigns | 6-8 hrs |
| GHL Reputation Mgmt | Auto-request Google reviews after "Won" stage | 2-3 hrs |
| GHL Conversations | Route Twilio inbound SMS to GHL Conversations | 4-6 hrs |
| GHL Reporting | Custom dashboards in GHL for SAM performance metrics | 6-8 hrs |
| Multi-Location | Template the integration for rapid deployment across locations | 8-12 hrs |

---

*This SOW is based on the Harmonia project documentation, SAM HVAC Knowledge Base v1.0, the existing n8n workflow architecture, and GoHighLevel API v2 documentation. Refer to `knowledge-base/sam-hvac-knowledge.md` for the complete SAM persona reference.*
