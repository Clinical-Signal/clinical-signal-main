import { describe, expect, it } from "vitest";
import {
  allowedRolesForPath,
  isPathAllowedForRole,
} from "./rbac-routes";

describe("middleware rbac routes", () => {
  it("restricts audit log to owner", () => {
    expect(allowedRolesForPath("/dashboard/audit-log")).toEqual(["owner"]);
    expect(isPathAllowedForRole("/dashboard/audit-log", "owner")).toBe(true);
    expect(isPathAllowedForRole("/dashboard/audit-log", "practitioner")).toBe(
      false,
    );
    expect(isPathAllowedForRole("/dashboard/audit-log", "viewer")).toBe(false);
  });

  it("restricts practitioner settings to owner", () => {
    expect(allowedRolesForPath("/dashboard/settings/practitioners")).toEqual([
      "owner",
    ]);
    expect(
      isPathAllowedForRole("/dashboard/settings/practitioners", "viewer"),
    ).toBe(false);
  });

  it("allows default dashboard routes for all roles", () => {
    for (const role of ["owner", "practitioner", "viewer", "coach"] as const) {
      expect(isPathAllowedForRole("/dashboard", role)).toBe(true);
      expect(isPathAllowedForRole("/dashboard/patients/abc", role)).toBe(true);
      expect(isPathAllowedForRole("/dashboard/settings", role)).toBe(true);
    }
  });
});
