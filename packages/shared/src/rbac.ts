/**
 * PRD §5.6 / SEC-6 — canonical RBAC capability matrix.
 * Single source consumed by middleware and server actions.
 */
import type { PractitionerRole } from "@cs/core";

export type Capability =
  | "create_practitioner"
  | "configure_tenant"
  | "create_patient"
  | "issue_intake_token"
  | "read_patient_phi"
  | "revise_intake"
  | "confirm_ai_field"
  | "upload_lab"
  | "correct_extraction"
  | "assign_foundational"
  | "append_timeline"
  | "generate_protocol"
  | "edit_protocol"
  | "finalize_protocol"
  | "deliver_protocol"
  | "read_audit_log";

/** PRD §5.6 table — roles listed per capability are granted access. */
export const MATRIX: Record<Capability, PractitionerRole[]> = {
  create_practitioner: ["owner"],
  configure_tenant: ["owner"],
  create_patient: ["owner", "practitioner"],
  issue_intake_token: ["owner", "practitioner"],
  read_patient_phi: ["owner", "practitioner", "viewer", "coach"],
  revise_intake: ["owner", "practitioner"],
  confirm_ai_field: ["owner", "practitioner"],
  upload_lab: ["owner", "practitioner"],
  correct_extraction: ["owner", "practitioner"],
  assign_foundational: ["owner", "practitioner", "coach"],
  append_timeline: ["owner", "practitioner", "coach"],
  generate_protocol: ["owner", "practitioner"],
  edit_protocol: ["owner", "practitioner"],
  finalize_protocol: ["owner", "practitioner"],
  deliver_protocol: ["owner", "practitioner"],
  read_audit_log: ["owner"],
};

export function can(role: PractitionerRole, cap: Capability): boolean {
  return MATRIX[cap].includes(role);
}
