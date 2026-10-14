import type { ReactNode } from "react";

export function EditorSection({
  label,
  title,
  description,
  isOpen,
  isLocked = false,
  lockedMessage,
  onToggle,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  isOpen: boolean;
  isLocked?: boolean;
  lockedMessage?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  const hint = isLocked ? lockedMessage : description;

  return (
    <article
      className={`rounded-lg border bg-white shadow-sm ${
        isLocked ? "border-dashed border-stone-300" : "border-stone-200"
      }`}
    >
      <button
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left disabled:cursor-not-allowed sm:px-7"
        type="button"
        disabled={isLocked}
        onClick={onToggle}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            {label}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-stone-950">{title}</h3>
          {hint ? <p className="mt-2 text-sm text-stone-500">{hint}</p> : null}
        </div>
        <span className="text-sm font-semibold text-stone-500">
          {isLocked ? "Locked" : isOpen ? "Collapse" : "Expand"}
        </span>
      </button>
      {isOpen && !isLocked ? (
        <div className="border-t border-stone-200 px-6 py-6 sm:px-7">
          {children}
        </div>
      ) : null}
    </article>
  );
}
