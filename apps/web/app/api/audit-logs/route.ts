import { NextRequest, NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { pool } from "@/lib/db";
import type { AuditAction } from "@/lib/audit";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  practitioner_name: string | null;
  patient_name: string | null;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * GET /api/audit-logs
 *
 * Query params:
 *   page       – 1-based page number (default 1)
 *   pageSize   – entries per page (default 50, max 200)
 *   action     – filter by action type
 *   patientId  – filter by resource_id where resource_type = 'patient'
 *   startDate  – ISO date string, inclusive
 *   endDate    – ISO date string, inclusive
 */
export async function GET(req: NextRequest) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(params.get("pageSize") ?? "50", 10) || 50),
    );
    const actionFilter = params.get("action") as AuditAction | null;
    const patientIdFilter = params.get("patientId");
    const startDate = params.get("startDate");
    const endDate = params.get("endDate");

    // Build WHERE clauses — always scoped to the practitioner's tenant
    const conditions: string[] = ["a.tenant_id = $1"];
    const values: unknown[] = [user.tenantId];
    let idx = 2;

    if (actionFilter) {
      conditions.push(`a.action = $${idx}`);
      values.push(actionFilter);
      idx++;
    }

    if (patientIdFilter) {
      conditions.push(`a.resource_id = $${idx}`);
      values.push(patientIdFilter);
      idx++;
    }

    if (startDate) {
      conditions.push(`a.created_at >= $${idx}::timestamptz`);
      values.push(startDate);
      idx++;
    }

    if (endDate) {
      // End of day
      conditions.push(`a.created_at < ($${idx}::date + interval '1 day')`);
      values.push(endDate);
      idx++;
    }

    const where = conditions.join(" AND ");

    // Count total matching rows
    const countResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_log a WHERE ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    // Fetch page with practitioner name join
    // Left-join patients to resolve resource_id → patient name when resource_type is relevant
    const offset = (page - 1) * pageSize;
    const entriesResult = await pool.query<AuditLogEntry>(
      `SELECT
         a.id::text,
         a.action,
         a.resource_type,
         a.resource_id,
         a.ip_address,
         a.user_agent,
         a.metadata,
         a.created_at,
         p.name AS practitioner_name,
         pt.name AS patient_name
       FROM audit_log a
       LEFT JOIN practitioners p ON p.id = a.practitioner_id
       LEFT JOIN patients pt ON pt.id::text = a.resource_id
         AND a.resource_type IN ('patient', 'intake', 'protocol', 'record')
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    );

    const response: AuditLogResponse = {
      entries: entriesResult.rows,
      total,
      page,
      pageSize,
    };

    return NextResponse.json(response);
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
