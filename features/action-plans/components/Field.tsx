import type { ReactNode } from "react";

export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
