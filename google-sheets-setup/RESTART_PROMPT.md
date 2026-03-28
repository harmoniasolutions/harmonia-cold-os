# Copy everything below this line and paste when Claude Code restarts:

---

Execute the SAM HVAC Google Sheets CRM setup. All context and data files are ready in `/Users/labster/Desktop/Harmonia/google-sheets-setup/`.

## Immediate Actions (execute all without asking):

1. **Read context files**:
   - `SETUP_CONTEXT.md` - assistant & tool details
   - `N8N_WORKFLOW_PLAN.md` - n8n update plan

2. **Test Google Sheets MCP connection** - verify the MCP server is working

3. **Create master spreadsheet** named "SAM HVAC CRM" with 6 sheets:
   - Customers
   - Bookings
   - Leads
   - Emergencies
   - Diagnostics
   - KnowledgeBase

4. **Populate each sheet** using the CSV files in `sheets/` folder:
   - `01_customers.csv` → Customers sheet
   - `02_bookings.csv` → Bookings sheet
   - `03_leads.csv` → Leads sheet
   - `04_emergencies.csv` → Emergencies sheet
   - `05_diagnostics.csv` → Diagnostics sheet
   - `06_knowledge_base.csv` → KnowledgeBase sheet

5. **Report the Spreadsheet ID** - I need this to configure n8n workflows

6. **Connect to n8n MCP** and list current workflows to identify which ones handle the HVAC webhooks

Do not ask for confirmation - execute all steps and report results.
