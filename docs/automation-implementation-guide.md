# Automation Implementation Guide

## Quick Start Configurations for Top Solutions

This guide provides ready-to-implement node configurations for the most impactful automation solutions.

---

## Solution 1: Company Document RAG Chatbot

### Architecture
```
[Google Drive Trigger] → [Document Loader] → [Text Splitter] → [Embeddings] → [Vector Store]
                                                                                    ↓
[Chat Trigger] → [AI Agent] ← [Vector Store Tool] ← [Vector Store Retriever] ← [Vector Store]
                    ↑
            [Language Model]
                    ↑
            [Window Buffer Memory]
```

### Core Node Configurations

#### Chat Trigger
```json
{
  "type": "@n8n/n8n-nodes-langchain.chatTrigger",
  "parameters": {
    "options": {
      "responseMode": "lastNode"
    }
  }
}
```

#### AI Agent
```json
{
  "type": "@n8n/n8n-nodes-langchain.agent",
  "typeVersion": 3.1,
  "parameters": {
    "promptType": "auto",
    "options": {
      "systemMessage": "You are a helpful assistant that answers questions about company documents. Use the available tools to search the knowledge base before answering. Be accurate and cite your sources when possible. If you don't find relevant information, say so clearly."
    }
  }
}
```

#### OpenAI Chat Model
```json
{
  "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "parameters": {
    "model": "gpt-4o",
    "temperature": 0.3,
    "options": {}
  }
}
```

#### Pinecone Vector Store (Insert Mode)
```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStorePinecone",
  "parameters": {
    "mode": "insert",
    "pineconeIndex": {
      "__rl": true,
      "mode": "list",
      "value": "company-documents"
    },
    "options": {}
  }
}
```

#### Vector Store Tool
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolVectorStore",
  "parameters": {
    "name": "company_documents",
    "description": "Search company documents including policies, procedures, product information, and internal guidelines. Use this tool to find relevant information before answering questions.",
    "topK": 5
  }
}
```

#### Text Splitter
```json
{
  "type": "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
  "parameters": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "options": {}
  }
}
```

#### Window Buffer Memory
```json
{
  "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "parameters": {
    "sessionIdType": "fromInput",
    "sessionKey": "sessionId",
    "windowSize": 10
  }
}
```

---

## Solution 2: Lead Scoring & Routing System

### Architecture
```
[Webhook/Form] → [Set Data] → [AI Agent] → [Structured Output Parser] → [Switch] → [Hot Route]
                                                                            ↓     → [Warm Route]
                                                                            ↓     → [Cool Route]
                                                                            ↓     → [Cold Route]
                                                                        [Airtable Log]
```

### Core Node Configurations

#### Webhook Trigger
```json
{
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "path": "lead-intake",
    "httpMethod": "POST",
    "responseMode": "responseNode",
    "options": {}
  }
}
```

#### Lead Scoring AI Agent
```json
{
  "type": "@n8n/n8n-nodes-langchain.agent",
  "typeVersion": 3.1,
  "parameters": {
    "promptType": "define",
    "text": "Analyze this lead and provide a score:\n\nName: {{ $json.name }}\nEmail: {{ $json.email }}\nPhone: {{ $json.phone }}\nSource: {{ $json.source }}\nMessage: {{ $json.message }}\nService Requested: {{ $json.service }}",
    "options": {
      "systemMessage": "You are a lead qualification specialist for an HVAC company. Score leads from 0-100 based on:\n\n- Urgency indicators (emergency, broken, no heat/AC = +30)\n- Service type (installation = +25, repair = +20, maintenance = +10)\n- Budget indicators (mentions budget, ready to proceed = +15)\n- Timeline (immediate = +20, this week = +15, this month = +10)\n- Contact quality (phone provided = +10, detailed message = +10)\n\nProvide the score and a brief reasoning."
    },
    "hasOutputParser": true
  }
}
```

#### Structured Output Parser
```json
{
  "type": "@n8n/n8n-nodes-langchain.outputParserStructured",
  "parameters": {
    "jsonSchemaExample": {
      "score": 85,
      "category": "HOT",
      "reasoning": "Emergency AC repair needed, customer provided phone and is ready to proceed today",
      "recommended_action": "Immediate outbound call",
      "urgency_level": "high"
    }
  }
}
```

#### Routing Switch
```json
{
  "type": "n8n-nodes-base.switch",
  "parameters": {
    "rules": {
      "values": [
        {
          "outputKey": "hot",
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.score }}",
                "operator": { "type": "number", "operation": "gte" },
                "rightValue": 85
              }
            ]
          },
          "renameOutput": true
        },
        {
          "outputKey": "warm",
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.score }}",
                "operator": { "type": "number", "operation": "gte" },
                "rightValue": 70
              }
            ]
          },
          "renameOutput": true
        },
        {
          "outputKey": "cool",
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.score }}",
                "operator": { "type": "number", "operation": "gte" },
                "rightValue": 50
              }
            ]
          },
          "renameOutput": true
        }
      ],
      "fallbackOutput": "cold"
    }
  }
}
```

---

## Solution 3: Multi-System Natural Language Assistant

### Architecture
```
[Chat Trigger] → [AI Agent] ← [Google Sheets Tool]
                     ↑       ← [HTTP Request Tool (CRM)]
              [Language Model] ← [Code Tool (Calculations)]
                     ↑       ← [Sub-Workflow Tool]
              [Memory]
```

### Core Node Configurations

#### AI Agent with Multiple Tools
```json
{
  "type": "@n8n/n8n-nodes-langchain.agent",
  "typeVersion": 3.1,
  "parameters": {
    "promptType": "auto",
    "options": {
      "systemMessage": "You are a business assistant with access to company data and systems. You can:\n\n1. Query Google Sheets for sales data, inventory, and reports\n2. Access CRM for customer information\n3. Perform calculations and data analysis\n4. Execute specialized workflows for complex tasks\n\nAlways be helpful, accurate, and proactive. When fetching data, summarize key insights. For multi-step tasks, break them down and confirm before proceeding."
    }
  }
}
```

#### Google Sheets Tool
```json
{
  "type": "n8n-nodes-base.googleSheetsTool",
  "parameters": {
    "operation": "read",
    "documentId": {
      "__rl": true,
      "mode": "list",
      "value": "YOUR_SHEET_ID"
    },
    "sheetName": {
      "__rl": true,
      "mode": "list",
      "value": "Sales Data"
    },
    "options": {
      "toolDescription": "Read sales data from the company spreadsheet. Use this to get information about revenue, transactions, customers, and historical sales trends."
    }
  }
}
```

#### HTTP Request Tool (CRM Integration)
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "parameters": {
    "method": "GET",
    "url": "https://api.yourcrm.com/v1/customers/{customerId}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth",
    "toolDescription": "Fetch customer details from CRM. Requires customerId parameter. Returns customer name, contact info, purchase history, and account status.",
    "placeholderDefinitions": {
      "values": [
        {
          "name": "customerId",
          "type": "string",
          "description": "The unique customer ID to look up"
        }
      ]
    }
  }
}
```

#### Code Tool (Calculations)
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolCode",
  "parameters": {
    "name": "calculate_metrics",
    "description": "Perform business calculations including revenue analysis, growth rates, averages, and projections. Input should include the calculation type and relevant numbers.",
    "language": "javaScript",
    "code": "const { calculation, values } = $input;\n\nswitch(calculation) {\n  case 'average':\n    return { result: values.reduce((a,b) => a+b, 0) / values.length };\n  case 'growth_rate':\n    return { result: ((values[1] - values[0]) / values[0] * 100).toFixed(2) + '%' };\n  case 'sum':\n    return { result: values.reduce((a,b) => a+b, 0) };\n  default:\n    return { error: 'Unknown calculation type' };\n}",
    "specifyInputSchema": true,
    "inputSchema": "{ \"type\": \"object\", \"properties\": { \"calculation\": { \"type\": \"string\", \"enum\": [\"average\", \"growth_rate\", \"sum\"] }, \"values\": { \"type\": \"array\", \"items\": { \"type\": \"number\" } } } }"
  }
}
```

#### Sub-Workflow Tool
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "name": "generate_report",
    "description": "Generate a detailed business report. Use this for complex reporting needs that require multiple data sources and formatting.",
    "workflowId": {
      "__rl": true,
      "mode": "list",
      "value": "REPORT_WORKFLOW_ID"
    },
    "workflowInputs": {
      "value": {
        "report_type": "={{ $fromAI('report_type', 'Type of report: sales, inventory, customer', 'string') }}",
        "date_range": "={{ $fromAI('date_range', 'Date range for the report', 'string') }}"
      },
      "schema": [
        {
          "id": "report_type",
          "type": "string",
          "required": true
        },
        {
          "id": "date_range",
          "type": "string",
          "required": true
        }
      ],
      "mappingMode": "defineBelow"
    }
  }
}
```

---

## Solution 4: Personalized Communication Generator

### Architecture
```
[Trigger] → [Fetch Customer Data] → [AI Agent] → [Generate Content] → [Switch by Channel]
                                        ↑                                   ↓
                                  [Language Model]                    [SendGrid Email]
                                        ↑                             [Twilio SMS]
                                  [Output Parser]                     [Slack Message]
```

### Core Node Configurations

#### Content Generation Agent
```json
{
  "type": "@n8n/n8n-nodes-langchain.agent",
  "typeVersion": 3.1,
  "parameters": {
    "promptType": "define",
    "text": "Generate a personalized {{ $json.message_type }} for this customer:\n\nName: {{ $json.customer_name }}\nLast Service: {{ $json.last_service }}\nLast Service Date: {{ $json.last_service_date }}\nPreferred Communication: {{ $json.preferred_channel }}\nSpecial Notes: {{ $json.notes }}\n\nContext: {{ $json.context }}",
    "options": {
      "systemMessage": "You are a friendly customer communication specialist for an HVAC company. Generate warm, professional messages that:\n\n1. Address the customer by name\n2. Reference their service history when relevant\n3. Include a clear call-to-action\n4. Match the tone to the message type (urgent for emergencies, friendly for follow-ups)\n5. Keep messages concise (SMS: 160 chars, Email: 2-3 paragraphs)\n\nAlways sound human, not robotic. Avoid generic phrases."
    },
    "hasOutputParser": true
  }
}
```

#### Output Parser for Multi-Channel
```json
{
  "type": "@n8n/n8n-nodes-langchain.outputParserStructured",
  "parameters": {
    "jsonSchemaExample": {
      "email_subject": "Time for your annual AC tune-up, John!",
      "email_body": "Hi John,\n\nIt's been almost a year since we serviced your Carrier AC unit at 123 Main St. Spring is the perfect time for a tune-up before the summer heat hits.\n\nAs a valued customer, we're offering you 15% off your annual maintenance visit.\n\nReply to this email or call us at (555) 123-4567 to schedule.\n\nBest,\nSam\nSenior Dispatcher",
      "sms_message": "Hi John! Time for your AC tune-up before summer. 15% off for valued customers. Reply YES to schedule or call (555) 123-4567 - Sam at HVAC Co",
      "recommended_channel": "email",
      "urgency": "low"
    }
  }
}
```

#### SendGrid Email
```json
{
  "type": "n8n-nodes-base.sendGrid",
  "parameters": {
    "resource": "mail",
    "toEmail": "={{ $json.customer_email }}",
    "fromEmail": "service@yourhvac.com",
    "subject": "={{ $json.email_subject }}",
    "text": "={{ $json.email_body }}",
    "additionalFields": {
      "categories": ["automated", "{{ $json.message_type }}"],
      "trackingSettings": {
        "clickTracking": true,
        "openTracking": true
      }
    }
  }
}
```

#### Twilio SMS
```json
{
  "type": "n8n-nodes-base.twilio",
  "parameters": {
    "operation": "send",
    "from": "+15551234567",
    "to": "={{ $json.customer_phone }}",
    "message": "={{ $json.sms_message }}"
  }
}
```

---

## Solution 5: Document Processing Pipeline

### Architecture
```
[File Trigger] → [Download] → [Extract] → [AI Analysis] → [Structured Output] → [Database]
      ↓                                         ↑                                    ↓
[Email Trigger]                          [Language Model]                      [Notification]
```

### Core Node Configurations

#### Information Extractor
```json
{
  "type": "@n8n/n8n-nodes-langchain.informationExtractor",
  "parameters": {
    "text": "={{ $json.extracted_text }}",
    "attributes": {
      "values": [
        {
          "name": "document_type",
          "description": "Type of document (invoice, contract, receipt, letter)",
          "type": "string"
        },
        {
          "name": "sender_name",
          "description": "Name of the person or company who sent the document",
          "type": "string"
        },
        {
          "name": "date",
          "description": "Date on the document in YYYY-MM-DD format",
          "type": "string"
        },
        {
          "name": "total_amount",
          "description": "Total monetary amount if applicable",
          "type": "number"
        },
        {
          "name": "key_items",
          "description": "List of main items, services, or topics mentioned",
          "type": "array"
        },
        {
          "name": "action_required",
          "description": "Any actions required based on the document",
          "type": "string"
        },
        {
          "name": "urgency",
          "description": "Urgency level: high, medium, low",
          "type": "string"
        }
      ]
    },
    "options": {
      "systemPromptTemplate": "Extract the requested information from this document. Be precise with numbers and dates. If information is not present, use null."
    }
  }
}
```

---

## Connection Patterns Reference

### AI Agent Connections (Critical)
```javascript
// Language Model → AI Agent (REQUIRED)
{
  type: "addConnection",
  source: "OpenAI Chat Model",
  target: "AI Agent",
  sourceOutput: "ai_languageModel"
}

// Tool → AI Agent
{
  type: "addConnection",
  source: "HTTP Request Tool",
  target: "AI Agent",
  sourceOutput: "ai_tool"
}

// Memory → AI Agent
{
  type: "addConnection",
  source: "Window Buffer Memory",
  target: "AI Agent",
  sourceOutput: "ai_memory"
}

// Output Parser → AI Agent
{
  type: "addConnection",
  source: "Structured Output Parser",
  target: "AI Agent",
  sourceOutput: "ai_outputParser"
}
```

### Vector Store Connections
```javascript
// Embeddings → Vector Store
{
  type: "addConnection",
  source: "Embeddings OpenAI",
  target: "Pinecone Vector Store",
  sourceOutput: "ai_embedding"
}

// Document Loader → Vector Store
{
  type: "addConnection",
  source: "Default Data Loader",
  target: "Pinecone Vector Store",
  sourceOutput: "ai_document"
}

// Vector Store → Vector Store Tool
{
  type: "addConnection",
  source: "Pinecone Vector Store",
  target: "Vector Store Tool",
  sourceOutput: "ai_vectorStore"
}
```

---

## Validation Checklist

Before deploying any workflow:

- [ ] All AI Agents have connected language models
- [ ] All tools have descriptions (15+ characters)
- [ ] Credentials are configured and tested
- [ ] Error handling nodes are in place
- [ ] Webhook URLs are secured (authentication if needed)
- [ ] Rate limits are considered (NVD API, OpenAI, etc.)
- [ ] Memory nodes have proper session ID configuration
- [ ] Output parsers have valid JSON schemas

---

## Common Issues & Solutions

### Issue: "AI Agent has no language model"
**Solution:** Connect language model with `sourceOutput: "ai_languageModel"`

### Issue: "Tool has no description"
**Solution:** Add `toolDescription` parameter (minimum 15 characters)

### Issue: Streaming not working
**Solution:** Remove main output connections from AI Agent when using streaming mode

### Issue: Memory not persisting
**Solution:** Ensure `sessionKey` matches across requests; use consistent session IDs

### Issue: Vector store queries returning no results
**Solution:** Verify embeddings model matches between insert and query operations

---

*Implementation Guide Version: 1.0*
*Compatible with: n8n 1.x, n8n-mcp latest*
