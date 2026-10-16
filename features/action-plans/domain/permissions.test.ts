import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { planToContent } from "./lifecycle";
import {
  can,
  canAccessPlan,
  hasPermission,
  permissionsForContentChange,
  type Principal,
} from "./permissions";

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

const plan = demoActionPlans[0]; // Engineering
const base = () => ({
  ...planToContent({ ...plan, generationId: null }),
});

describe("role permissions", () => {
  it("separates authoring from approving", () => {
    expect(hasPermission("sustainability_manager", "plan:edit")).toBe(true);
    expect(hasPermission("sustainability_manager", "plan:approve")).toBe(false);
    expect(hasPermission("reviewer", "plan:approve")).toBe(true);
    expect(hasPermission("reviewer", "plan:edit")).toBe(false);
    expect(hasPermission("reviewer", "plan:create")).toBe(false);
  });

  it("limits department managers to notes and KPIs", () => {
    expect(hasPermission("department_manager", "plan:notes")).toBe(true);
    expect(hasPermission("department_manager", "plan:kpi")).toBe(true);
    expect(hasPermission("department_manager", "plan:edit")).toBe(false);
    expect(hasPermission("department_manager", "audit:view")).toBe(false);
  });
});

describe("plan scope", () => {
  it("scopes department managers to their department only", () => {
    expect(canAccessPlan(engineering, plan)).toBe(true);
    expect(
      canAccessPlan({ ...engineering, department: "Food & Beverage" }, plan),
    ).toBe(false);
    expect(canAccessPlan(manager, plan)).toBe(true);
    expect(canAccessPlan(reviewer, plan)).toBe(true);
  });

  it("combines permission and scope", () => {
    const other = { ...engineering, department: "Procurement" };

    expect(can(engineering, "plan:notes", plan)).toBe(true);
    expect(can(other, "plan:notes", plan)).toBe(false);
  });
});

describe("permissionsForContentChange", () => {
  it("needs nothing when nothing changed", () => {
    expect(permissionsForContentChange(base(), base())).toEqual([]);
  });

  it("maps each edited field group to its permission", () => {
    const before = base();
    const actions = before.actionPlan!.recommendedOperationalActions;
    const next = {
      ...before,
      owner: "New",
      kpiProgress: { baseline: "1", current: "", target: "", latestUpdate: "" },
      actionPlan: {
        ...before.actionPlan!,
        recommendedOperationalActions: actions.map((item, index) =>
          index === 0 ? { ...item, status: "in_progress" as const } : item,
        ),
      },
    };

    expect(permissionsForContentChange(before, next).sort()).toEqual(
      ["plan:edit", "plan:kpi", "plan:track"].sort(),
    );
  });

  it("treats what an action says and who does it as part of the plan, progress as tracking", () => {
    const before = base();
    const [first, ...rest] = before.actionPlan!.recommendedOperationalActions;
    const withActions = (items: typeof rest) => ({
      ...before,
      actionPlan: {
        ...before.actionPlan!,
        recommendedOperationalActions: items,
      },
    });

    expect(
      permissionsForContentChange(
        before,
        withActions([{ ...first, action: "Reworded" }, ...rest]),
      ),
    ).toEqual(["plan:edit"]);
    expect(
      permissionsForContentChange(
        before,
        withActions([{ ...first, assigneeId: "usr_priya_nair" }, ...rest]),
      ),
    ).toEqual(["plan:edit"]);
    expect(
      permissionsForContentChange(
        before,
        withActions([
          { ...first, status: "blocked" as const, blockedReason: "No access" },
          ...rest,
        ]),
      ),
    ).toEqual(["plan:track"]);
  });
});
