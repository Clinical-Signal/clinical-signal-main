# Week 1 — Step-by-Step Guide

**4 tasks running in parallel this week. None depend on each other, so you can work on them in any order.**

| Task | What you do | What I do | GitHub Issue |
|------|-------------|-----------|--------------|
| 1a. Aptible setup | Sign up, create account | Guide you through it | #44 |
| 7a. Intake question map | Collaborate with Dr. Laura | Draft the question map for her review | #57 |
| 13a. Protocol audit | Share your notes from the alpha test | Catalog every gap and propose fixes | #73 |
| 21a. Timeline schema | Nothing — this is pure code design | Design the database schema | #93 |

---

## Task 1: Aptible Setup (Issue #44)

**Goal:** Get a HIPAA-compliant hosting account where we can deploy Clinical Signal.

### ⚠️ Important pricing update

My earlier estimate of ~$185/mo was wrong. Aptible's Production plan (required for HIPAA) is **$499/month**. They do offer startup credits that can cover the first 6 months — you should apply for those. Even at full price, this is still reasonable if you have 3-4 practitioners paying $200+/mo. But I want you to know the real number before you sign up.

**Alternative if $499/mo is too steep right now:** We can stay on Railway for development and testing with synthetic (fake) patient data, and only move to Aptible when you're ready for real patients. The intake form, protocol quality improvements, and data model work don't require HIPAA infrastructure — they can all be built and tested on Railway. Just no real patient data until Aptible is live.

### Steps

**Step 1: Go to Aptible's website**
- Open your browser and go to **aptible.com**
- Click "Get Started" or "Sign Up"

**Step 2: Create your account**
- Use your Clinical Signal email
- Company name: Clinical Signal
- When it asks about your use case, mention HIPAA and healthcare

**Step 3: Apply for startup credits (important!)**
- Look for a "Startup Program" or "Credits" link on their site
- If you can't find it, email sales@aptible.com with something like:
  > "Hi, I'm building Clinical Signal, a HIPAA-compliant platform for healthcare practitioners. We're a pre-revenue startup and interested in your startup credit program. Can you share details?"
- This could save you $3,000 (6 months free)

**Step 4: Install the Aptible CLI**
- Open Terminal on your Mac
- Run:
  ```
  brew install --cask aptible
  ```
- Then log in:
  ```
  aptible login
  ```
- Enter your email and password when prompted

**Step 5: Create your environment**
- In the Aptible dashboard (web browser), create a new environment
- Name it something like `production`
- Select the "Dedicated" stack option (this is the HIPAA-compliant one)

**Step 6: Tell me when you're set up**
- Once you have an Aptible account and environment, let me know
- I'll handle deploying the app (Issue #45 — 1b)

### What "done" looks like
- You can log into the Aptible dashboard
- You have an environment created
- You know your pricing situation (full price or startup credits)

---

## Task 2: Intake Question Map with Dr. Laura (Issue #57)

**Goal:** Design every question the patient intake form will ask, organized by section, including which answers trigger deeper follow-up questions.

This is the most important design task of the week. The quality of the intake determines the quality of the protocol. I'll draft the initial question map based on what Dr. Laura described in the transcripts, and then you and Dr. Laura review and refine it.

### Steps

**Step 1: Review the draft question map (below)**

I've drafted the sections and questions based on what Dr. Laura described. Read through it and mark anything that's wrong, missing, or unnecessary.

**Step 2: Schedule a 30-minute call with Dr. Laura**

Walk through the question map together. Key questions to ask her:
- "For each section — is anything missing that you'd need to generate a good protocol?"
- "Which of these are must-have vs. nice-to-have?"
- "What answers would make you want to ask deeper follow-up questions?"
- "Are there questions where a photo upload (like supplement bottles) would be easier than typing?"

**Step 3: Send me the feedback**

After the call, tell me what changed. I'll update the question map and we'll finalize it.

### Draft Intake Question Map

**Section 1: About You (required for everyone)**
- Full name
- Date of birth
- Sex assigned at birth (male / female / intersex)
- Gender identity (if different from above)
- Height and weight
- Location (state — helps with practitioner licensing and lab availability)
- Emergency contact (name, relationship, phone)

**Section 2: Why You're Here**
- "In your own words, what brings you here?" (open text, 2-3 sentences)
- "What are your top 3 health goals right now?" (open text)
- "On a scale of 1-10, how would you rate your overall health today?"
- "How motivated are you to make changes right now?" (1-10)

**Section 3: Current Symptoms** (multi-select with severity)
- Energy & fatigue
- Sleep quality
- Digestive issues (bloating, gas, constipation, diarrhea, reflux)
- Skin issues (acne, eczema, rashes, dryness)
- Mood (anxiety, depression, irritability, brain fog)
- Hormonal (irregular cycles, hot flashes, PMS, low libido)
- Pain (joint, muscle, headaches, migraines)
- Weight (difficulty losing, unintended gain/loss)
- Immune (frequent illness, autoimmune diagnosis)
- Other (open text)

*For each symptom checked:*
- Severity (1-10)
- How long has this been going on? (dropdown: weeks, months, 1-2 years, 3+ years, lifelong)
- Getting better, worse, or staying the same?

**→ CONDITIONAL TRIGGER:** If digestive issues checked → unlock Section 7 (Gut Health Deep Dive)
**→ CONDITIONAL TRIGGER:** If hormonal symptoms checked → unlock Section 8 (Hormone Deep Dive)
**→ CONDITIONAL TRIGGER:** If autoimmune checked → unlock Section 9 (Immune Deep Dive)

**Section 4: Health History**
- Current medical diagnoses (list)
- Past surgeries (list with dates)
- Hospitalizations (list with dates and reason)
- Family health history:
  - Heart disease, diabetes, cancer, autoimmune, thyroid, mental health (checkboxes for mom, dad, siblings, grandparents)
- "Anything else about your health history we should know?" (open text)

**Section 5: Medications & Supplements**
- Current prescription medications:
  - Name, dose, how long, prescribing doctor, what it's for
  - (Repeat for each medication)
- Current supplements:
  - Name, brand (if known), dose, how long, why you take it, who recommended it (self / practitioner / doctor)
  - (Repeat for each supplement)
  - *Future: photo upload of supplement bottles (Phase 2)*
- Any medications or supplements you've stopped in the last 6 months? What and why?

**→ AI FOLLOW-UP POINT:** After this section, AI generates targeted questions based on what they listed (e.g., "You mentioned vitamin D — what dosage? Do you take it with K2?")

**Section 6: Lifestyle**
- Diet:
  - How would you describe your current diet? (dropdown: standard American, paleo, keto, carnivore, vegetarian, vegan, Mediterranean, no specific diet, other)
  - Any food sensitivities or allergies? (list)
  - How many meals per day?
  - Do you eat breakfast? (yes/no)
  - Water intake (glasses per day)
  - Alcohol (never / rarely / weekly / daily + amount)
  - Caffeine (type + amount)
- Exercise:
  - Type(s) of exercise (multi-select: walking, running, weights, yoga, HIIT, swimming, sports, none)
  - How often? (times per week)
  - How long per session?
- Sleep:
  - Average hours per night
  - Trouble falling asleep? (yes/no)
  - Trouble staying asleep? (yes/no)
  - Wake feeling rested? (never / sometimes / usually / always)
  - Bedtime and wake time
- Stress:
  - Current stress level (1-10)
  - Top stressors (open text)
  - What do you currently do to manage stress? (open text)
- Other:
  - Do you use a sauna? (yes/no)
  - Do you do cold exposure? (yes/no)
  - Do you meditate or do breathwork? (yes/no)
  - Do you journal? (yes/no)

**→ AI FOLLOW-UP POINT:** For any "yes" on sauna/cold/meditation — AI asks specifics (type, frequency, duration, temperature)

**→ CONDITIONAL TRIGGER:** If sauna = yes → "What type? (infrared / traditional / steam) How hot? How long per session? How often?"
**→ CONDITIONAL TRIGGER:** If exercise ≠ none → "Do you track your workouts? Do you use a heart rate monitor?"

**Section 7: Gut Health Deep Dive** (only shows if digestive issues flagged in Section 3)
- Describe your typical bowel habits (frequency, consistency — Bristol stool chart reference)
- Bloating: when does it happen? After specific foods?
- Any diagnosed GI conditions? (IBS, IBD, SIBO, Candida, H. pylori, celiac)
- Previous GI testing? (GI Map, SIBO breath test, endoscopy, colonoscopy) — when and results if known
- History of antibiotic use (frequency, most recent)
- History of antacid/PPI use
- Any food elimination trials? What happened?

**→ AI FOLLOW-UP POINT:** AI asks about specific patterns based on what they describe

**Section 8: Hormone Deep Dive** (only shows if hormonal symptoms flagged in Section 3)
- Menstrual cycle:
  - Regular or irregular?
  - Cycle length (days)
  - Period length (days)
  - PMS symptoms (list)
  - Last period date
- Menopause status (pre / peri / post / N/A)
- Any hormone replacement therapy (HRT)? Current or past?
- Thyroid: any thyroid diagnosis or symptoms?
- History of PCOS, endometriosis, fibroids?
- Previous hormone testing? (DUTCH, blood panel) — when and results if known
- Birth control: current or recent use? Type?

**→ AI FOLLOW-UP POINT:** AI asks specifics based on what's flagged

**Section 9: Immune Deep Dive** (only shows if autoimmune flagged in Section 3)
- Which autoimmune condition(s)?
- When diagnosed?
- Current treatment (medications, biologics)?
- Any known triggers for flares?
- Frequency of common illness (colds, flu per year)
- Vaccination history (any relevant recent ones)
- Mold exposure history?
- Tick-borne illness history?

**Section 10: Previous Labs & Testing**
- What lab work have you had done in the last 12 months? (checklist: blood panel, thyroid, hormone, GI Map, DUTCH, food sensitivity, organic acids, heavy metals, nutrient levels, genetic/DNA, other)
- For each checked: approximate date, do you have results? (yes — will upload / yes — don't have access / no)
- Upload area for lab PDFs
- "Is there anything in your lab results that concerned you or your doctor?" (open text)

**Section 11: Wearables & Tracking** (optional)
- Do you use any health tracking devices or apps? (multi-select: Apple Watch, Whoop, Oura Ring, Fitbit, continuous glucose monitor, period tracking app, food tracking app, none, other)
- For each selected: how long have you been using it?
- Would you be willing to share data from these devices? (yes / no / maybe later)

**Section 12: Anything Else**
- "Is there anything else you'd like your practitioner to know before your first call?" (open text)
- "How did you hear about [Practitioner Name]?" (dropdown + other)

---

## Task 3: Protocol Output Audit (Issue #73)

**Goal:** Catalog every gap from the alpha test so we know exactly what to fix in the prompts.

### Steps

**Step 1: I'll pull together the gap analysis**

I already have Dr. Laura's alpha feedback saved. Here's what we know so far:
- GI Map stool test was uploaded but AI recommended ordering one instead of using it
- Call transcript and practitioner notes weren't referenced
- The AI missed oral/nasal microbiome connections that Dr. Laura caught from the GI Map
- Some recommendations were generic where specific ones were warranted
- Dr. Laura wanted specific named products (Klaire Therbiotic, Biocidin drops, Mastic Gum, etc.)

**Step 2: Your part — think about these questions for our next session:**
- Do you have the Donna G protocol that Dr. Laura actually wrote (her version)?
- Do you have the AI-generated protocol for the same patient?
- Can we get both so I can do a side-by-side comparison?
- Are there any other pieces of feedback Dr. Laura has shared that I might not have?

**Step 3: What I'll deliver**
- A gap analysis document: every difference between Dr. Laura's protocol and the AI output
- Each gap categorized: was it a data problem (AI didn't see the info), a prompt problem (AI saw it but didn't use it correctly), or a model limitation
- A fix plan for each gap

### What "done" looks like
- Every gap cataloged and categorized
- Fix plan documented
- Ready for prompt rewriting in Week 2

---

## Task 4: PatientTimeline Schema Design (Issue #93)

**Goal:** Design the core database table that everything else builds on.

### Steps

**This one is 100% on me.** You don't need to do anything for this task. I'll design the schema based on everything we've discussed and have it ready for you to review.

### What I'll deliver
- The table design with all event types
- An explanation in plain English of how it works
- Ready for implementation in Week 2

---

## Recommended order for your week

**Monday (tomorrow):**
1. Go to aptible.com and create your account (Task 1, Steps 1-3)
2. Text or email Dr. Laura to schedule a 30-min intake review call (Task 2, Step 2)
3. Read through the draft intake question map above and make notes (Task 2, Step 1)

**Tuesday-Wednesday:**
4. Dr. Laura call — walk through the question map together
5. Send me the feedback from the call
6. Look for the Donna G comparison materials (Task 3, Step 2)

**Thursday-Friday:**
7. I'll be working on: finalizing the question map based on feedback, completing the gap analysis, and finishing the timeline schema design
8. Check if Aptible startup credits came through
9. End of week review: all 4 tasks should be in good shape for Week 2

---

## What Week 2 looks like (preview)

Once Week 1 is done, Week 2 is when the building starts:
- **I deploy the app to Aptible** and migrate the database (Issues #45, #46)
- **I build the multi-step intake form shell** (Issue #58)
- **I rewrite the protocol system prompts** based on the gap analysis (Issue #74)
- **I create the PatientTimeline table** in the database (Issue #94)

You'll mostly be reviewing my work in Week 2 while I code.
