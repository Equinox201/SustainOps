import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import {
  EMPTY_FILTERS,
  filterPlans,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  planStatus,
} from "./filters";

const [energy, food, procurement] = demoActionPlans;

describe("planStatus", () => {
  it("derives the visible status in priority order", () => {
    expect(
      planStatus({ approved: false, completed: false, reviewStatus: "none" }),
    ).toBe("pending");
    expect(
      planStatus({
        approved: false,
        completed: false,
        reviewStatus: "changes_requested",
      }),
    ).toBe("changes_requested");
    expect(
      planStatus({ approved: true, completed: false, reviewStatus: "none" }),
    ).toBe("active");
    expect(
      planStatus({ approved: true, completed: true, reviewStatus: "none" }),
    ).toBe("done");
  });
});

describe("filterPlans", () => {
  const plans = [energy, food, procurement];

  it("returns everything when no filter is set", () => {
    expect(filterPlans(plans, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("narrows by department and combines filters with AND", () => {
    expect(
      filterPlans(plans, { ...EMPTY_FILTERS, department: "Engineering" }).map(
        (p) => p.id,
      ),
    ).toEqual([energy.id]);

    expect(
      filterPlans(plans, {
        ...EMPTY_FILTERS,
        department: "Engineering",
        status: "done",
      }),
    ).toEqual([]);
  });

  it("matches the owner by case-insensitive substring", () => {
    expect(
      filterPlans(plans, { ...EMPTY_FILTERS, owner: "procurement lead" }).map(
        (p) => p.id,
      ),
    ).toEqual([procurement.id]);
  });

  it("filters by status", () => {
    const approved = { ...food, approved: true };

    expect(
      filterPlans([energy, approved], {
        ...EMPTY_FILTERS,
        status: "active",
      }).map((p) => p.id),
    ).toEqual([food.id]);
  });
});

describe("query string", () => {
  it("round-trips active filters and omits empty ones", () => {
    const filters = {
      ...EMPTY_FILTERS,
      department: "Food & Beverage",
      status: "pending" as const,
    };
    const query = filtersToQuery(filters);

    expect(query).toBe("department=Food+%26+Beverage&status=pending");
    expect(parseFilters(new URLSearchParams(query))).toEqual(filters);
    expect(filtersToQuery(EMPTY_FILTERS)).toBe("");
  });

  it("ignores unknown statuses and oversized values", () => {
    const parsed = parseFilters(
      new URLSearchParams({ status: "hacked", owner: "x".repeat(500) }),
    );

    expect(parsed.status).toBe("");
    expect(parsed.owner).toHaveLength(120);
    expect(hasActiveFilters(parsed)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
});
