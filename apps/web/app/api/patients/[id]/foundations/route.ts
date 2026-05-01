import { NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { withTenant } from "@/lib/db";

/**
 * GET /api/patients/[id]/foundations
 * Retrieve the foundational plan for a patient (if assigned).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

  const plan = await withTenant(user.tenantId, async (c) => {
    const res = await c.query(
      `SELECT id, items, practitioner_notes, assigned_at, updated_at
         FROM foundational_plans
        WHERE tenant_id = $1 AND patient_id = $2`,
      [user.tenantId, ctx.params.id],
    );
    return res.rows[0] ?? null;
  });

  if (!plan) {
    return Response.json({ exists: false });
  }

  return Response.json({
    exists: true,
    plan: {
      id: plan.id,
      items: plan.items,
      practitionerNotes: plan.practitioner_notes,
      assignedAt: plan.assigned_at,
      updatedAt: plan.updated_at,
    },
  });
}

/**
 * POST /api/patients/[id]/foundations
 * Assign (or replace) the foundational plan for a patient.
 *
 * Body: { items: ChecklistItem[], practitionerNotes?: string }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

  let body: { items: unknown[]; practitionerNotes?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 400, undefined, {
      message: "At least one checklist item is required",
    });
  }

  const patientId = ctx.params.id;

  const plan = await withTenant(user.tenantId, async (c) => {
    // Upsert — one plan per patient
    const res = await c.query(
      `INSERT INTO foundational_plans
         (tenant_id, patient_id, items, practitioner_notes, assigned_by)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET
           items = EXCLUDED.items,
           practitioner_notes = EXCLUDED.practitioner_notes,
           updated_at = now()
       RETURNING id, assigned_at, updated_at`,
      [
        user.tenantId,
        patientId,
        JSON.stringify(body.items),
        body.practitionerNotes ?? null,
        user.practitionerId,
      ],
    );

    // Record timeline event
    await c.query(
      `INSERT INTO patient_timeline
         (tenant_id, patient_id, event_type, event_at, actor_id, actor_type,
          event_data, summary)
       VALUES ($1, $2, 'checklist_assigned', now(), $3, 'practitioner',
               $4::jsonb, $5)`,
      [
        user.tenantId,
        patientId,
        user.practitionerId,
        JSON.stringify({ item_count: body.items.length }),
        `Foundational checklist assigned (${body.items.length} items)`,
      ],
    );

    return res.rows[0];
  });

  await writeAudit({
    action: "intake_saved",
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
    resourceType: "foundational_plan",
    resourceId: plan.id,
    metadata: { patient_id: patientId, item_count: body.items.length },
  });

  return Response.json({
    ok: true,
    plan: {
      id: plan.id,
      assignedAt: plan.assigned_at,
      updatedAt: plan.updated_at,
    },
  });
}

/**
 * PATCH /api/patients/[id]/foundations
 * Update individual items (e.g., mark completed) or notes.
 *
 * Body: { items?: ChecklistItem[], practitionerNotes?: string }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

  let body: { items?: unknown[]; practitionerNotes?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const patientId = ctx.params.id;

  const updated = await withTenant(user.tenantId, async (c) => {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [user.tenantId, patientId];
    let idx = 3;

    if (body.items) {
      sets.push(`items = $${idx}::jsonb`);
      params.push(JSON.stringify(body.items));
      idx++;
    }
    if (body.practitionerNotes !== undefined) {
      sets.push(`practitioner_notes = $${idx}`);
      params.push(body.practitionerNotes);
      idx++;
    }

    const res = await c.query(
      `UPDATE foundational_plans
          SET ${sets.join(", ")}
        WHERE tenant_id = $1 AND patient_id = $2
        RETURNING id, items, practitioner_notes, updated_at`,
      params,
    );

    return res.rows[0] ?? null;
  });

  if (!updated) {
    return apiError(ERROR_CODES.NOT_FOUND, 404);
  }

  return Response.json({
    ok: true,
    plan: {
      id: updated.id,
      items: updated.items,
      practitionerNotes: updated.practitioner_notes,
      updatedAt: updated.updated_at,
    },
  });
}
