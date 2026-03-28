# Google Sheets CRM Setup Context

## What We're Doing
Replacing ServiceTitan/Airtable with Google Sheets for SAM HVAC demo.

## SAM HVAC Assistant
- **ID**: `10c0b569-2b59-48ca-a6cd-aa36ba1f8132`
- **Name**: SAM HVAC - Master Dispatcher
- **LLM**: GPT-4o
- **Voice**: Vapi Elliot (ElevenLabs)

## 9 Tools That Need Backend Updates

| Tool | Webhook | Sheet Needed |
|------|---------|--------------|
| `lookup_customer` | /webhook/hvac-lookup-customer | Customers |
| `hvac_triage` | /webhook/hvac-triage | (logic only) |
| `hvac_pre_diagnostic` | /webhook/hvac-pre-diagnostic | Diagnostics |
| `hvac_check_availability` | /webhook/hvac-get-availability | Google Calendar |
| `hvac_book_service` | /webhook/hvac-book-service | Bookings + Calendar |
| `hvac_create_lead` | /webhook/hvac-create-lead | Leads |
| `hvac_emergency` | /webhook/hvac-emergency-escalate | Emergencies |
| `send_confirmation_sms` | /webhook/hvac-send-confirmation | (Twilio - no change) |
| `hvac_knowledge_base` | /webhook/hvac-knowledge-base | KnowledgeBase |

## Google Sheets Structure

### Master Spreadsheet: "SAM HVAC CRM"

**Sheet 1: Customers**
- customer_id, first_name, last_name, phone, email, address, city, state, zip
- system_type, system_age, fuel_source, last_service_date, total_services, notes, created_at

**Sheet 2: Bookings**
- booking_id, customer_id, customer_name, phone, address
- service_type, priority, issue, tech_notes
- slot_id, appointment_date, appointment_time, technician
- status, confirmation_sent, created_at

**Sheet 3: Leads**
- lead_id, customer_name, phone, email, address
- interest, timeline, system_age, budget, is_homeowner
- status, score, assigned_to, created_at, notes

**Sheet 4: Emergencies**
- emergency_id, customer_name, phone, address
- emergency_type, description, safety_confirmed
- status, escalated_to, response_time, created_at

**Sheet 5: Diagnostics**
- diagnostic_id, customer_name, phone, address
- system_type, system_age, fuel_source, symptoms
- access_location, vulnerable_residents
- triage_result, priority, created_at

**Sheet 6: KnowledgeBase**
- query_type, question, answer
- (Rows for: pricing, warranty, service_area, hours, financing, maintenance_plan, brands_serviced)

## n8n Workflows to Update
All webhooks point to: `https://labster777.app.n8n.cloud/webhook/...`

Need to replace ServiceTitan/Airtable nodes with Google Sheets nodes.

## After Restart Instructions
1. Say: "Continue Google Sheets setup for SAM HVAC"
2. Claude will read this file and the sheet structures
3. Create sheets via MCP
4. Help update n8n workflows
