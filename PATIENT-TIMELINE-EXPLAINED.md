# PatientTimeline — How It Works (Plain English)

## The Big Idea

Think of the PatientTimeline as a patient's diary that the system writes automatically. Every time something happens with a patient — they submit their intake form, you upload a lab PDF, you add notes from a call, the AI generates a protocol — that event gets added to the timeline as a new entry.

It's like a running log:

```
Apr 15  Patient started intake form
Apr 15  Patient completed intake form
Apr 16  You uploaded GI Map PDF
Apr 16  System extracted lab values from the PDF
Apr 17  You added notes from discovery call
Apr 18  AI generated protocol draft
Apr 20  You approved the protocol
Apr 20  System auto-generated client action plan
Apr 20  System auto-generated call deck
```

## Why This Matters

**This is what makes the AI smart.** When the AI generates a protocol, it reads the entire timeline to understand the patient's full story — not just isolated pieces of data. It sees:

- What the patient said in their intake (symptoms, history, goals)
- What the lab results show (and which ones the practitioner corrected)
- What the practitioner noticed on calls (nuances the labs don't capture)
- What previous protocols were tried (and whether they worked)
- What the patient reported about their progress

Without the timeline, the AI only sees disconnected data points. With it, the AI sees the narrative — which is exactly how Dr. Laura thinks about her patients.

## What Gets Recorded

Every event falls into one of these categories:

**Intake events** — when the patient fills out the intake form, section by section, and when you review it.

**Document events** — when lab PDFs, call transcripts, or other files are uploaded and processed.

**Lab events** — when lab values are extracted from PDFs and when you review or correct them.

**Call and note events** — when you add notes from calls or record clinical observations.

**Protocol events** — the full lifecycle: AI generates a draft → you edit it → you approve it → system auto-generates the client doc and call deck.

**Patient journey events** — phase transitions, checklist progress, outcomes the patient reports, follow-ups scheduled.

**AI events** — when the AI generates follow-up questions or suggests which labs to order.

## What Each Event Looks Like

Every timeline entry has:

- **When it happened** (the clinical date, not just when it was entered)
- **What happened** (the event type)
- **Who did it** (you, the patient, or the system)
- **The details** (all the specifics, stored as structured data)
- **A one-line summary** (for showing on the dashboard: "Lab PDF uploaded: GI Map")
- **AI context** (a longer description the AI reads when generating protocols)

## How It Connects to Everything Else

The timeline doesn't replace the existing tables (patients, records, protocols). It connects them. When you upload a lab PDF:

1. The file goes into the `records` table (where it's always lived)
2. A timeline event is created that says "Lab PDF uploaded" and links to that record
3. When processing finishes, another event says "Lab values extracted" with the key findings

This means the timeline is the **story**, and the other tables are the **detailed data**. The AI reads the story to understand context, then dives into the detailed data when it needs specifics.

## What This Enables (That We Couldn't Do Before)

1. **Smarter protocols** — the AI sees the full patient journey, not just labs in isolation
2. **Dashboard activity feed** — you can see at a glance what's happening with all your patients
3. **Patient status tracking** — the system knows where each patient is in their journey
4. **Audit compliance** — every action is logged with who, what, and when (HIPAA requirement)
5. **Future: outcome tracking** — once patients report progress, the AI can learn what works

## What Happens Next

In Week 2, I'll create this table in the database and wire it up so events are automatically recorded as you and your patients use the system. You won't need to do anything differently — the timeline fills itself in as you work.
