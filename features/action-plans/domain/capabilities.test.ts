import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { getEditorCapabilities } from "./capabilities";
import { planToDraft } from "./lifecycle";
import type { Principal } from "./permissions";

const manager: Principal = {
  id: "m",
  name: "M",
  role: "sustainability_manager",
  department: null,
};
const reviewer: Principal = {
  id: "r",
  name: "R",
  role: "reviewer",
  department: null,
};
const engineering: Principal = {
  id: "e",
  name: "E",
  role: "department_manager",
  department: "Engineering",
};
const procurement: Principal = {
  id: "p",
  name: "P",
  role: "department_manager",
  department: "Procurement",
};

const base = planToDraft({
  ...demoActionPlans[0],
  generationId: null,
  approved: false,
  completed: false,
});
const approved = { ...base, approved: true };
const completed = { ...base, approved: true, completed: true };

describe("editor capabilities", () => {
  it("lets the manager author but never approve", () => {
    const caps = getEditorCapabilities(manager, base);

    expect(caps).toMatchObject({
      canEditCore: true,
      canGenerate: true,
      canSave: true,
      canApprove: false,
      canRequestChanges: false,
    });
  });

  it("lets the reviewer decide but never edit", () => {
    const caps = getEditorCapabilities(reviewer, base);

    expect(caps).toMatchObject({
      canEditCore: false,
      canGenerate: false,
      canSave: false,
      canApprove: true,
      canRequestChanges: true,
    });
  });

  it("locks core fields after approval and offers completion and reset", () => {
    const caps = getEditorCapabilities(manager, approved);

    expect(caps).toMatchObject({
      canEditCore: false,
      canGenerate: false,
      canAddNotes: true,
      canComplete: true,
      canResetApproval: true,
    });
    expect(getEditorCapabilities(reviewer, approved).canApprove).toBe(false);
  });

  it("freezes everything but notes once completed", () => {
    const caps = getEditorCapabilities(manager, completed);

    expect(caps).toMatchObject({
      canEditKpi: false,
      canTrack: false,
      canAddNotes: true,
      canComplete: false,
      canResetApproval: false,
    });
  });

  it("scopes department managers to notes and KPIs of their department", () => {
    expect(getEditorCapabilities(engineering, approved)).toMatchObject({
      canEditCore: false,
      canEditKpi: true,
      canTrack: true,
      canEditActions: false,
      canAddNotes: true,
      canApprove: false,
    });
    expect(getEditorCapabilities(procurement, approved)).toMatchObject({
      canEditKpi: false,
      canTrack: false,
      canAddNotes: false,
      canSave: false,
    });
  });

  it("lets actions be edited only after the first save, and only while unapproved", () => {
    expect(getEditorCapabilities(manager, base).canEditActions).toBe(true);
    expect(
      getEditorCapabilities(manager, { ...base, id: null }).canEditActions,
    ).toBe(false);
    expect(getEditorCapabilities(manager, approved).canEditActions).toBe(false);
    expect(getEditorCapabilities(reviewer, base).canEditActions).toBe(false);
  });

  it("blocks approval while changes are requested, and offers resubmission to the author", () => {
    const requested = { ...base, reviewStatus: "changes_requested" as const };

    expect(getEditorCapabilities(reviewer, base).canApprove).toBe(true);
    expect(getEditorCapabilities(reviewer, requested).canApprove).toBe(false);
    expect(getEditorCapabilities(manager, requested).canResubmit).toBe(true);
    expect(getEditorCapabilities(manager, base).canResubmit).toBe(false);
    expect(getEditorCapabilities(engineering, requested).canResubmit).toBe(
      false,
    );
  });
});
