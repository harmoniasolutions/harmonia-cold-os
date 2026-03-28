# n8n Workflow Updates for Google Sheets

## Overview
Replace ServiceTitan/Airtable nodes with Google Sheets nodes in n8n workflows.

## Webhook → Google Sheet Mapping

### 1. `/webhook/hvac-lookup-customer`
**Action**: Search Customers sheet by phone
```
Input: { phone: "+15551234567" }
Output: Customer record or "not found"
```
- Use Google Sheets node: "Read Rows" with filter on phone column
- Return customer data if found, null if not

### 2. `/webhook/hvac-triage`
**Action**: Classification logic only (no sheet needed)
```
Input: { customer_statement, keywords }
Output: { track: "RED|GOLD|BLUE|GREEN", priority: "P1-P4" }
```
- Use Code node for classification logic
- Keywords: gas smell, CO alarm → RED
- Keywords: new system, quote, replacement → GOLD
- Keywords: not working, broken, no heat/cool → BLUE
- Keywords: maintenance, tune-up, check → GREEN

### 3. `/webhook/hvac-pre-diagnostic`
**Action**: Append row to Diagnostics sheet
```
Input: { customer_name, symptoms, phone, address, system_type, etc. }
Output: { diagnostic_id, success: true }
```
- Generate diagnostic_id: "D" + timestamp
- Use Google Sheets node: "Append Row"

### 4. `/webhook/hvac-get-availability`
**Action**: Read Google Calendar free/busy
```
Input: { priority, service_type, zip_code, date }
Output: { slots: [{ slot_id, date, time_window, available: true }] }
```
- Use Google Calendar node: "Get Many" events
- Find gaps in schedule
- Return 3-5 available slots formatted for presumptive close

### 5. `/webhook/hvac-book-service`
**Action**: Append to Bookings sheet + Create Calendar event
```
Input: { customer_name, phone, address, slot_id, service_type, etc. }
Output: { booking_id, confirmation_number, success: true }
```
- Generate booking_id: "B" + timestamp
- Append row to Bookings sheet
- Create Google Calendar event with details

### 6. `/webhook/hvac-create-lead`
**Action**: Append row to Leads sheet
```
Input: { customer_name, phone, is_homeowner, interest, timeline, etc. }
Output: { lead_id, score, success: true }
```
- Generate lead_id: "L" + timestamp
- Calculate lead score based on:
  - is_homeowner: +30
  - timeline IMMEDIATE: +25, THIS_WEEK: +20, THIS_MONTH: +15
  - interest REPLACEMENT: +20, NEW_SYSTEM: +15
- Append row to Leads sheet

### 7. `/webhook/hvac-emergency-escalate`
**Action**: Append to Emergencies sheet + Alert
```
Input: { customer_name, phone, emergency_type, description, etc. }
Output: { emergency_id, escalated: true, eta: "15-30 minutes" }
```
- Generate emergency_id: "E" + timestamp
- Append row to Emergencies sheet
- Send Slack/email alert to on-call

### 8. `/webhook/hvac-knowledge-base`
**Action**: Lookup in KnowledgeBase sheet
```
Input: { query_type: "pricing|warranty|hours|etc.", specific_question }
Output: { answer: "..." }
```
- Filter KnowledgeBase by query_type
- Return matching answer(s)
- If specific_question provided, do fuzzy match

### 9. `/webhook/hvac-send-confirmation`
**Action**: Keep Twilio SMS (no change needed)
```
Input: { phone, appointment_date, appointment_time, etc. }
Output: { sent: true, message_sid }
```

## Google Sheets Node Settings

**Spreadsheet ID**: Will be provided after creation
**Authentication**: OAuth2 (same as MCP)

## Google Calendar Settings

**Calendar ID**: primary (or specific calendar)
**Event Duration**: 2 hours default
**Event Title Format**: "[SERVICE_TYPE] - [CUSTOMER_NAME]"
**Event Description**: Include address, phone, issue, tech notes
