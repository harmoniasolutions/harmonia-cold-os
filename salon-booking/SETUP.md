# Salon Booking System - Setup Guide

## 1. Square Developer Sandbox Setup

### Create Sandbox Account
1. Go to https://developer.squareup.com/
2. Click **Sign Up** (or sign in if you have an account)
3. Navigate to **Applications** in the developer dashboard
4. Click **Create Application** (or **+** button)
5. Name it: `Harmonia Salon Booking - Sandbox`
6. Select **Sandbox** environment

### Generate API Keys
1. Open your new application
2. Go to **Credentials** tab
3. Copy these values:
   - **Sandbox Application ID** (starts with `sandbox-sq0idb-`)
   - **Sandbox Access Token** (starts with `EAAAl...`)
4. Save them to your `.env` file:

```bash
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=sandbox-sq0idb-XXXXXXXX
SQUARE_ACCESS_TOKEN=EAAAl-XXXXXXXX
SQUARE_LOCATION_ID=LXXXXXXXX
```

### Get Location ID
1. Go to **Locations** tab in the Square dashboard
2. Copy the **Location ID** for your sandbox location
3. Or use the API: `GET https://connect.squareupsandbox.com/v2/locations`

### Test Connection
```bash
curl https://connect.squareupsandbox.com/v2/locations \
  -H "Authorization: Bearer YOUR_SANDBOX_ACCESS_TOKEN"
```

## 2. Google Sheets Mock Database Setup

### Demo Salon: Luxe Cuts Studio
**Address:** 123 Main Street, Suite 200

### Create the Spreadsheet
1. Create a new Google Sheet named: `Luxe Cuts Studio - Booking DB`
2. Create these 4 tabs (sheets):

### Tab: Services
| service_id | name | duration_minutes | price | category | description |
|-----------|------|-----------------|-------|----------|-------------|
| SVC-001 | Women's Haircut | 45 | 65 | Cuts | Shampoo, cut, and blowdry |
| SVC-002 | Men's Haircut | 30 | 35 | Cuts | Classic cut and style |
| SVC-003 | Kids Haircut | 20 | 25 | Cuts | Ages 12 and under |
| SVC-004 | Single Process Color | 90 | 120 | Color | Full head single color |
| SVC-005 | Highlights - Partial | 120 | 150 | Color | Face-framing highlights |
| SVC-006 | Highlights - Full | 150 | 200 | Color | Full head highlights |
| SVC-007 | Balayage | 180 | 250 | Color | Hand-painted color technique |
| SVC-008 | Blowout | 30 | 45 | Styling | Shampoo and blowdry |
| SVC-009 | Deep Conditioning | 30 | 40 | Treatments | Intensive moisture treatment |
| SVC-010 | Keratin Treatment | 180 | 300 | Treatments | Smoothing keratin treatment |
| SVC-011 | Beard Trim | 15 | 15 | Grooming | Shape and trim |
| SVC-012 | Hot Towel Shave | 30 | 35 | Grooming | Traditional straight razor shave |

### Tab: Stylists
| stylist_id | name | specialties | phone | email | active |
|-----------|------|------------|-------|-------|--------|
| STY-001 | Jessica Martinez | Color, Balayage, Highlights | 555-0101 | jessica@luxecuts.com | TRUE |
| STY-002 | Marcus Johnson | Men's Cuts, Fades, Beard Work | 555-0102 | marcus@luxecuts.com | TRUE |
| STY-003 | Ashley Chen | Cuts, Blowouts, Keratin | 555-0103 | ashley@luxecuts.com | TRUE |
| STY-004 | Devon Williams | All Services | 555-0104 | devon@luxecuts.com | TRUE |

### Tab: Appointments
| appointment_id | customer_name | customer_email | customer_phone | service_id | service_name | stylist_id | stylist_name | date | start_time | end_time | status | created_at | notes |
|---------------|--------------|---------------|---------------|-----------|-------------|-----------|-------------|------|-----------|---------|--------|-----------|-------|
| APT-001 | Sarah Wilson | sarah@email.com | 555-1001 | SVC-001 | Women's Haircut | STY-001 | Jessica Martinez | 2026-03-28 | 09:00 | 09:45 | confirmed | 2026-03-27 | First visit |
| APT-002 | Tom Brown | tom@email.com | 555-1002 | SVC-004 | Single Process Color | STY-003 | Ashley Chen | 2026-03-28 | 10:00 | 11:30 | confirmed | 2026-03-27 | |
| APT-003 | Lisa Park | lisa@email.com | 555-1003 | SVC-008 | Blowout | STY-001 | Jessica Martinez | 2026-03-28 | 14:00 | 14:30 | confirmed | 2026-03-27 | |

### Tab: Availability
| stylist_id | stylist_name | day_of_week | start_time | end_time |
|-----------|-------------|------------|-----------|---------|
| STY-001 | Jessica Martinez | Monday | 09:00 | 17:00 |
| STY-001 | Jessica Martinez | Tuesday | 09:00 | 17:00 |
| STY-001 | Jessica Martinez | Wednesday | 10:00 | 18:00 |
| STY-001 | Jessica Martinez | Thursday | 09:00 | 17:00 |
| STY-001 | Jessica Martinez | Friday | 09:00 | 19:00 |
| STY-001 | Jessica Martinez | Saturday | 09:00 | 15:00 |
| STY-002 | Marcus Johnson | Monday | 08:00 | 16:00 |
| STY-002 | Marcus Johnson | Tuesday | 08:00 | 16:00 |
| STY-002 | Marcus Johnson | Thursday | 08:00 | 16:00 |
| STY-002 | Marcus Johnson | Friday | 08:00 | 18:00 |
| STY-002 | Marcus Johnson | Saturday | 08:00 | 14:00 |
| STY-003 | Ashley Chen | Tuesday | 10:00 | 18:00 |
| STY-003 | Ashley Chen | Wednesday | 10:00 | 18:00 |
| STY-003 | Ashley Chen | Thursday | 10:00 | 18:00 |
| STY-003 | Ashley Chen | Friday | 10:00 | 19:00 |
| STY-003 | Ashley Chen | Saturday | 09:00 | 16:00 |
| STY-004 | Devon Williams | Monday | 09:00 | 17:00 |
| STY-004 | Devon Williams | Wednesday | 09:00 | 17:00 |
| STY-004 | Devon Williams | Thursday | 09:00 | 17:00 |
| STY-004 | Devon Williams | Friday | 09:00 | 19:00 |
| STY-004 | Devon Williams | Saturday | 09:00 | 15:00 |

## 3. n8n Configuration

### Google Sheets Credentials
1. In n8n, go to **Credentials** > **Add Credential**
2. Search for **Google Sheets OAuth2 API**
3. Follow the OAuth2 setup flow
4. Name it: `Google Sheets - Salon`

### After Creating Workflows
Each workflow has placeholder nodes for the Google Sheet document ID.
Open each workflow in n8n and:
1. Click on each Google Sheets node
2. Select your spreadsheet from the dropdown
3. Save and activate

## 4. Webhook Endpoints (after deployment)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook/get-services` | GET | List all salon services |
| `/webhook/check-availability` | POST | Check stylist availability for a date |
| `/webhook/book-appointment` | POST | Book a new appointment |
| `/webhook/cancel-appointment` | POST | Cancel an existing appointment |
| `/webhook/get-stylist-schedule` | POST | Get a stylist's schedule for a date |

## 5. Vapi Assistant (SARA)

SARA is already configured in Vapi:

| Component | ID |
|-----------|------|
| **Assistant** | `8feba76a-8147-4d93-af10-fd0988c3a47e` |
| **get_services tool** | `979be08c-ab71-4c13-ba91-1422673acaac` |
| **check_availability tool** | `1cc9f36b-61f9-499b-b655-0f4e227af347` |
| **book_appointment tool** | `3e74b937-4979-456f-9599-d12909636177` |
| **cancel_appointment tool** | `eb5dc288-3f87-4a83-9902-da8093e4981b` |
| **get_stylist_schedule tool** | `7e3d939a-89fb-431c-a60b-72551b47449e` |

### Attach a phone number
Assign one of your existing Vapi phone numbers to the SARA assistant:
- Main Street Salon: `+16109986669` (id: `59032246-649b-4c2d-9ca8-af5af8a278d6`)
- Or buy a new number via the Vapi dashboard

### Voice Settings
- **Voice**: ElevenLabs "Rachel" (voiceId: `21m00Tcm4TlvDq8ikWAM`)
- **STT**: Deepgram Nova-3
- **Model**: Anthropic Claude 3.7 Sonnet, temp 0.3

## 6. Testing with curl

```bash
# Base URL
BASE=https://infoharmonia.app.n8n.cloud

# Get all services
curl $BASE/webhook/get-services

# Check availability (name-based, Vapi-compatible)
curl -X POST $BASE/webhook/check-availability \
  -H "Content-Type: application/json" \
  -d '{"stylist_name": "Jessica Martinez", "date": "2026-03-28", "service_name": "Women'\''s Haircut"}'

# Book appointment (name-based, Vapi-compatible)
curl -X POST $BASE/webhook/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Jane Doe",
    "client_phone": "555-2001",
    "service_name": "Women'\''s Haircut",
    "stylist_name": "Jessica Martinez",
    "date": "2026-03-28",
    "time": "11:00"
  }'

# Cancel appointment
curl -X POST $BASE/webhook/cancel-appointment \
  -H "Content-Type: application/json" \
  -d '{"appointment_id": "APT-001"}'

# Get stylist schedule (name-based, Vapi-compatible)
curl -X POST $BASE/webhook/get-stylist-schedule \
  -H "Content-Type: application/json" \
  -d '{"stylist_name": "Jessica Martinez", "date": "2026-03-28"}'
```
