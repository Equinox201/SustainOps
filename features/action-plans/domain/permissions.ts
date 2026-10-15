import type { PlanContent } from "@/lib/schemas/action-plan";
import { deepEqual } from "./deep-equal";

/**
 * Role-based access rules. Pure and shared: the server enforces them, the UI
 * uses them only to hide actions the signed-in user could not perform anyway.
 */

export const ROLES = [
  "sustainability_manager",
  "department_manager",
  "reviewer",
] as const;

export type Role = (typeof ROLES)[number];

export type Permission =
  | "plan:view"
  | "plan:create"
  | "plan:generate"
  | "plan:edit"
  | "plan:notes"
  | "plan:kpi"
  | "plan:delete"
  | "plan:approve"
  | "plan:request_changes"
  | "plan:reset_approval"
  | "plan:complete"
  | "audit:view"
  | "demo:reset";

export type Principal = {
  id: string;
  name: string;
  role: Role;
  department: string | null;
};

export const ROLE_LABELS: Record<Role, string> = {
  sustainability_manager: "Sustainability Manager",
  department_manager: "Department Manager",
  reviewer: "Reviewer",
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  sustainability_manager:
    "Creates cases, generates and edits plans, monitors KPIs and closes out completed work.",
  department_manager:
    "Sees plans for their own department and records implementation notes and KPI progress.",
  reviewer:
    "Reviews plans and approves them or requests changes. Cannot author plans.",
};

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  sustainability_manager: [
    "plan:view",
    "plan:create",
    "plan:generate",
    "plan:edit",
    "plan:notes",
    "plan:kpi",
    "plan:delete",
    "plan:complete",
    "plan:reset_approval",
    "audit:view",
    "demo:reset",
  ],
  department_manager: ["plan:view", "plan:notes", "plan:kpi"],
  reviewer: [
    "plan:view",
    "plan:approve",
    "plan:request_changes",
    "plan:reset_approval",
    "audit:view",
  ],
};

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Department managers only see plans in their own department. */
export function canAccessPlan(
  principal: Principal,
  plan: { sustainabilityCase: { department: string } },
) {
  return (
    principal.role !== "department_manager" ||
    principal.department === plan.sustainabilityCase.department
  );
}

/** Does this user hold the permission, for this plan if one is given? */
export function can(
  principal: Principal,
  permission: Permission,
  plan?: { sustainabilityCase: { department: string } },
) {
  return (
    hasPermission(principal.role, permission) &&
    (!plan || canAccessPlan(principal, plan))
  );
}

/** Which permissions an edit needs, based on which fields it changes. */
export function permissionsForContentChange(
  before: PlanContent,
  after: PlanContent,
): Permission[] {
  const required: Permission[] = [];
  const coreChanged = (
    [
      "sustainabilityCase",
      "actionPlan",
      "generationId",
      "owner",
      "priority",
      "targetDate",
      "nextReviewDate",
      "readinessChecklist",
    ] as const
  ).some((field) => !deepEqual(before[field], after[field]));

  if (coreChanged) {
    required.push("plan:edit");
  }

  if (!deepEqual(before.kpiProgress, after.kpiProgress)) {
    required.push("plan:kpi");
  }

  if (before.actionNotes !== after.actionNotes) {
    required.push("plan:notes");
  }

  return required;
}
