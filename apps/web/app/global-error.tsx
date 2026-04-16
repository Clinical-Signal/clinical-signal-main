"use client";

// Outer fallback for errors thrown in the RootLayout itself. Rendered
// by Next when the regular error.tsx boundaries can't catch the error
// (layout crash, hydration mismatch in the shell, etc). Keep this HTML
// self-contained — no globals.css guarantees here.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: "#1c1917",
          background: "#fafaf9",
          padding: "32px",
        }}
      >
        <main style={{ maxWidth: 480, textAlign: "left" }}>
          <h1 style={{ fontSize: 24, fontWeight: 500, marginBottom: 8 }}>
            Clinical Signal hit a snag
          </h1>
          <p style={{ color: "#57534e", marginBottom: 16, lineHeight: 1.5 }}>
            Something broke before the app could finish loading. Refreshing
            usually clears this. If it persists, sign out and back in.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 16px",
              background: "#0f4c47",
              color: "#fafaf9",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "#78716c",
                fontFamily: "monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
