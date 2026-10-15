import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { ROLE_LABELS, ROLE_SUMMARIES } from "../domain/permissions";
import { fetchPersonas } from "../services/auth-api";
import { DemoNotice } from "./DemoNotice";

export function SignIn({
  error,
  onSignIn,
}: {
  error: string | null;
  onSignIn: (userId: string) => Promise<void>;
}) {
  const [personas, setPersonas] = useState<SessionUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    fetchPersonas().then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setPersonas(result.data);
      } else {
        setLoadError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSelect(userId: string) {
    setPendingId(userId);
    await onSignIn(userId);
    setPendingId(null);
  }

  return (
    <main className="min-h-screen bg-[#f7f3ec] text-stone-900">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          AI-assisted sustainability operations
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">SustainOps</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
          Plans are written by one role and approved by another. Choose a demo
          persona to see the workflow from that seat. All people, properties and
          data are fictional.
        </p>

        <div className="mt-6">
          <DemoNotice />
        </div>

        {error || loadError ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error ?? loadError}
          </div>
        ) : null}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {personas.map((persona) => (
            <li key={persona.id}>
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => handleSelect(persona.id)}
                className="h-full w-full rounded-lg border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-700 hover:shadow disabled:cursor-wait disabled:opacity-70"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                  {ROLE_LABELS[persona.role]}
                  {persona.department ? ` · ${persona.department}` : ""}
                </span>
                <span className="mt-2 block text-lg font-semibold text-stone-950">
                  {persona.name}
                </span>
                <span className="mt-2 block text-sm leading-6 text-stone-600">
                  {ROLE_SUMMARIES[persona.role]}
                </span>
                <span className="mt-4 block text-sm font-semibold text-stone-900">
                  {pendingId === persona.id ? "Signing in…" : "Continue as " + persona.name.split(" ")[0] + " →"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-sm leading-6 text-stone-500">
          Demo sign-in: there are no passwords. Each persona is a seeded user
          and every request is authorised on the server by that user&apos;s
          role.
        </p>
      </div>
    </main>
  );
}
