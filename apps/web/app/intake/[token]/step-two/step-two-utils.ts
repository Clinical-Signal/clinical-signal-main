export function isStepTwoAnswered(value: unknown, required: boolean): boolean {
  if (!required) {
    return true;
  }
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export function stepTwoSaveStatusLabel(status: string): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Could not save — try again";
    default:
      return "";
  }
}
