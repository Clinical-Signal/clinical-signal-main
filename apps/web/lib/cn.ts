// Tiny class-merge helper so components can accept a className prop and
// merge it with defaults. No tailwind-merge dep — callers rarely need
// conflict resolution; last-wins in string concat is fine for our scale.
export function cn(
  ...parts: (string | false | null | undefined)[]
): string {
  return parts.filter(Boolean).join(" ");
}
