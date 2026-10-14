export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "Done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : status === "Active"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {status}
    </span>
  );
}
