# Scope of Work: SAM AI Receptionist — Housecall Pro Integration

> **Version:** 1.0
> **Date:** 2026-02-18
> **Project:** Harmonia — SAM HVAC AI Receptionist
> **CRM Target:** Housecall Pro (HCP)
> **Prepared For:** Implementation Engineer

---

## 1. Executive Summary

Build a production-ready integration between the SAM AI Voice Receptionist (Vapi + GPT-4o + ElevenLabs) and Housecall Pro's CRM/FSM platform. The engineer will adapt Harmonia's existing n8n workflow engine to read/write against Housecall Pro's REST API instead of ServiceTitan, while preserving SAM's full persona, call flows, and business logic.

**Deliverable:** A fully functional SAM instance that answers inbound calls 24/7, qualifies HVAC leads, checks real-time HCP availability, books jobs directly into Housecall Pro, and logs all activity — requiring zero code changes from the HVAC company end-user.

---

## 2. Current System Architecture (Reference)

The existing Harmonia system is already built and working. The engineer's job is to **swap the CRM layer** — everything else stays the same.

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
| HCP Customer Lookup | New n8n nodes hitting HCP API |
| HCP Availability Check | New n8n nodes hitting HCP dispatch/scheduling API |
| HCP Job/Booking Creation | New n8n nodes to create jobs in HCP |
| HCP Customer Creation | New n8n nodes for new customer records |
| HCP Webhook Receivers | Ingest HCP events (job status changes, etc.) |
| n8n Credential Config | OAuth2 or API key setup for HCP |
| Data Mapping Layer | Translate SAM's data schema to/from HCP field names |

---

## 3. SAM Persona Specs (Immutable — Do Not Modify)

The engineer must understand SAM's behavior to ensure the CRM integration supports it correctly. These specs are **locked** — the integration must conform to SAM, not the other way around.

### 3.1 Identity

- **Name:** Sam
- **Role:** Senior Dispatcher at {{companyName}}
- **Personality:** Warm, professional, efficient, genuinely helpful
- **Critical Rule:** SAM never identifies as AI. Ever. The integration must never expose system internals to callers.

### 3.2 Call Flow (7 Phases)

| Phase | Duration | SAM Behavior | CRM Integration Required |
|-------|----------|--------------|--------------------------|
| 1. Greeting | 5-10s | "Thank you for calling {{companyName}}, this is Sam..." | None |
| 2. Issue Discovery | 30-90s | Empathy + clarifying questions | None |
| 3. Qualification | 30-60s | Name, phone, address, homeowner status | **HCP Customer Lookup** (by phone) |
| 4. Availability & Booking | 60-90s | "Let me check what we have open..." | **HCP Availability Check** → **HCP Job Creation** |
| 5. Fee Discussion | If asked | Diagnostic fee handling + objection scripts | None (fee is a config variable) |
| 6. Confirmation | 20-30s | Recap appointment details | **HCP Job ID** returned to SAM for confirmation |
| 7. Closing | 5-10s | "Stay comfortable!" | **Twilio SMS** confirmation (already built) |

### 3.3 Emergency Protocol

When SAM detects: gas smell, smoke, carbon monoxide, electrical burning, sparks, flooding, fire:
- **Immediately** instructs caller to evacuate and call 911
- **Does NOT** continue booking flow
- **Does** log the emergency to the Emergencies sheet
- **Does** alert on-call staff

**HCP Integration Note:** Emergency calls should still be logged as a "lead" in HCP with priority flag, but NO job is created until human follow-up.

### 3.4 Data SAM Collects (Every Call)

| Field | HCP Mapping Required | Notes |
|-------|---------------------|-------|
| caller_name | `customer.first_name` + `customer.last_name` | Split on space |
| caller_phone | `customer.phone_numbers[0].number` | E.164 format |
| service_address | `address.street`, `city`, `state`, `zip` | Must validate against HCP address format |
| issue_description | `job.description` or `estimate.note` | Free text from caller |
| issue_category | `job.tags[]` or custom field | heating/cooling/both/other |
| urgency_level | `job.priority` | Map: emergency→P1, urgent→P2, normal→P3, low→P4 |
| homeowner_status | Custom field or `customer.tags[]` | owner/renter/property_manager |
| email (optional) | `customer.email` | If caller provides |

---

## 4. Housecall Pro API Integration Specs

### 4.1 Authentication

| Item | Detail |
|------|--------|
| Auth Method | OAuth2 (preferred) or API Key |
| Base URL | `https://api.housecallpro.com/v1` |
| Rate Limits | Varies by plan — implement retry with exponential backoff |
| Required Scopes | customers (read/write), jobs (read/write), estimates (read/write), schedule (read) |

**n8n Implementation:** Create an `HTTP Header Auth` or `OAuth2` credential in n8n. Store securely. The credential must be reusable across all HCP nodes.

### 4.2 API Endpoints to Implement

#### 4.2.1 Customer Lookup

**Purpose:** When SAM captures a phone number, check if the caller is an existing HCP customer.

```
GET /customers?phone_number={phone}
```

**n8n Node:** HTTP Request
**Trigger:** Phase 3 of call flow (after SAM gets the phone number)

**Response Handling:**
| Scenario | Action |
|----------|--------|
| Customer found | Return customer ID, name, address, service history to SAM |
| Customer NOT found | Proceed to create new customer after booking |
| Multiple matches | Return most recent customer record |

**SAM Behavior on Match:**
```
"Welcome back! Let me pull up your account... I see we were out
[last_service_date] for [last_job_description]. Is this related
to that, or something new?"
```

#### 4.2.2 Check Availability / Schedule

**Purpose:** Get available appointment slots to present to the caller.

```
GET /schedule/availability
  ?start_date={ISO8601}
  &end_date={ISO8601}
  &employee_ids[]={tech_ids}  (optional)
```

**n8n Node:** HTTP Request → Code node (format slots into speakable text)

**Output Format (to SAM):**
```json
{
  "hasAvailability": true,
  "speakableSlots": "I have a technician available tomorrow between 8 and noon, or Thursday afternoon between 1 and 5. Which works better for you?",
  "slotsOffered": [
    {
      "displayTime": "Tomorrow, 8 AM - 12 PM",
      "isoStart": "2026-02-19T08:00:00-07:00",
      "isoEnd": "2026-02-19T12:00:00-07:00"
    },
    {
      "displayTime": "Thursday, 1 PM - 5 PM",
      "isoStart": "2026-02-20T13:00:00-07:00",
      "isoEnd": "2026-02-20T17:00:00-07:00"
    }
  ]
}
```

**Critical Rules:**
- Always offer 2-3 options when possible
- Time windows: Morning (8-12), Afternoon (12-5), Evening (5-8 if available)
- For emergencies: offer the FIRST available slot only, no options
- Look ahead 48 hours minimum

#### 4.2.3 Create Customer (If New)

**Purpose:** Create a new customer record in HCP when the caller isn't found.

```
POST /customers
```

**Payload:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "email": "john@email.com",
  "phone_numbers": [
    {
      "number": "+16025551234",
      "type": "mobile"
    }
  ],
  "addresses": [
    {
      "street": "123 Main St",
      "city": "Phoenix",
      "state": "AZ",
      "zip": "85001",
      "type": "service"
    }
  ],
  "tags": ["harmonia-ai", "inbound-call"],
  "notes": "Created by SAM AI Receptionist"
}
```

**n8n Implementation:** Only create AFTER the appointment is confirmed (not during qualification). This prevents orphan customer records from abandoned calls.

#### 4.2.4 Create Job / Booking

**Purpose:** Book the appointment in HCP after the customer selects a slot.

```
POST /jobs
```

**Payload:**
```json
{
  "customer_id": "{hcp_customer_id}",
  "address_id": "{hcp_address_id}",
  "scheduled_start": "2026-02-19T08:00:00-07:00",
  "scheduled_end": "2026-02-19T12:00:00-07:00",
  "description": "AC not cooling - customer reports warm air only. System is 12 years old. SAM AI Booked.",
  "tags": ["ai-booked", "diagnostic"],
  "lead_source": "Harmonia AI",
  "line_items": [
    {
      "name": "Diagnostic Service Call",
      "unit_price": 8900,
      "quantity": 1
    }
  ]
}
```

**Response Handling:**
```json
{
  "success": true,
  "jobId": "hcp-job-123456",
  "confirmationMessage": "I've got you down for tomorrow between 8 AM and noon. You'll get a confirmation text in just a sec."
}
```

**Post-Booking Actions (automatic):**
1. Send SMS confirmation via Twilio (already built)
2. Log to Google Sheets `Appointments` sheet (already built)
3. Log to Google Sheets `Call_Log` sheet (already built)

#### 4.2.5 HCP Webhook Receiver (Optional / Phase 2)

**Purpose:** Receive job status updates FROM Housecall Pro (job completed, cancelled, rescheduled).

```
POST /webhook/hcp-job-updates
```

**Events to Handle:**
| HCP Event | Action |
|-----------|--------|
| job.completed | Update Appointments sheet status → "Completed" |
| job.cancelled | Update status → "Cancelled", trigger follow-up |
| job.rescheduled | Update appointment date/time in sheet |
| estimate.approved | Flag lead as converted, update revenue |

---

## 5. n8n Workflow Modifications

### 5.1 Workflows to Modify

| Workflow | File | Changes Required |
|----------|------|------------------|
| Voice Receptionist | `workflows/01-voice-receptionist.json` | Replace ServiceTitan nodes with HCP API calls |
| Set & Save | `workflows/05-set-and-save.json` | Replace ST lead creation with HCP customer + job creation |
| Reply Handler | `workflows/04-reply-handler.json` | Update callback routing to create HCP job |

### 5.2 Workflows That Need No Changes

| Workflow | File | Reason |
|----------|------|--------|
| Lead Reactivation SMS | `workflows/02-lead-reactivation-sms.json` | Reads from Airtable/Sheets, not CRM |
| Lead Reactivation Email | `workflows/03-lead-reactivation-email.json` | SendGrid only, no CRM dependency |

### 5.3 New n8n Nodes Required

| Node Name | Type | Purpose |
|-----------|------|---------|
| HCP: Lookup Customer | HTTP Request | GET /customers by phone |
| HCP: Check Availability | HTTP Request | GET /schedule/availability |
| HCP: Create Customer | HTTP Request | POST /customers |
| HCP: Create Job | HTTP Request | POST /jobs |
| HCP: Format Slots | Code (JS) | Convert HCP schedule response → speakable text |
| HCP: Map Data | Code (JS) | Translate SAM fields ↔ HCP fields |
| HCP: Error Handler | If/Switch | Handle API errors, trigger fallbacks |

### 5.4 Vapi Webhook Handler Updates

The Vapi webhook handler (`/webhook/vapi-inbound`) receives function call requests during live calls. The function names stay the same — the backend logic changes.

| Vapi Function | Current Backend | New Backend |
|---------------|-----------------|-------------|
| `check_availability` | ServiceTitan API | Housecall Pro API |
| `book_appointment` | ServiceTitan API | Housecall Pro API |
| `lookup_customer` | ServiceTitan API | Housecall Pro API |
| `transfer_to_human` | n8n routing (unchanged) | n8n routing (unchanged) |

---

## 6. Data Mapping Reference

### SAM → Housecall Pro Field Mapping

| SAM Field | HCP Field | Transform |
|-----------|-----------|-----------|
| `caller_name` | `customer.first_name` + `customer.last_name` | Split on first space |
| `caller_phone` | `customer.phone_numbers[0].number` | Ensure E.164 |
| `service_address` | `address.street` | Direct |
| `city` | `address.city` | Direct |
| `state` | `address.state` | 2-letter code |
| `zip_code` | `address.zip` | 5-digit |
| `email` | `customer.email` | Direct (optional) |
| `issue_description` | `job.description` | Prepend with issue_category |
| `issue_category` | `job.tags[]` | "heating" / "cooling" / "maintenance" etc. |
| `urgency_level` | `job.tags[]` + scheduling priority | emergency/urgent/normal/low |
| `homeowner_status` | `customer.tags[]` | "owner" / "renter" / "property-manager" |
| `diagnostic_fee_quoted` | `job.line_items[0].unit_price` | Convert to cents (8900 = $89.00) |
| `call_outcome` | `job.status` or lead record | booked/callback/no_book/transfer/emergency |
| `lead_source` | `customer.lead_source` or `job.lead_source` | "Harmonia AI" |

---

## 7. Error Handling & Fallbacks

### API Failure Scenarios

| Scenario | SAM Says | System Does |
|----------|----------|-------------|
| HCP API timeout | "Let me check on that..." (natural pause, retry) | Retry 1x with 3s delay |
| HCP API down | "I'm having a little trouble pulling up the schedule. Let me take your info and have someone call you back within 15 minutes." | Log lead to Sheets, alert manager |
| No availability found | "We're fully booked for the next couple days, but I can have our manager call you back today to work something out." | Create lead in HCP, set callback flag |
| Customer creation fails | (Transparent to caller — SAM continues) | Log error, create customer manually post-call |
| Job creation fails | "I've noted all your information. You'll get a confirmation text shortly." | Queue for manual creation, alert dispatch |

### Retry Logic

```
Max retries: 2
Retry delay: 3 seconds (first), 6 seconds (second)
On final failure: Graceful degradation → log to Sheets + manager alert
```

---

## 8. Testing Requirements

### 8.1 Unit Tests (Per Node)

| Test | Input | Expected Output |
|------|-------|-----------------|
| Customer lookup — existing | Phone: +16025551234 | Returns customer object with ID |
| Customer lookup — new | Phone: +16025559999 | Returns null/empty, triggers create flow |
| Availability check — slots exist | Date: tomorrow, type: diagnostic | Returns 2-3 formatted slots |
| Availability check — no slots | Date: fully booked day | Returns "no availability" message |
| Job creation — success | Valid customer_id + slot | Returns job ID + confirmation |
| Job creation — invalid customer | Bad customer_id | Error handled, logged, manager alerted |

### 8.2 End-to-End Tests

| Test Scenario | How to Test |
|---------------|-------------|
| Full happy path | Call the Vapi number → SAM answers → give name/address → SAM checks HCP availability → select slot → SAM books in HCP → receive SMS confirmation |
| Returning customer | Call from phone number already in HCP → SAM recognizes and references history |
| Emergency call | Say "I smell gas" → SAM triggers evacuation protocol → emergency logged |
| No availability | Call when schedule is full → SAM offers callback |
| Fee objection | Ask "how much does it cost?" → SAM handles objection → still books |

### 8.3 Acceptance Criteria

- [ ] SAM answers inbound calls within 3 rings
- [ ] Customer lookup against HCP completes in <2 seconds
- [ ] Availability check returns speakable slots in <3 seconds
- [ ] Job is created in HCP within 5 seconds of customer confirming
- [ ] SMS confirmation sent within 10 seconds of booking
- [ ] All calls logged to Google Sheets regardless of outcome
- [ ] Emergency protocol fires correctly on trigger words
- [ ] Graceful fallback when HCP API is unavailable
- [ ] SAM never reveals it's an AI or mentions system errors to callers

---

## 9. Environment Variables

Add these to the existing `.env` configuration:

```bash
# Housecall Pro
HCP_API_KEY=your-housecall-pro-api-key
HCP_API_BASE_URL=https://api.housecallpro.com/v1
HCP_COMPANY_ID=your-company-id
HCP_DEFAULT_JOB_TYPE=diagnostic
HCP_DIAGNOSTIC_FEE_CENTS=8900
HCP_LEAD_SOURCE=Harmonia AI
HCP_WEBHOOK_SECRET=your-webhook-secret
```

---

## 10. Deliverables Checklist

| # | Deliverable | Priority |
|---|-------------|----------|
| 1 | HCP API credential configured in n8n | P0 |
| 2 | Customer lookup node (by phone) | P0 |
| 3 | Availability check node + slot formatter | P0 |
| 4 | Customer creation node (new callers) | P0 |
| 5 | Job/booking creation node | P0 |
| 6 | Voice Receptionist workflow updated (01) | P0 |
| 7 | Set & Save workflow updated (05) | P1 |
| 8 | Data mapping layer (SAM ↔ HCP) | P0 |
| 9 | Error handling + fallback flows | P0 |
| 10 | End-to-end test — happy path | P0 |
| 11 | End-to-end test — edge cases | P1 |
| 12 | HCP webhook receiver (job status updates) | P2 |
| 13 | Reply Handler workflow updated (04) | P2 |
| 14 | Documentation / runbook | P2 |

---

## 11. Estimated Level of Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Setup | HCP API access, credentials, n8n config | 2-4 hrs |
| Core Integration | Customer lookup, availability, job creation | 8-12 hrs |
| Workflow Updates | Modify workflows 01, 05, 04 | 6-8 hrs |
| Data Mapping | Field translation + edge cases | 3-4 hrs |
| Error Handling | Fallback flows, retry logic, alerting | 4-6 hrs |
| Testing | Unit + E2E + UAT | 6-8 hrs |
| **Total** | | **29-42 hrs** |

---

## 12. Dependencies & Assumptions

### Dependencies
- Active Housecall Pro account with API access enabled
- HCP API key or OAuth2 credentials provided before work starts
- Existing Harmonia n8n instance accessible (cloud or self-hosted)
- Vapi account with SAM assistant deployed (ID: `10c0b569-2b59-48ca-a6cd-aa36ba1f8132`)
- Twilio number configured for the target HVAC company

### Assumptions
- HCP API documentation is current and endpoints are stable
- HCP plan supports API access (Pro+ plans)
- The HVAC company has an active HCP account with existing customers and schedule
- No changes to SAM's voice, persona, or call flow are in scope
- Google Sheets logging continues alongside HCP (dual-write)

---

## 13. Out of Scope

- Changes to SAM's persona, voice, or conversation flow
- Housecall Pro mobile app customizations
- HCP user permissions or account setup
- Custom HCP reports or dashboards
- Outbound calling campaigns (separate SOW)
- Lead reactivation workflow HCP integration (separate SOW)
- Payment processing through HCP

---

*This SOW is based on the Harmonia project documentation, SAM HVAC Knowledge Base v1.0, and the existing n8n workflow architecture. Refer to `knowledge-base/sam-hvac-knowledge.md` for the complete SAM persona reference.*
