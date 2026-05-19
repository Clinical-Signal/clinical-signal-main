# Handoff prompt for Claude Code — A.3.1 Add protocolId→patient ownership check on outputs route

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Close in-tenant URL-walking gap on the outputs route

Per `docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md` — verified open today. The route at `apps/web/app/api/patients/[id]/protocol/[protocolId]/outputs/route.ts` confirms patient-belongs-to-tenant but never confirms `protocolId` belongs to that patient. A tenant user with multiple patients could URL-walk and get outputs for another of their own patients' protocols. RLS prevents cross-tenant leakage; this fixes in-tenant URL manipulation.

## Implementation

1. **New helper in `apps/web/lib/protocols.ts`:**

```typescript
/** Returns true iff the given protocol exists, belongs to the given patient, and lives in the given tenant. */
export async function protocolBelongsToPatient(
  tenantId: string,
  protocolId: string,
  patientId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM protocols
          WHERE id = $1 AND patient_id = $2
       ) AS exists`,
      [protocolId, patientId],
    );
    return rows[0]?.exists === true;
  });
}
```

The `withTenant` wrapper sets `app.current_tenant_id` so RLS filters out other tenants' rows automatically — that's why the WHERE clause doesn't need `tenant_id = $3`. Match the pattern of the existing `patientBelongsToTenant` helper in `lib/records.ts` for consistency.

2. **Call it in the outputs route** at `apps/web/app/api/patients/[id]/protocol/[protocolId]/outputs/route.ts`:

```typescript
const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
if (!ok) {
  return apiError(ERROR_CODES.NOT_FOUND, 404);
}

// NEW
const protocolOk = await protocolBelongsToPatient(
  user.tenantId,
  ctx.params.protocolId,
  ctx.params.id,
);
if (!protocolOk) {
  return apiError(ERROR_CODES.NOT_FOUND, 404);
}

const outputs = await getProtocolOutputs(user.tenantId, ctx.params.protocolId);
```

Return 404 (not 403) — same as the existing pattern, doesn't reveal whether the protocol exists for someone else.

3. **Audit other routes that take a protocolId param.** While we're in there, grep for similar routes and add the check anywhere the same pattern exists:
```
grep -rn "protocolId" apps/web/app/api/
```
If any route uses `ctx.params.protocolId` without verifying ownership, fix it the same way.

## Hard constraints

- **No behavior change for legitimate access.** A user accessing their own patient's own protocol gets the same response. The check only fires for in-tenant URL manipulation.
- **404, not 403.** Don't reveal whether the protocolId exists for someone else.
- **Branch:** `feat/a31-outputs-ownership-check`. Draft PR. Don't merge.

## Verification

1. `npx tsc --noEmit` passes
2. Manual test:
   - Create two patients in the same tenant via the dev DB
   - Generate a protocol for each
   - Try `/dashboard/patients/<patientA-id>/protocol/<patientB-protocol-id>/outputs` in the browser — should 404
   - Try `/dashboard/patients/<patientA-id>/protocol/<patientA-protocol-id>/outputs` — should work normally
3. (Optional, ideal) write an automated test if the project has a test harness for API routes

## Deliverable

- New helper in `apps/web/lib/protocols.ts`
- Modified `apps/web/app/api/patients/[id]/protocol/[protocolId]/outputs/route.ts`
- Any other routes found in step 3 audit
- Draft PR titled "A.3.1 — Add protocolId→patient ownership check on outputs route" with verification output

When done, paste the PR URL.
