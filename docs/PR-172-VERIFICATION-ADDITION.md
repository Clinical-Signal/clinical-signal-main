# Addition to PR #172 test plan — shape-comparison verification

Paste this block into the PR description under the existing test plan, or post as a comment on the PR.

---

## Behavioral equivalence check (catches silent prompt-content drift)

The refactor's core promise is "no behavior change." `tsc --noEmit` and `next build` prove the *types* match and the *bundle* still builds. They don't prove that the model receives the same prompt content it did before, or that what we hand back to callers is structurally equivalent.

The escape-character bug found mid-refactor (commit `cc5a919`) is exactly the failure mode this check guards against: the prompt was technically valid, the build passed, the model would have happily generated email drafts — they would have just been subtly different from what was shipping yesterday.

### Procedure

1. **Pick a known synthetic patient** in the dev database. Must have intake data submitted and at least one lab record uploaded (so protocol generation has real input to work with).

2. **Capture pre-refactor outputs.** While still on `main`:
   - Generate a prep brief for the patient. Save the rendered output (copy JSON or screenshot).
   - Generate a clinical protocol. Save the JSON.
   - Approve the protocol so the three derivative outputs (client doc, call deck, email draft) generate. Save each.

3. **Capture post-refactor outputs.** Switch to `refactor/centralize-llm-client`. Repeat all five generations for the same patient.

4. **Compare structure, not content.** Walk through each pair side by side. Outputs will not match character-for-character — the model is non-deterministic. What you're checking:

   | Output | Things to verify |
   |---|---|
   | Prep brief | Same sections present? Roughly same number of bullet points per section? Red flags still surfaced if input warrants? |
   | Clinical protocol | Same number of phases (±1)? Roughly same supplement count per phase? All sections present (overview, root cause, supplements, lifestyle, monitoring)? |
   | Client doc | Phased structure intact? Tone consistent (warm, plain language)? Same approximate length? |
   | Call deck | Same number of slides (±1)? Slides cover the same topics? |
   | Email draft | Greeting → summary → action items → close structure intact? Disclaimer footer present? |

5. **Pass criteria.** Each pair is "structurally equivalent" by eyeball. Variation in wording is fine and expected.

6. **Fail criteria.** Any of:
   - A whole section/phase/slide disappears
   - Supplement count drops to zero where it shouldn't
   - Tone shifts dramatically (e.g., client doc suddenly reads like the clinical protocol)
   - Disclaimer footer missing
   - JSON shape changes (extra/missing top-level keys)

   On fail: identify which output is wrong, then `git diff main...refactor/centralize-llm-client -- apps/web/lib/prompts/<that_prompt>.md` and look for content that didn't survive the move.

### Time estimate
10–15 minutes if dev environment is already running.

### Why this isn't automated
We don't have a deterministic-output testing framework for AI calls in the project today. Building one is a separate piece of work (mock the SDK, snapshot structural shape, compare). Worth doing post-MVP if we end up doing more refactors that touch prompts; not worth blocking this PR on.
