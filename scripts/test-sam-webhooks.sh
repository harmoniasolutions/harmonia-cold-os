#!/bin/bash

# SAM HVAC Webhook Test Script
# Tests all 9 Vapi tool webhooks against n8n

N8N_BASE_URL="${N8N_WEBHOOK_URL:-https://labster777.app.n8n.cloud/webhook}"

echo "=========================================="
echo "SAM HVAC Webhook Test Suite"
echo "=========================================="
echo "Base URL: $N8N_BASE_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_webhook() {
    local name=$1
    local endpoint=$2
    local payload=$3

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" -X POST "$N8N_BASE_URL/$endpoint" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null)

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
        echo "  Response: $(echo $body | head -c 100)..."
    elif [ "$http_code" = "000" ]; then
        echo -e "${RED}FAIL${NC} (Connection refused)"
    else
        echo -e "${YELLOW}WARN${NC} (HTTP $http_code)"
        echo "  Response: $(echo $body | head -c 100)..."
    fi
    echo ""
}

echo "1. HVAC Triage"
test_webhook "hvac_triage" "hvac-triage" '{
    "customer_statement": "My AC is not cooling the house",
    "keywords": "no cooling, AC"
}'

echo "2. HVAC Pre-Diagnostic"
test_webhook "hvac_pre_diagnostic" "hvac-pre-diagnostic" '{
    "customer_name": "John Smith",
    "phone": "+15551234567",
    "address": "123 Main St",
    "symptoms": "AC running but not cooling",
    "system_age": "10 years",
    "system_type": "Central AC",
    "fuel_source": "Electric"
}'

echo "3. HVAC Check Availability"
test_webhook "hvac_check_availability" "hvac-get-availability" '{
    "priority": "P3",
    "service_type": "DIAGNOSTIC",
    "zip_code": "85001"
}'

echo "4. HVAC Book Service"
test_webhook "hvac_book_service" "hvac-book-service" '{
    "customer_name": "John Smith",
    "phone": "+15551234567",
    "address": "123 Main St, Phoenix AZ 85001",
    "slot_id": "slot_001",
    "issue": "AC not cooling",
    "service_type": "DIAGNOSTIC"
}'

echo "5. HVAC Create Lead"
test_webhook "hvac_create_lead" "hvac-create-lead" '{
    "customer_name": "Jane Doe",
    "phone": "+15559876543",
    "is_homeowner": true,
    "interest": "NEW_SYSTEM",
    "timeline": "THIS_MONTH"
}'

echo "6. HVAC Emergency"
test_webhook "hvac_emergency" "hvac-emergency-escalate" '{
    "customer_name": "Emergency Test",
    "phone": "+15551112222",
    "emergency_type": "GAS_LEAK",
    "safety_confirmed": true,
    "description": "Customer smells gas"
}'

echo "7. Send Confirmation SMS"
test_webhook "send_confirmation_sms" "hvac-send-confirmation" '{
    "phone": "+15551234567",
    "customer_name": "John",
    "appointment_date": "Monday, February 3rd",
    "appointment_time": "9 AM - 11 AM",
    "confirmation_number": "APT-12345"
}'

echo "8. Lookup Customer"
test_webhook "lookup_customer" "hvac-lookup-customer" '{
    "phone": "+15551234567"
}'

echo "9. HVAC Knowledge Base"
test_webhook "hvac_knowledge_base" "hvac-knowledge-base" '{
    "query_type": "pricing",
    "specific_question": "How much is a diagnostic fee?"
}'

echo "=========================================="
echo "Test Complete"
echo "=========================================="
