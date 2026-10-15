import type {
  GovernanceReview,
  KPIProgress,
  ReadinessChecklist,
  SustainabilityCaseInput,
} from "@/lib/types";

export const departmentOptions = [
  "Housekeeping",
  "Front Office",
  "Food & Beverage",
  "Engineering",
  "Spa & Wellness",
  "Procurement",
  "People & Culture",
  "Finance",
  "Sales & Marketing",
  "Sustainability",
];

export const defaultSustainabilityCase: SustainabilityCaseInput = {
  property: "Harbour House Singapore",
  department: "Housekeeping",
  issue: "Laundry usage increased above baseline",
  currentMetric: "18% increase in laundry volume",
  targetMetric: "Return to baseline within 60 days",
  operationalContext:
    "Inconsistent towel reuse adoption and unclear staff communication",
};

export const emptyGovernanceReview: GovernanceReview = {
  humanReviewRequired: true,
  containsGuestPersonalData: false,
  approvedOperationalUse: false,
  reviewerStatus: "Pending",
  auditTimestamp: "",
};

export const emptyReadinessChecklist: ReadinessChecklist = {
  actionsAreSpecific: false,
  kpisAreMeasurable: false,
  ownerAssigned: false,
  timelineDefined: false,
  privacyReviewed: false,
  staffMessageReady: false,
};

export const emptyKpiProgress: KPIProgress = {
  baseline: "",
  current: "",
  target: "",
  latestUpdate: "",
};

export const readinessChecklistItems: Array<{
  field: keyof ReadinessChecklist;
  label: string;
}> = [
  {
    field: "actionsAreSpecific",
    label: "Actions are specific enough for the department team",
  },
  {
    field: "kpisAreMeasurable",
    label: "KPIs are measurable",
  },
  {
    field: "ownerAssigned",
    label: "Owner has been assigned",
  },
  {
    field: "timelineDefined",
    label: "Timeline is defined",
  },
  {
    field: "privacyReviewed",
    label: "Privacy and guest data risk reviewed",
  },
  {
    field: "staffMessageReady",
    label: "Staff communication message is ready",
  },
];
