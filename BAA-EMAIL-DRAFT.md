# Anthropic BAA Request — Email Draft

**Send to:** sales@anthropic.com
**Subject:** BAA Request — Clinical Signal (Healthcare SaaS)

---

Hi Anthropic team,

I'm building Clinical Signal, a HIPAA-compliant SaaS platform for functional health practitioners. The platform uses the Claude API to analyze patient lab results, intake data, and clinical notes to generate clinical protocols.

Because our application processes Protected Health Information (PHI) through the Claude API, we need a Business Associate Agreement (BAA) in place before we can work with real patient data.

Here are the relevant details:

- **Company:** Clinical Signal
- **Use case:** AI-assisted clinical protocol generation for licensed functional health practitioners
- **API usage:** Claude Sonnet for clinical analysis and protocol generation (estimated 50-200 API calls/month initially, growing with customer base)
- **PHI involved:** Patient intake data, lab results (structured values), clinical notes, and call transcripts are included in API prompts. Patient identifiers (name, DOB) are stripped before API calls.
- **Current plan:** We're currently on a standard API plan and would like to understand what's needed to establish a BAA

Could you let me know:
1. Do you offer BAAs for API customers?
2. Is there a specific plan or tier required?
3. What does the process and timeline look like?

Happy to provide any additional information needed. We're targeting real-patient readiness within the next 6-8 weeks.

Thanks,
Ryan Tabloff
Clinical Signal
hebrewhammer@hebrew-hammer.com

---

**Notes for Ryan:**
- Send this as soon as possible — legal processes can take weeks
- You can use synthetic/test data with the API while waiting for the BAA
- Once they respond, they may require you to be on an enterprise or team plan
- The BAA covers Anthropic as a "business associate" under HIPAA — it means they agree to protect any PHI that flows through their API
