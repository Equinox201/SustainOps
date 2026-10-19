import { useState } from "react";
import { departmentOptions } from "../constants";
import {
  previewKnowledgeDraft,
  saveKnowledgeDraft,
  updateKnowledgeDraft,
} from "../services/action-plan-api";
import type {
  KnowledgeDocumentDetail,
  KnowledgeDocumentInfo,
  KnowledgeSectionInfo,
} from "../types";
import {
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./form-styles";

export type EditorMode =
  | { kind: "new" }
  | {
      kind: "version";
      base: KnowledgeDocumentInfo;
      sections: KnowledgeSectionInfo[];
    }
  | { kind: "edit"; detail: KnowledgeDocumentDetail };

const GROUP_WIDE = "All departments";
const DOCUMENT_TYPES = ["sop", "policy", "guide"];

const TEMPLATE = `## 1. Scope

### 1.1 Applicability
Who and what this document covers.

### 1.2 Requirement
The rule, written so that a plan can quote it exactly.
`;

/** Rebuilds editable text from an indexed document's sections. */
function bodyFromSections(sections: KnowledgeSectionInfo[]) {
  return sections
    .map(
      (section) =>
        `### ${section.sectionRef.replace(/^§/, "")} ${section.heading}\n${section.content}`,
    )
    .join("\n\n");
}

/** A draft's text without its front matter. */
function bodyFromMarkdown(markdown: string) {
  return markdown.replace(/^---[\s\S]*?\n---\n+/, "").trim();
}

function initial(mode: EditorMode) {
  if (mode.kind === "edit") {
    return {
      title: mode.detail.document.title,
      department: mode.detail.document.department,
      documentType: mode.detail.document.documentType,
      body: bodyFromMarkdown(mode.detail.markdown ?? ""),
    };
  }

  if (mode.kind === "version") {
    return {
      title: mode.base.title,
      department: mode.base.department,
      documentType: mode.base.documentType,
      body: bodyFromSections(mode.sections),
    };
  }

  return {
    title: "",
    department: departmentOptions[0],
    documentType: "policy",
    body: TEMPLATE,
  };
}

/**
 * Writes a draft. A draft is never retrievable: it has no sections in the
 * knowledge base until a reviewer publishes it. Sections are the unit of
 * citation, so the preview shows exactly what a plan could point at.
 */
export function KnowledgeDocumentEditor({
  mode,
  onSaved,
  onCancel,
}: {
  mode: EditorMode;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => initial(mode));
  const [sections, setSections] = useState<KnowledgeSectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fixed = mode.kind !== "new";
  const documentKey =
    mode.kind === "version"
      ? mode.base.documentKey
      : mode.kind === "edit"
        ? mode.detail.document.documentKey
        : undefined;
  const request = { ...form, ...(documentKey ? { documentKey } : {}) };

  async function preview() {
    setBusy(true);
    const result = await previewKnowledgeDraft(request);
    setBusy(false);

    if (result.ok) {
      setSections(result.data.sections);
      setError(null);
    } else {
      setSections(null);
      setError(result.message);
    }
  }

  async function save() {
    setBusy(true);
    const result =
      mode.kind === "edit"
        ? await updateKnowledgeDraft(mode.detail.document.id, request)
        : await saveKnowledgeDraft(request);
    setBusy(false);

    if (result.ok) {
      onSaved();
    } else {
      setError(result.message);
    }
  }

  const heading =
    mode.kind === "new"
      ? "New document"
      : mode.kind === "version"
        ? `New version of ${mode.base.title}`
        : `Edit draft: ${mode.detail.document.title}`;

  return (
    <form
      className="mt-5 rounded-lg border border-stone-300 bg-stone-50 p-5"
      aria-label="Knowledge document editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className="text-lg font-semibold text-stone-950">{heading}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        Number each section like the shipped documents (### 2.1 Heading). Saved
        as a draft, it is invisible to plan generation until a reviewer
        publishes it. Use fictional content only.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 sm:col-span-2">
          Title
          <input
            className={`${fieldClassName} mt-1 font-normal normal-case tracking-normal`}
            value={form.title}
            maxLength={120}
            disabled={fixed}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Type
          <select
            className={`${fieldClassName} mt-1 font-normal normal-case tracking-normal`}
            value={form.documentType}
            disabled={fixed}
            onChange={(event) =>
              setForm({ ...form, documentType: event.target.value })
            }
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 sm:col-span-3">
          Department
          <select
            className={`${fieldClassName} mt-1 font-normal normal-case tracking-normal`}
            value={form.department}
            disabled={fixed}
            onChange={(event) =>
              setForm({ ...form, department: event.target.value })
            }
          >
            {[...departmentOptions, GROUP_WIDE].map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
        Document text
        <textarea
          className={`${fieldClassName} mt-1 min-h-64 resize-y font-mono text-xs normal-case tracking-normal`}
          value={form.body}
          maxLength={20000}
          onChange={(event) => {
            setForm({ ...form, body: event.target.value });
            setSections(null);
          }}
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      {sections ? (
        <div className="mt-4" aria-label="Section preview">
          <p className="text-sm font-semibold text-stone-800">
            {sections.length} citeable section{sections.length === 1 ? "" : "s"}
          </p>
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
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={busy || form.title.trim() === "" || form.body.trim() === ""}
          onClick={() => void preview()}
        >
          Preview sections
        </button>
        <button
          type="submit"
          className={primaryButtonClassName}
          disabled={busy || form.title.trim() === "" || form.body.trim() === ""}
        >
          {busy ? "Working..." : "Save draft"}
        </button>
        <button type="button" className={secondaryButtonClassName} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
