# Harmonia API Reference

Technical reference for all webhooks, payloads, and integrations.

---

## Webhook Endpoints

### 1. Lead Intake (Set & Save)

**URL:** `POST /webhook/lead-intake`

Accepts leads from multiple sources and normalizes to unified schema.

#### Google LSA Format

```json
{
  "lead_type": "MESSAGE",
  "google_key": "unique-google-key",
  "user_name": "John Smith",
  "phone_number": "+15551234567",
  "email": "john@email.com",
  "postal_address": "123 Oak St, Springfield, IL 62701",
  "text": "My AC stopped working",
  "category_name": "HVAC Repair",
  "category_id": "hvac_repair"
}
```

#### Facebook Lead Ads Format

```json
{
  "leadgen_id": "123456789",
  "page_id": "987654321",
  "form_id": "111222333",
  "ad_id": "444555666",
  "field_data": [
    {"name": "full_name", "values": ["Jane Doe"]},
    {"name": "phone_number", "values": ["+15559876543"]},
    {"name": "email", "values": ["jane@email.com"]},
    {"name": "street_address", "values": ["456 Maple Ave"]},
    {"name": "city", "values": ["Chicago"]},
    {"name": "state", "values": ["IL"]},
    {"name": "zip_code", "values": ["60601"]},
    {"name": "service_needed", "values": ["Furnace repair"]}
  ]
}
```

#### Elementor Form Format

```json
{
  "form_id": "contact-form-1",
  "form_name": "HVAC Request",
  "fields": {
    "name": "Bob Wilson",
    "phone": "555-222-3333",
    "email": "bob@example.com",
    "address": "789 Pine St",
    "city": "Milwaukee",
    "state": "WI",
    "zip": "53201",
    "message": "Heat not working, urgent!"
  }
}
```

#### Response

```json
{
  "status": "success",
  "leadId": "rec_xxxxxxxxxx",
  "scoring": {
    "score": 85,
    "tier": "HOT",
    "isEmergency": true
  },
  "vapiCallInitiated": true,
  "crmSynced": true
}
```

---

### 2. Twilio Inbound SMS

**URL:** `POST /webhook/twilio-inbound-sms`

Receives inbound SMS from Twilio.

#### Request (URL-encoded)

```
From=+15551234567
To=+15559876543
Body=Yes I'm interested
MessageSid=SM123456789
NumMedia=0
```

#### Response

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

---

### 3. Vapi Inbound Call

**URL:** `POST /webhook/vapi-inbound`

Receives function call requests during Vapi conversations.

#### Function Call Request

```json
{
  "message": {
    "type": "function-call",
    "functionCall": {
      "name": "check_availability",
      "parameters": {
        "job_type": "diagnostic",
        "is_emergency": false
      }
    },
    "call": {
      "id": "call-uuid-123",
      "customer": {
        "number": "+15551234567",
        "name": "John Smith"
      }
    }
  }
}
```

#### Function Response

```json
{
  "result": {
    "hasAvailability": true,
    "speakableSlots": "I have openings tomorrow at 2 PM or Thursday at 10 AM.",
    "slotsOffered": [
      {
        "displayTime": "Tuesday at 2 PM",
        "isoStart": "2024-01-16T14:00:00-06:00",
        "isoEnd": "2024-01-16T16:00:00-06:00"
      }
    ]
  }
}
```

---

## Vapi Function Definitions

### check_availability

Checks ServiceTitan dispatch capacity.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| job_type | string | Yes | "diagnostic", "maintenance", "installation_estimate" |
| is_emergency | boolean | No | Prioritize emergency slots |

**Returns:**
```json
{
  "hasAvailability": true,
  "speakableSlots": "string for AI to speak",
  "slotsOffered": [
    {
      "displayTime": "human readable",
      "isoStart": "ISO 8601 timestamp",
      "isoEnd": "ISO 8601 timestamp",
      "technicianId": "optional"
    }
  ],
  "totalAvailableSlots": 15
}
```

### book_appointment

Creates booking in ServiceTitan.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| customer_name | string | Yes | Full name |
| phone | string | Yes | E.164 format |
| address | string | Yes | Service address |
| city | string | No | City |
| state | string | No | State |
| zip | string | No | ZIP code |
| issue_description | string | Yes | Problem description |
| selected_slot | object | Yes | Chosen time slot |
| is_homeowner | boolean | No | Homeowner status |

**Returns:**
```json
{
  "success": true,
  "bookingId": "ST-123456",
  "confirmationMessage": "string for AI to speak"
}
```

### lookup_customer

Searches for existing customer in ServiceTitan.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| phone | string | Yes | Phone number to lookup |

**Returns:**
```json
{
  "found": true,
  "customer": {
    "id": 12345,
    "name": "John Smith",
    "valueTier": "VIP",
    "totalJobs": 5,
    "membershipStatus": "Active"
  }
}
```

### transfer_to_human

Initiates transfer to human dispatcher.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| reason | string | Yes | Reason for transfer |
| priority | string | No | "normal" or "urgent" |

**Returns:**
```json
{
  "transferInitiated": true,
  "message": "Connecting you now..."
}
```

### 4. GHL Lead Intake

**URL:** `POST /webhook/ghl-lead-intake`

Receives leads from GoHighLevel webhooks or polls for new contacts tagged `new-lead`.

```json
{
  "type": "ContactCreate",
  "locationId": "6PcoUzv9FkLz4wyy4fx4",
  "contact": {
    "id": "ghl_contact_id_123",
    "firstName": "John",
    "lastName": "Smith",
    "email": "john@example.com",
    "phone": "+15551234567",
    "address1": "123 Oak St",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62701",
    "tags": ["new-lead", "facebook"],
    "customFields": [
      { "field_name": "service_needed", "value": "AC repair" },
      { "field_name": "notes", "value": "Unit is not cooling" }
    ],
    "dateAdded": "2026-02-28T15:30:00Z",
    "source": "Facebook Ads"
  }
}
```

**Returns:**
```json
{
  "status": "success",
  "leadId": "ST-12345",
  "scoring": { "score": 82, "tier": "WARM", "isEmergency": false },
  "vapiCallInitiated": true,
  "crmSynced": true,
  "ghlTagsUpdated": true
}
```

### 5. GHL Appointment Booking

**URL:** `POST /webhook/ghl-appointment`

Creates GHL calendar events and opportunities when appointments are booked via Vapi or lead intake.

```json
{
  "customer_name": "Jane Doe",
  "phone": "+15559876543",
  "email": "jane@email.com",
  "address": "456 Maple Ave",
  "city": "Chicago",
  "state": "IL",
  "zip": "60601",
  "selected_slot": {
    "start": "2026-03-01T14:00:00-06:00",
    "end": "2026-03-01T16:00:00-06:00"
  },
  "job_type": "diagnostic",
  "issue_description": "AC not cooling properly",
  "is_emergency": false,
  "booked_by": "Vapi AI",
  "vapi_call_id": "call-uuid-456",
  "st_booking_id": "ST-789012",
  "airtable_lead_id": "recABC123",
  "lead_score": 85,
  "lead_tier": "HOT"
}
```

**Returns:**
```json
{
  "status": "success",
  "ghlCalendarEventId": "evt_123",
  "ghlOpportunityId": "opp_456",
  "confirmationSent": true
}
```

---

## GoHighLevel API Endpoints Used

### Authentication

All GHL API calls use a Private Integration Token (PIT):

```
Headers:
  Authorization: Bearer {GHL_API_KEY}
  Version: 2021-07-28
  Content-Type: application/json
```

### Contact Operations

```
GET  /contacts/?locationId={id}&query={search}&tag={tag}&limit={n}
POST /contacts/                    # Create contact
POST /contacts/upsert              # Create or update by phone/email
PUT  /contacts/{contactId}         # Update contact
POST /contacts/{contactId}/tags    # Add tags
```

### Calendar Operations

```
GET  /calendars/events?locationId={id}&startTime={iso}&endTime={iso}
POST /calendars/events             # Create calendar event
```

### Opportunity Operations

```
GET  /opportunities/search?location_id={id}&pipeline_id={id}
POST /opportunities/               # Create opportunity
PUT  /opportunities/{id}           # Update opportunity
```

### Conversation Operations

```
POST /conversations/messages       # Send SMS or Email
GET  /conversations/search?locationId={id}&contactId={id}
```

---

## ServiceTitan API Endpoints Used

### Authentication

```
POST https://auth.servicetitan.io/connect/token

grant_type=client_credentials
client_id={ST_CLIENT_ID}
client_secret={ST_CLIENT_SECRET}
```

### Customer Lookup

```
GET https://api.servicetitan.io/crm/v2/tenant/{tenantId}/customers
?phone={phoneNumber}

Headers:
Authorization: Bearer {access_token}
ST-App-Key: {app_key}
```

### Create Customer

```
POST https://api.servicetitan.io/crm/v2/tenant/{tenantId}/customers

Body:
{
  "name": "John Smith",
  "type": "Residential",
  "address": {...},
  "phoneSettings": {
    "phoneNumber": "+15551234567"
  }
}
```

### Check Availability

```
GET https://api.servicetitan.io/dispatch/v2/tenant/{tenantId}/capacity/availability
?startsOnOrAfter={ISO8601}
&endsOnOrBefore={ISO8601}
&jobTypeId={jobTypeId}
```

### Create Booking

```
POST https://api.servicetitan.io/crm/v2/tenant/{tenantId}/bookings

Body:
{
  "source": "Harmonia AI",
  "customerId": 12345,
  "locationId": 67890,
  "jobTypeId": 11111,
  "start": "2024-01-16T14:00:00-06:00",
  "end": "2024-01-16T16:00:00-06:00",
  "summary": "AC not cooling - AI Booked"
}
```

### Create Lead

```
POST https://api.servicetitan.io/crm/v2/tenant/{tenantId}/leads

Body:
{
  "name": "John Smith",
  "type": "Residential",
  "status": "Open",
  "source": "Harmonia - google_lsa",
  "priority": "Normal",
  "address": {...},
  "contacts": [
    {"type": "Phone", "value": "+15551234567"}
  ],
  "notes": "Lead Score: 85/100 (HOT)..."
}
```

---

## Airtable Schema Reference

### Leads Table

| Field | Type | API Name |
|-------|------|----------|
| Lead ID | Autonumber | `Lead ID` |
| First Name | Text | `First Name` |
| Last Name | Text | `Last Name` |
| Phone | Phone | `Phone` |
| Email | Email | `Email` |
| Address | Text | `Address` |
| City | Text | `City` |
| State | Text | `State` |
| Zip | Text | `Zip` |
| Status | Select | `Status` |
| Lead Score | Number | `Lead Score` |
| Lead Tier | Select | `Lead Tier` |
| Is Emergency | Checkbox | `Is Emergency` |
| Source | Select | `Source` |
| Last Contact | Date | `Last Contact` |
| Loss Reason | Select | `Loss Reason` |
| Reactivation Attempts | Number | `Reactivation Attempts` |
| Last SMS Sent | DateTime | `Last SMS Sent` |
| SMS Message Sent | Long Text | `SMS Message Sent` |
| Twilio SID | Text | `Twilio SID` |
| Email Follow-up Sent | Checkbox | `Email Follow-up Sent` |
| Has Replied | Checkbox | `Has Replied` |
| Reply Intent | Select | `Reply Intent` |
| Reply Message | Long Text | `Reply Message` |
| Do Not Contact | Checkbox | `Do Not Contact` |
| ServiceTitan Lead ID | Text | `ServiceTitan Lead ID` |
| Vapi Call ID | Text | `Vapi Call ID` |
| GHL Contact ID | Text | `GHL Contact ID` |
| GHL Opportunity ID | Text | `GHL Opportunity ID` |
| GHL Last Synced | DateTime | `GHL Last Synced` |
| GHL Calendar Event ID | Text | `GHL Calendar Event ID` |

---

## Lead Scoring Algorithm

```javascript
// Base score
let score = 50;

// Homeowner status
if (isHomeowner) score += 20;
if (isRenter) score -= 10;

// System age
if (hasOldSystem) score += 15;

// Emergency detection
if (isEmergency) score += 25;

// Service type value
if (highValueService) score += 20;  // install, replacement
if (mediumValueService) score += 10; // repair
if (lowValueService) score += 5;     // maintenance

// Time of day
if (businessHours) score += 5;

// Lead source
score += sourceScores[source];
// google_lsa: +15, facebook: +5, website: +10, referral: +20

// Contact completeness
if (phone && email && address) score += 10;
if (phone && address) score += 5;

// Normalize to 1-100
score = Math.max(1, Math.min(100, score));

// Tier assignment
if (score >= 85) tier = 'HOT';
else if (score >= 70) tier = 'WARM';
else if (score >= 50) tier = 'COOL';
else tier = 'COLD';
```

---

## Error Codes

### ServiceTitan

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid/expired token | Refresh OAuth token |
| 403 | Missing permissions | Check API app scopes in ST |
| 404 | Resource not found | Verify tenant ID, job type ID |
| 429 | Rate limited | Add delay between requests |
| 500 | ST server error | Retry with backoff |

### Twilio

| Code | Meaning | Solution |
|------|---------|----------|
| 20003 | Auth failed | Check Account SID/Token |
| 21211 | Invalid phone | Verify E.164 format |
| 21608 | Unverified number (trial) | Upgrade or verify number |

### Vapi

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid API key | Check VAPI_API_KEY |
| 404 | Assistant not found | Verify assistant ID |
| 429 | Rate limited | Reduce call frequency |

### GoHighLevel

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid PIT token | Check GHL_API_KEY |
| 403 | Insufficient permissions | Check PIT scopes |
| 404 | Contact/resource not found | Verify contact ID |
| 422 | Invalid data format | Check field types |
| 429 | Rate limited | Add delay between requests |

### Airtable

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid token | Regenerate API token |
| 403 | Base not shared | Add base to token access |
| 422 | Invalid data | Check field types match |

---

## Rate Limits

| Service | Limit | Handling |
|---------|-------|----------|
| ServiceTitan | 100/min | Built-in retry with backoff |
| Vapi | 60/min | Queue outbound calls |
| Twilio | 1/sec per number | Add 1s delay between SMS |
| Airtable | 5/sec | Batch operations where possible |
| OpenAI | Varies by plan | Check usage dashboard |
| GoHighLevel | 100/min | Built-in retry with 2s backoff |
