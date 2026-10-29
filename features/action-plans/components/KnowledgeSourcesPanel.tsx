import { useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { formatDate } from "../domain/plan-utils";
import { can } from "../domain/permissions";
import {
  deleteKnowledgeDraft,
  fetchKnowledgeDocument,
  publishKnowledgeDocument,
  withdrawKnowledgeDocument,
} from "../services/action-plan-api";
import type {
  KnowledgeDocumentDetail,
  KnowledgeDocumentInfo,
  KnowledgeSectionInfo,
} from "../types";
import { KnowledgeDocumentEditor, type EditorMode } from "./KnowledgeDocumentEditor";
import { fieldClassName, primaryButtonClassName, secondaryButtonClassName } from "./form-styles";

const STATUS_STYLES: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-900",
  draft: "border-amber-200 bg-amber-50 text-amber-950",
  superseded: "border-stone-200 bg-stone-100 text-stone-600",
  withdrawn: "border-rose-200 bg-rose-50 text-rose-900",
};

const INDEX_LABELS: Record<string, string> = {
  processing: "Indexing…",
  available: "Available",
  failed: "Indexing failed",
};

const linkButton =
  "text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50";

function Sections({ id }: { id: string }) {
  const [sections, setSections] = useState<KnowledgeSectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <details
      className="mt-3"
      onToggle={async (event) => {
        if (!(event.currentTarget as HTMLDetailsElement).open || sections) {
          return;
        }

        const result = await fetchKnowledgeDocument(id);

        if (result.ok) {
          setSections(result.data.sections);
        } else {
          setError(result.message);
        }
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-stone-700">
        View sections
      </summary>
      {error ? <p className="mt-2 text-sm text-rose-900">{error}</p> : null}
      {sections ? (
        <ul className="mt-2 space-y-2">
          {sections.map((section) => (
            <li
              key={section.sectionRef}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-semibold">
                {section.sectionRef} {section.heading}
              </span>
              <span className="block whitespace-pre-wrap text-stone-600">
                {section.content}
              </span>
            </li>
          ))}
        </ul>
      ) : error ? null : (
        <p className="mt-2 text-sm text-stone-500">Loading…</p>
      )}
    </details>
  );
}

/**
 * The company knowledge that grounds plans, and its lifecycle. Managers write
 * drafts and new versions; reviewers publish or withdraw. Publishing a new
 * version supersedes the old one for new plans, while plans already written
 * keep the sections they were built on.
 */
export function KnowledgeSourcesPanel({
  user,
  documents,
  error,
  isLoading,
  onChanged,
}: {
  user: SessionUser;
  documents: KnowledgeDocumentInfo[];
  error: string | null;
  isLoading: boolean;
  onChanged: () => void;
}) {
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const canEdit = can(user, "knowledge:edit");
  const canPublish = can(user, "knowledge:publish");

  const approved = documents.filter((document) => document.status === "approved");
  const sections = approved.reduce((sum, document) => sum + document.chunkCount, 0);
  const latestVersion = new Map<string, number>();

  for (const document of documents) {
    latestVersion.set(
      document.documentKey,
      Math.max(latestVersion.get(document.documentKey) ?? 0, document.version),
    );
  }

  async function run(
    id: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
    done: string,
  ) {
    setBusyId(id);
    setNotice(null);
    const result = await action();
    setBusyId(null);

    if (result.ok) {
      setNotice(done);
    } else {
      setNotice(result.message ?? "That did not work.");
    }

    onChanged();
  }

  async function startVersion(document: KnowledgeDocumentInfo) {
    const result = await fetchKnowledgeDocument(document.id);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setEditor({ kind: "version", base: document, sections: result.data.sections });
  }

  async function startEdit(document: KnowledgeDocumentInfo) {
    const result = await fetchKnowledgeDocument(document.id);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setEditor({ kind: "edit", detail: result.data as KnowledgeDocumentDetail });
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Company knowledge
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            What plans are grounded in
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-600">
            Recommendations are generated from approved documents and cite the
            exact section they rely on. A new version replaces the old one for
            new plans; plans already written keep the sections they used, and
            are flagged when those change. Everything here is synthetic.
          </p>
          {documents.length > 0 ? (
            <p className="mt-2 text-sm font-medium text-stone-800">
              {approved.length} approved documents · {sections} citeable sections
            </p>
          ) : null}
        </div>
        {canEdit && !editor ? (
          <button
            type="button"
            className={primaryButtonClassName}
            onClick={() => setEditor({ kind: "new" })}
          >
            Write a document
          </button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800">
          {notice}
        </p>
      ) : null}

      {editor ? (
        <KnowledgeDocumentEditor
          key={editor.kind === "edit" ? editor.detail.document.id : editor.kind === "version" ? editor.base.id : "new"}
          mode={editor}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice("Draft saved. A reviewer can now publish it.");
            onChanged();
          }}
        />
      ) : null}

      {error ? <p className="mt-4 text-sm text-rose-900">{error}</p> : null}

      {isLoading ? (
        <p role="status" className="mt-5 rounded-lg border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600">
          Loading knowledge sources…
        </p>
      ) : null}

      {!isLoading && documents.length === 0 && !error ? (
        <p className="mt-5 rounded-lg border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600">
          No documents ingested yet. Run <code>npm run knowledge:ingest</code>.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {documents.map((document) => {
          const isLatest = latestVersion.get(document.documentKey) === document.version;
          const ownDraft = document.createdBy?.id === user.id;
          const busy = busyId === document.id;

          return (
            <article
              key={document.id}
              data-testid="knowledge-document"
              className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
            >
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">
                  {document.documentType}
                </span>
                <span
                  className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                    STATUS_STYLES[document.status] ?? STATUS_STYLES.draft
                  }`}
                >
                  {document.status}
                </span>
                {document.indexStatus ? (
                  <span
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                      document.indexStatus === "failed"
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-stone-200 bg-white text-stone-600"
                    }`}
                  >
                    {INDEX_LABELS[document.indexStatus] ?? document.indexStatus}
                  </span>
                ) : null}
                {document.origin === "user" ? (
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900">
                    Written in the app
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-base font-semibold leading-6 text-stone-950">
                {document.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {document.department} · v{document.version} ·{" "}
                {document.region.toUpperCase()} · {document.chunkCount} sections
              </p>
              {document.createdBy || document.approvedBy ? (
                <p className="text-xs leading-5 text-stone-500">
                  {document.createdBy ? `Drafted by ${document.createdBy.name}` : ""}
                  {document.approvedBy
                    ? ` · approved by ${document.approvedBy.name}${document.approvedAt ? ` on ${formatDate(document.approvedAt)}` : ""}`
                    : ""}
                </p>
              ) : null}
              {document.indexError ? (
                <p role="alert" className="mt-2 text-sm text-rose-900">
                  {document.indexError}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {canPublish && document.status === "draft" ? (
                  <button
                    type="button"
                    className={linkButton}
                    disabled={busy || ownDraft || document.indexStatus === "processing"}
                    title={ownDraft ? "The author cannot publish their own document" : undefined}
                    onClick={() =>
                      run(
                        document.id,
                        () => publishKnowledgeDocument(document.id),
                        `Published ${document.title} v${document.version}.`,
                      )
                    }
                  >
                    {busy
                      ? "Publishing…"
                      : document.indexStatus === "failed"
                        ? "Retry publish"
                        : "Publish"}
                  </button>
                ) : null}
                {canEdit && document.status === "draft" ? (
                  <>
                    <button type="button" className={linkButton} onClick={() => void startEdit(document)}>
                      Edit draft
                    </button>
                    <button
                      type="button"
                      className={linkButton}
                      disabled={busy}
                      onClick={() =>
                        run(document.id, () => deleteKnowledgeDraft(document.id), "Draft deleted.")
                      }
                    >
                      Delete draft
                    </button>
                  </>
                ) : null}
                {canEdit && document.status === "approved" && isLatest ? (
                  <button type="button" className={linkButton} onClick={() => void startVersion(document)}>
                    Write a new version
                  </button>
                ) : null}
                {canPublish && document.status === "approved" ? (
                  <button type="button" className={linkButton} onClick={() => setWithdrawing(document.id)}>
                    Withdraw…
                  </button>
                ) : null}
              </div>

              {withdrawing === document.id ? (
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      document.id,
                      () => withdrawKnowledgeDocument(document.id, reason.trim()),
                      `Withdrew ${document.title} v${document.version}.`,
                    ).then(() => {
                      setWithdrawing(null);
                      setReason("");
                    });
                  }}
                >
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    Why is it being withdrawn?
                    <input
                      className={`${fieldClassName} mt-1 min-h-10 py-2 font-normal normal-case tracking-normal`}
                      value={reason}
                      maxLength={300}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button type="submit" className={secondaryButtonClassName} disabled={reason.trim() === "" || busy}>
                      Withdraw document
                    </button>
                    <button type="button" className={secondaryButtonClassName} onClick={() => setWithdrawing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {document.chunkCount > 0 || document.status === "draft" ? (
                <Sections id={document.id} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
