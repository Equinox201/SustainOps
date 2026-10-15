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
      canEditNotes: true,
      canComplete: true,
      canResetApproval: true,
    });
    expect(getEditorCapabilities(reviewer, approved).canApprove).toBe(false);
  });

  it("freezes everything but notes once completed", () => {
    const caps = getEditorCapabilities(manager, completed);

    expect(caps).toMatchObject({
      canEditKpi: false,
      canEditNotes: true,
      canComplete: false,
      canResetApproval: false,
    });
  });

  it("scopes department managers to notes and KPIs of their department", () => {
    expect(getEditorCapabilities(engineering, approved)).toMatchObject({
      canEditCore: false,
      canEditKpi: true,
      canEditNotes: true,
      canApprove: false,
    });
    expect(getEditorCapabilities(procurement, approved)).toMatchObject({
      canEditKpi: false,
      canEditNotes: false,
      canSave: false,
    });
  });
});
