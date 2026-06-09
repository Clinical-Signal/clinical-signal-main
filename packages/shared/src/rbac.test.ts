import { describe, expect, it } from "vitest";

import type { PractitionerRole } from "@cs/core";

import { can, MATRIX, type Capability } from "./rbac";

const ALL_CAPS = Object.keys(MATRIX) as Capability[];
const ALL_ROLES: PractitionerRole[] = ["owner", "practitioner", "viewer", "coach"];

describe("RBAC matrix (PRD §5.6)", () => {
  it("owner is granted every capability", () => {
    for (const cap of ALL_CAPS) {
      expect(can("owner", cap)).toBe(true);
    }
  });

  it.each([
    ["coach", "finalize_protocol"],
    ["coach", "generate_protocol"],
    ["coach", "create_patient"],
    ["viewer", "create_patient"],
    ["viewer", "upload_lab"],
    ["practitioner", "read_audit_log"],
    ["practitioner", "configure_tenant"],
  ] as const)("denies %s for %s", (role, cap) => {
    expect(can(role, cap)).toBe(false);
  });

  it.each([
    ["coach", "read_patient_phi"],
    ["coach", "assign_foundational"],
    ["coach", "append_timeline"],
    ["viewer", "read_patient_phi"],
    ["practitioner", "finalize_protocol"],
    ["practitioner", "upload_lab"],
  ] as const)("allows %s for %s", (role, cap) => {
    expect(can(role, cap)).toBe(true);
  });

  it("every capability lists at least owner", () => {
    for (const cap of ALL_CAPS) {
      expect(MATRIX[cap]).toContain("owner");
    }
  });

  it("only read_patient_phi is granted to viewer", () => {
    const viewerCaps = ALL_CAPS.filter((cap) => can("viewer", cap));
    expect(viewerCaps).toEqual(["read_patient_phi"]);
  });

  it("coach cannot mutate protocols or labs", () => {
    const denied: Capability[] = [
      "finalize_protocol",
      "generate_protocol",
      "edit_protocol",
      "deliver_protocol",
      "upload_lab",
      "correct_extraction",
    ];
    for (const cap of denied) {
      expect(can("coach", cap)).toBe(false);
    }
  });

  it("matrix entries only use known roles", () => {
    for (const cap of ALL_CAPS) {
      for (const role of MATRIX[cap]) {
        expect(ALL_ROLES).toContain(role);
      }
    }
  });
});
