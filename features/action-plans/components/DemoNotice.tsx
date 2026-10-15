/** Sets expectations for a public, shared, passwordless demo. */
export function DemoNotice() {
  return (
    <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
      <strong>Public demo.</strong> Everything here is fictional and shared with
      other visitors, and the data resets nightly. Personas have no passwords,
      so anyone can act as any role. Please don&apos;t enter real information.
    </p>
  );
}
