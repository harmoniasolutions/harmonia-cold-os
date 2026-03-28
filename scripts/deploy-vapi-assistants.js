/**
 * HARMONIA - Vapi Assistant Deployment Script
 *
 * This script deploys all Vapi assistants from JSON configs.
 * Run with: node deploy-vapi-assistants.js
 *
 * Prerequisites:
 * - Node.js 18+
 * - VAPI_API_KEY environment variable set
 */

const fs = require('fs');
const path = require('path');

// Configuration
const VAPI_API_URL = 'https://api.vapi.ai';
const ASSISTANTS_DIR = path.join(__dirname, '..', 'vapi-assistants');

// Get API key from environment
const VAPI_API_KEY = process.env.VAPI_API_KEY;

if (!VAPI_API_KEY) {
    console.error('❌ Error: VAPI_API_KEY environment variable not set');
    console.log('Set it with: export VAPI_API_KEY="your-key-here"');
    process.exit(1);
}

// Company config - replace with your values
const COMPANY_CONFIG = {
    companyName: process.env.COMPANY_NAME || 'Your HVAC Company',
    companyPhone: process.env.COMPANY_PHONE || '+15551234567',
    diagnosticFee: process.env.DIAGNOSTIC_FEE || '89',
    emergencyFee: process.env.EMERGENCY_FEE || '149',
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || 'https://your-n8n.com',
    webhookSecret: process.env.N8N_WEBHOOK_SECRET || 'your-secret'
};

/**
 * Replace template variables in assistant config
 */
function replaceTemplateVars(config, vars) {
    let configStr = JSON.stringify(config);

    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        configStr = configStr.replace(regex, value);
    }

    return JSON.parse(configStr);
}

/**
 * Create or update a Vapi assistant
 */
async function deployAssistant(configPath) {
    const filename = path.basename(configPath);
    console.log(`\n📤 Deploying: ${filename}`);

    // Read config file
    let config;
    try {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(rawConfig);
    } catch (err) {
        console.error(`  ❌ Failed to read config: ${err.message}`);
        return null;
    }

    // Replace template variables
    config = replaceTemplateVars(config, COMPANY_CONFIG);

    // Check if assistant already exists (by name)
    try {
        const listResponse = await fetch(`${VAPI_API_URL}/assistant`, {
            headers: {
                'Authorization': `Bearer ${VAPI_API_KEY}`
            }
        });

        if (listResponse.ok) {
            const assistants = await listResponse.json();
            const existing = assistants.find(a => a.name === config.name);

            if (existing) {
                console.log(`  ℹ️  Found existing assistant: ${existing.id}`);
                console.log(`  🔄 Updating...`);

                // Update existing
                const updateResponse = await fetch(`${VAPI_API_URL}/assistant/${existing.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${VAPI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                if (updateResponse.ok) {
                    const updated = await updateResponse.json();
                    console.log(`  ✅ Updated: ${updated.id}`);
                    return updated;
                } else {
                    const error = await updateResponse.text();
                    console.error(`  ❌ Update failed: ${error}`);
                    return null;
                }
            }
        }
    } catch (err) {
        console.log(`  ℹ️  Could not check existing assistants: ${err.message}`);
    }

    // Create new assistant
    console.log(`  ➕ Creating new assistant...`);

    try {
        const createResponse = await fetch(`${VAPI_API_URL}/assistant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (createResponse.ok) {
            const created = await createResponse.json();
            console.log(`  ✅ Created: ${created.id}`);
            console.log(`  📝 Save this ID to your .env as the appropriate assistant ID`);
            return created;
        } else {
            const error = await createResponse.text();
            console.error(`  ❌ Create failed: ${error}`);
            return null;
        }
    } catch (err) {
        console.error(`  ❌ Request failed: ${err.message}`);
        return null;
    }
}

/**
 * Main deployment function
 */
async function main() {
    console.log('🚀 Harmonia Vapi Assistant Deployment');
    console.log('=====================================');
    console.log(`Company: ${COMPANY_CONFIG.companyName}`);
    console.log(`Webhook URL: ${COMPANY_CONFIG.n8nWebhookUrl}`);

    // Find all assistant configs
    const configFiles = fs.readdirSync(ASSISTANTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(ASSISTANTS_DIR, f));

    console.log(`\nFound ${configFiles.length} assistant configs`);

    const results = [];

    for (const configPath of configFiles) {
        const result = await deployAssistant(configPath);
        if (result) {
            results.push({
                name: result.name,
                id: result.id
            });
        }
    }

    // Summary
    console.log('\n=====================================');
    console.log('📋 Deployment Summary');
    console.log('=====================================\n');

    if (results.length > 0) {
        console.log('Add these to your .env file:\n');

        results.forEach(r => {
            let envVar = 'VAPI_';
            if (r.name.includes('Inbound')) envVar += 'INBOUND_ASSISTANT_ID';
            else if (r.name.includes('Outbound')) envVar += 'BOOKING_ASSISTANT_ID';
            else if (r.name.includes('Emergency')) envVar += 'EMERGENCY_ASSISTANT_ID';
            else envVar += 'ASSISTANT_ID';

            console.log(`${envVar}="${r.id}"`);
        });
    } else {
        console.log('No assistants were deployed successfully.');
    }

    console.log('\n✨ Done!');
}

// Run
main().catch(console.error);
