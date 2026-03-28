#!/bin/bash

# ============================================================
# HARMONIA WEBHOOK TESTING SCRIPT
# Tests all n8n webhooks with sample payloads
# ============================================================

# Load environment variables
if [ -f "../configs/.env" ]; then
    source "../configs/.env"
else
    echo "⚠️  No .env file found. Using defaults."
    N8N_WEBHOOK_URL="http://localhost:5678"
fi

echo "🧪 Harmonia Webhook Test Suite"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================
# TEST 1: Lead Intake Webhook (Google LSA format)
# ============================================================
echo "📥 Test 1: Lead Intake - Google LSA Format"
echo "-------------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/lead-intake" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_type": "MESSAGE",
    "google_key": "test-google-key-123",
    "user_name": "John Smith",
    "phone_number": "+15551234567",
    "email": "john.smith@email.com",
    "postal_address": "123 Oak Street, Springfield, IL 62701",
    "text": "My AC stopped working this morning. No cooling at all. System is about 12 years old.",
    "category_name": "HVAC Repair"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
    echo "  Response: $BODY"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
    echo "  Response: $BODY"
fi
echo ""

# ============================================================
# TEST 2: Lead Intake Webhook (Facebook Lead format)
# ============================================================
echo "📥 Test 2: Lead Intake - Facebook Lead Format"
echo "----------------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/lead-intake" \
  -H "Content-Type: application/json" \
  -d '{
    "leadgen_id": "fb-lead-456",
    "page_id": "123456789",
    "form_id": "987654321",
    "field_data": [
      {"name": "full_name", "values": ["Jane Doe"]},
      {"name": "phone_number", "values": ["+15559876543"]},
      {"name": "email", "values": ["jane.doe@email.com"]},
      {"name": "street_address", "values": ["456 Maple Ave"]},
      {"name": "city", "values": ["Chicago"]},
      {"name": "state", "values": ["IL"]},
      {"name": "zip_code", "values": ["60601"]},
      {"name": "service_needed", "values": ["Furnace making strange noises"]}
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# ============================================================
# TEST 3: Lead Intake Webhook (Elementor Form format)
# ============================================================
echo "📥 Test 3: Lead Intake - Elementor Form Format"
echo "-----------------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/lead-intake" \
  -H "Content-Type: application/json" \
  -H "x-elementor-webhook: true" \
  -d '{
    "form_id": "contact-form-1",
    "form_name": "HVAC Service Request",
    "fields": {
      "name": "Bob Wilson",
      "phone": "555-222-3333",
      "email": "bob@example.com",
      "address": "789 Pine St",
      "city": "Milwaukee",
      "state": "WI",
      "zip": "53201",
      "message": "I am the homeowner. My heat is not working and it is freezing. This is urgent!"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
    echo "  Note: This should trigger EMERGENCY routing"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# ============================================================
# TEST 4: Twilio Inbound SMS Webhook
# ============================================================
echo "📱 Test 4: Twilio Inbound SMS (Interested Reply)"
echo "-------------------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/twilio-inbound-sms" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+15551234567&To=+15559876543&Body=Yes I am interested&MessageSid=SM123456&NumMedia=0")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# ============================================================
# TEST 5: Twilio Inbound SMS (STOP)
# ============================================================
echo "📱 Test 5: Twilio Inbound SMS (STOP Request)"
echo "---------------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/twilio-inbound-sms" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+15559999999&To=+15559876543&Body=STOP&MessageSid=SM789012&NumMedia=0")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
    echo "  Note: This should add to DNC list"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# ============================================================
# TEST 6: Vapi Inbound Call Webhook
# ============================================================
echo "📞 Test 6: Vapi Inbound Call Webhook"
echo "-------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${N8N_WEBHOOK_URL}/webhook/vapi-inbound" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "function-call",
      "call": {
        "id": "call-123",
        "customer": {
          "number": "+15551234567",
          "name": "Test Customer"
        }
      }
    },
    "extracted_data": {
      "caller_name": "Test Customer",
      "address": "123 Test St",
      "city": "Test City",
      "state": "IL",
      "zip": "60601",
      "issue_description": "AC not cooling properly"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠ Response (HTTP $HTTP_CODE)${NC}"
    echo "  Note: May require ServiceTitan auth to fully succeed"
fi
echo ""

# ============================================================
# SUMMARY
# ============================================================
echo "================================"
echo "🏁 Test Suite Complete"
echo ""
echo "Next Steps:"
echo "1. Check n8n execution logs for details"
echo "2. Verify Airtable records were created"
echo "3. Check Twilio logs for outbound SMS"
echo "4. Review Vapi dashboard for call logs"
echo ""
