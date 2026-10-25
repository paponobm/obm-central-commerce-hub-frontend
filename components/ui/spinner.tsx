// A real spinning indicator for "fetching from the backend" states — swap-in
// replacement for the plain "Loading…" text that used to be the only signal
// while a page or section waited on data (rendering itself also takes a
// moment, so a static label alone could look frozen).
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

// The common case: a short-text loading line with the spinner beside it,
// in the same place and same text classes the old plain text occupied.
export function LoadingLine({ className = "text-sm text-foreground/60" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2 ${className}`}>
      <Spinner className="h-4 w-4" />
      Loading…
    </p>
  );
}
