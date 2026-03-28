# Google Sheets Schema for SAM HVAC Receptionist

> **Version:** 1.0
> **Last Updated:** 2026-01-30
> **Purpose:** Store all inbound call data, appointments, and analytics

---

## Overview

This schema uses 4 interconnected sheets within a single Google Spreadsheet:

| Sheet | Purpose | Rows/Day |
|-------|---------|----------|
| `Call_Log` | Every inbound call record | ~50-200 |
| `Appointments` | Booked appointments only | ~20-80 |
| `Leads` | Unbooked callers for follow-up | ~10-50 |
| `Daily_Analytics` | Aggregated daily metrics | 1 |

---

## Sheet 1: Call_Log

**Purpose:** Raw log of every inbound call handled by SAM

### Columns

| Column | Header | Type | Description | Example |
|--------|--------|------|-------------|---------|
| A | `call_id` | String | Unique Vapi call ID | `call_abc123xyz` |
| B | `timestamp` | DateTime | Call start time (ISO 8601) | `2026-01-30T14:23:45Z` |
| C | `date` | Date | Call date (for filtering) | `2026-01-30` |
| D | `time` | Time | Call time (local) | `9:23 AM` |
| E | `caller_phone` | String | Caller phone number | `+16025551234` |
| F | `caller_name` | String | Caller's full name | `John Smith` |
| G | `service_address` | String | Full service address | `123 Main St` |
| H | `city` | String | City | `Phoenix` |
| I | `state` | String | State (2-letter) | `AZ` |
| J | `zip_code` | String | ZIP code | `85001` |
| K | `issue_category` | Dropdown | Type of issue | `Heating` |
| L | `issue_description` | Text | Caller's description | `No heat, system won't turn on` |
| M | `urgency_level` | Dropdown | Call urgency | `Urgent` |
| N | `homeowner_status` | Dropdown | Ownership status | `Owner` |
| O | `call_outcome` | Dropdown | How call ended | `Booked` |
| P | `appointment_id` | String | Link to Appointments sheet | `apt_456def` |
| Q | `call_duration_sec` | Number | Call length in seconds | `247` |
| R | `diagnostic_fee_quoted` | Currency | Fee amount quoted | `$89.00` |
| S | `objections` | Text | Any objections raised | `Price concern` |
| T | `existing_customer` | Boolean | Returning customer? | `TRUE` |
| U | `lead_source` | Dropdown | How they found us | `Google` |
| V | `notes` | Text | Additional notes | `Has dog, call before arrival` |
| W | `follow_up_required` | Boolean | Needs follow-up? | `FALSE` |
| X | `transcript_url` | URL | Link to call transcript | `https://...` |
| Y | `recording_url` | URL | Link to call recording | `https://...` |

### Dropdown Values

**issue_category:**
- Heating
- Cooling
- Both
- Maintenance
- Installation
- Emergency
- Other

**urgency_level:**
- Emergency (gas/CO/fire - call 911)
- Urgent (no heat/AC with vulnerability)
- High (system down)
- Normal (standard service)
- Low (maintenance/questions)

**homeowner_status:**
- Owner
- Renter
- Property Manager
- Business

**call_outcome:**
- Booked
- Callback Requested
- No Book - Price
- No Book - Timing
- No Book - Not Ready
- Transferred
- Emergency (911)
- Wrong Number
- Spam

**lead_source:**
- Google Search
- Google LSA
- Facebook
- Yelp
- Referral
- Repeat Customer
- Other
- Unknown

---

## Sheet 2: Appointments

**Purpose:** All booked appointments (syncs to ServiceTitan/CRM)

### Columns

| Column | Header | Type | Description | Example |
|--------|--------|------|-------------|---------|
| A | `appointment_id` | String | Unique appointment ID | `apt_456def` |
| B | `call_id` | String | Link to Call_Log | `call_abc123xyz` |
| C | `created_at` | DateTime | When booked | `2026-01-30T14:25:00Z` |
| D | `appointment_date` | Date | Service date | `2026-01-31` |
| E | `time_slot` | String | Appointment window | `8 AM - 12 PM` |
| F | `customer_name` | String | Customer name | `John Smith` |
| G | `customer_phone` | String | Contact phone | `+16025551234` |
| H | `customer_email` | String | Email address | `john@email.com` |
| I | `service_address` | String | Full address | `123 Main St` |
| J | `city` | String | City | `Phoenix` |
| K | `state` | String | State | `AZ` |
| L | `zip_code` | String | ZIP | `85001` |
| M | `job_type` | Dropdown | Type of appointment | `Diagnostic` |
| N | `issue_description` | Text | Problem description | `No heat` |
| O | `urgency_level` | Dropdown | Priority | `High` |
| P | `diagnostic_fee` | Currency | Fee quoted | `$89.00` |
| Q | `special_instructions` | Text | Tech notes | `Call 30 min before, gate code 1234` |
| R | `confirmation_sent` | Boolean | Confirmation sent? | `TRUE` |
| S | `reminder_sent` | Boolean | Reminder sent? | `FALSE` |
| T | `status` | Dropdown | Appointment status | `Scheduled` |
| U | `servicetitan_id` | String | CRM sync ID | `ST-789012` |
| V | `assigned_tech` | String | Technician assigned | `Mike T.` |
| W | `estimated_revenue` | Currency | Potential value | `$350.00` |

### Dropdown Values

**job_type:**
- Diagnostic
- Maintenance/Tune-up
- Repair (Known Issue)
- Installation Estimate
- Emergency Service

**status:**
- Scheduled
- Confirmed
- En Route
- In Progress
- Completed
- Cancelled
- No Show
- Rescheduled

---

## Sheet 3: Leads

**Purpose:** Callers who didn't book - for follow-up sequences

### Columns

| Column | Header | Type | Description | Example |
|--------|--------|------|-------------|---------|
| A | `lead_id` | String | Unique lead ID | `lead_789ghi` |
| B | `call_id` | String | Link to Call_Log | `call_abc123xyz` |
| C | `created_at` | DateTime | When captured | `2026-01-30T14:25:00Z` |
| D | `caller_name` | String | Lead name | `Jane Doe` |
| E | `caller_phone` | String | Phone number | `+16025559876` |
| F | `caller_email` | String | Email (if captured) | `jane@email.com` |
| G | `service_address` | String | Address | `456 Oak Ave` |
| H | `city` | String | City | `Scottsdale` |
| I | `state` | String | State | `AZ` |
| J | `zip_code` | String | ZIP | `85251` |
| K | `issue_category` | Dropdown | Issue type | `Cooling` |
| L | `issue_description` | Text | Problem | `AC not cooling well` |
| M | `no_book_reason` | Dropdown | Why they didn't book | `Wants to compare prices` |
| N | `objections` | Text | Specific objections | `$89 diagnostic seems high` |
| O | `lead_score` | Number | Quality score (0-100) | `72` |
| P | `lead_temperature` | Dropdown | Hot/Warm/Cool/Cold | `Warm` |
| Q | `follow_up_status` | Dropdown | Follow-up stage | `Pending` |
| R | `follow_up_attempts` | Number | Attempts made | `0` |
| S | `last_contact` | DateTime | Last outreach | `` |
| T | `next_follow_up` | DateTime | Scheduled outreach | `2026-01-31T10:00:00Z` |
| U | `notes` | Text | Additional context | `Mentioned budget is tight` |
| V | `converted` | Boolean | Eventually booked? | `FALSE` |
| W | `converted_date` | Date | If converted, when | `` |

### Dropdown Values

**no_book_reason:**
- Price Concern
- Wants to Compare
- Not Ready Yet
- Timing Doesn't Work
- Renter (Needs Landlord)
- Just Getting Information
- Going with Competitor
- Other

**lead_temperature:**
- Hot (score >= 85)
- Warm (score >= 70)
- Cool (score >= 50)
- Cold (score < 50)

**follow_up_status:**
- Pending
- Attempted (1)
- Attempted (2)
- Attempted (3)
- Converted
- Do Not Contact
- Unresponsive
- Closed Lost

---

## Sheet 4: Daily_Analytics

**Purpose:** Aggregated daily performance metrics

### Columns

| Column | Header | Type | Description | Example |
|--------|--------|------|-------------|---------|
| A | `date` | Date | Reporting date | `2026-01-30` |
| B | `total_calls` | Number | Total inbound calls | `127` |
| C | `calls_answered` | Number | Calls SAM handled | `124` |
| D | `calls_booked` | Number | Appointments made | `67` |
| E | `booking_rate` | Percent | Booked/Answered | `54.0%` |
| F | `calls_transferred` | Number | Transferred to human | `8` |
| G | `emergency_calls` | Number | Emergency situations | `2` |
| H | `leads_captured` | Number | Non-booked leads | `41` |
| I | `hot_leads` | Number | Leads scored 85+ | `12` |
| J | `warm_leads` | Number | Leads scored 70-84 | `18` |
| K | `avg_call_duration` | Number | Avg seconds | `214` |
| L | `total_call_minutes` | Number | Total minutes | `442` |
| M | `revenue_potential` | Currency | Est. appointment value | `$23,450.00` |
| N | `diagnostic_fees` | Currency | Total fees quoted | `$5,963.00` |
| O | `top_issue` | String | Most common issue | `No cooling` |
| P | `peak_hour` | String | Busiest hour | `10 AM - 11 AM` |
| Q | `top_objection` | String | Most common objection | `Price` |
| R | `new_vs_returning` | String | Customer mix | `82% new, 18% returning` |

---

## Formulas & Calculated Fields

### Call_Log Formulas

```
# Auto-generate date from timestamp (Column C)
=DATEVALUE(MID(B2, 1, 10))

# Auto-generate time from timestamp (Column D)
=TIMEVALUE(MID(B2, 12, 8))

# Format phone number
=IF(LEN(E2)=12, "+1 "&MID(E2,3,3)&"-"&MID(E2,6,3)&"-"&MID(E2,9,4), E2)
```

### Leads Formulas

```
# Lead Score Calculation (Column O)
=50
  +IF(N2="Owner",20,IF(N2="Renter",-10,0))
  +IF(M2="Urgent",25,IF(M2="High",15,0))
  +IF(K2="Heating",10,IF(K2="Cooling",10,0))
  +IF(OR(Q2="",Q2="Pending"),0,-5*R2)

# Lead Temperature (Column P)
=IF(O2>=85,"Hot",IF(O2>=70,"Warm",IF(O2>=50,"Cool","Cold")))

# Next Follow-up Date (Column T)
=IF(Q2="Pending", C2+1, IF(Q2="Attempted (1)", S2+2, IF(Q2="Attempted (2)", S2+3, "")))
```

### Daily_Analytics Formulas

```
# Booking Rate (Column E)
=IF(C2>0, D2/C2, 0)

# Revenue Potential (assumes $350 avg job) (Column M)
=D2 * 350

# Total Diagnostic Fees (Column N)
=SUMIF(Call_Log!C:C, A2, Call_Log!R:R)
```

---

## n8n Integration Setup

### Google Sheets Credentials

1. Create Google Cloud Project
2. Enable Google Sheets API
3. Create OAuth2 credentials
4. Add credentials to n8n

### Webhook Data Mapping

**From Vapi Call Ended Event:**

```json
{
  "call_id": "{{$json.call.id}}",
  "timestamp": "{{$json.call.startedAt}}",
  "caller_phone": "{{$json.call.customer.number}}",
  "call_duration_sec": "{{$json.call.duration}}",
  "transcript_url": "{{$json.call.artifact.transcriptUrl}}",
  "recording_url": "{{$json.call.artifact.recordingUrl}}"
}
```

**From Vapi Tool Call (book_appointment):**

```json
{
  "customer_name": "{{$json.toolCalls[0].function.arguments.customer_name}}",
  "service_address": "{{$json.toolCalls[0].function.arguments.address}}",
  "issue_description": "{{$json.toolCalls[0].function.arguments.issue_description}}",
  "selected_slot": "{{$json.toolCalls[0].function.arguments.selected_slot}}"
}
```

---

## Sheet Setup Instructions

### Step 1: Create Spreadsheet

1. Go to Google Sheets
2. Create new spreadsheet: "Harmonia - SAM Call Data"
3. Rename default sheet to "Call_Log"
4. Add 3 more sheets: "Appointments", "Leads", "Daily_Analytics"

### Step 2: Add Headers

Copy the headers from each sheet schema above into Row 1.

### Step 3: Format Columns

- Set date columns to Date format
- Set currency columns to Currency format
- Set percent columns to Percentage format
- Add data validation for dropdown columns

### Step 4: Protect Structure

1. Right-click sheet tab > "Protect sheet"
2. Set "Except certain cells" to allow data entry rows
3. Lock header row (Row 1)

### Step 5: Create Views (Optional)

**Hot Leads View:**
- Filter: lead_temperature = "Hot"
- Sort: created_at DESC

**Today's Appointments:**
- Filter: appointment_date = TODAY()
- Sort: time_slot ASC

**Unbooked Follow-ups:**
- Filter: follow_up_status = "Pending"
- Sort: lead_score DESC

---

## Data Retention Policy

| Data Type | Retention | Archive Action |
|-----------|-----------|----------------|
| Call_Log | 90 days | Move to Archive_Calls sheet |
| Appointments | 1 year | Move to Archive_Appointments |
| Leads | 6 months | Delete or archive |
| Daily_Analytics | Indefinite | Keep for reporting |

---

## Related Files

- `knowledge-base/sam-hvac-knowledge.md` - SAM's behavior reference
- `workflows/01-voice-receptionist.json` - n8n workflow (needs Google Sheets nodes)
- `vapi-assistants/inbound-receptionist.json` - Vapi assistant config

---

*This schema provides the data structure for call logging. Next step: Build n8n workflow to write data from Vapi to these sheets.*
