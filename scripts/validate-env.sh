#!/bin/bash

# ============================================================
# HARMONIA ENVIRONMENT VALIDATOR
# Checks all required environment variables and API connections
# ============================================================

echo "🔍 Harmonia Environment Validator"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Load .env if exists
if [ -f "../configs/.env" ]; then
    source "../configs/.env"
    echo -e "${GREEN}✓ Loaded .env file${NC}"
else
    echo -e "${YELLOW}⚠ No .env file found - using exported variables${NC}"
fi

echo ""
echo "Checking Required Variables..."
echo "------------------------------"

# Function to check variable
check_var() {
    local var_name=$1
    local var_value=${!var_name}
    local required=$2

    if [ -z "$var_value" ]; then
        if [ "$required" = "required" ]; then
            echo -e "${RED}✗ $var_name is not set${NC}"
            ((ERRORS++))
        else
            echo -e "${YELLOW}⚠ $var_name is not set (optional)${NC}"
            ((WARNINGS++))
        fi
    else
        # Mask sensitive values
        if [[ "$var_name" == *"SECRET"* ]] || [[ "$var_name" == *"KEY"* ]] || [[ "$var_name" == *"TOKEN"* ]]; then
            echo -e "${GREEN}✓ $var_name is set${NC} (${var_value:0:8}...)"
        else
            echo -e "${GREEN}✓ $var_name is set${NC} ($var_value)"
        fi
    fi
}

# Company Info
echo ""
echo "📋 Company Configuration"
check_var "COMPANY_NAME" "required"
check_var "COMPANY_PHONE" "required"

# ServiceTitan
echo ""
echo "🔧 ServiceTitan"
check_var "ST_CLIENT_ID" "required"
check_var "ST_CLIENT_SECRET" "required"
check_var "ST_TENANT_ID" "required"
check_var "ST_APP_KEY" "required"
check_var "DIAGNOSTIC_JOB_TYPE_ID" "required"

# Vapi
echo ""
echo "🎙️ Vapi"
check_var "VAPI_API_KEY" "required"
check_var "VAPI_PHONE_NUMBER_ID" "required"
check_var "VAPI_BOOKING_ASSISTANT_ID" "optional"
check_var "VAPI_EMERGENCY_ASSISTANT_ID" "optional"
check_var "VAPI_INBOUND_ASSISTANT_ID" "optional"

# Twilio
echo ""
echo "📱 Twilio"
check_var "TWILIO_ACCOUNT_SID" "required"
check_var "TWILIO_AUTH_TOKEN" "required"
check_var "TWILIO_PHONE_NUMBER" "required"

# Airtable
echo ""
echo "📊 Airtable"
check_var "AIRTABLE_API_KEY" "required"
check_var "AIRTABLE_BASE_ID" "required"

# OpenAI
echo ""
echo "🤖 OpenAI"
check_var "OPENAI_API_KEY" "required"

# SendGrid
echo ""
echo "📧 SendGrid"
check_var "SENDGRID_API_KEY" "required"
check_var "SENDGRID_FROM_EMAIL" "required"

# Team Phones
echo ""
echo "👥 Team Configuration"
check_var "MANAGER_PHONE" "required"
check_var "TECH_LEAD_PHONE" "optional"

# N8N
echo ""
echo "⚙️ n8n"
check_var "N8N_WEBHOOK_URL" "required"

# ============================================================
# API Connection Tests
# ============================================================

echo ""
echo "Testing API Connections..."
echo "--------------------------"

# Test ServiceTitan Auth
if [ -n "$ST_CLIENT_ID" ] && [ -n "$ST_CLIENT_SECRET" ]; then
    echo -n "Testing ServiceTitan auth... "
    ST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "https://auth.servicetitan.io/connect/token" \
        -d "grant_type=client_credentials&client_id=${ST_CLIENT_ID}&client_secret=${ST_CLIENT_SECRET}")

    if [ "$ST_RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (HTTP $ST_RESPONSE)${NC}"
        ((ERRORS++))
    fi
fi

# Test Vapi
if [ -n "$VAPI_API_KEY" ]; then
    echo -n "Testing Vapi API... "
    VAPI_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${VAPI_API_KEY}" \
        "https://api.vapi.ai/assistant")

    if [ "$VAPI_RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (HTTP $VAPI_RESPONSE)${NC}"
        ((ERRORS++))
    fi
fi

# Test Twilio
if [ -n "$TWILIO_ACCOUNT_SID" ] && [ -n "$TWILIO_AUTH_TOKEN" ]; then
    echo -n "Testing Twilio API... "
    TWILIO_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
        "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json")

    if [ "$TWILIO_RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (HTTP $TWILIO_RESPONSE)${NC}"
        ((ERRORS++))
    fi
fi

# Test OpenAI
if [ -n "$OPENAI_API_KEY" ]; then
    echo -n "Testing OpenAI API... "
    OPENAI_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${OPENAI_API_KEY}" \
        "https://api.openai.com/v1/models")

    if [ "$OPENAI_RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (HTTP $OPENAI_RESPONSE)${NC}"
        ((ERRORS++))
    fi
fi

# ============================================================
# Summary
# ============================================================

echo ""
echo "=================================="
echo "📊 Validation Summary"
echo "=================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for deployment.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️ $WARNINGS warning(s), but no errors. Review optional configs.${NC}"
else
    echo -e "${RED}❌ $ERRORS error(s) found. Please fix before deploying.${NC}"
fi

echo ""
exit $ERRORS
