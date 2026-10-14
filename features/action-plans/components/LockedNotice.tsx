export function LockedNotice({ className = "mt-5" }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950`}
    >
      This action plan has been approved and locked to protect the operational
      record.
    </div>
  );
}
