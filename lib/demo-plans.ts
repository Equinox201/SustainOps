import type { AIActionPlan, StoredActionPlan } from "@/lib/types";

const demoTimestamp = "2026-06-07T00:00:00.000Z";

const emptyReadinessChecklist: StoredActionPlan["readinessChecklist"] = {
  actionsAreSpecific: false,
  kpisAreMeasurable: false,
  ownerAssigned: false,
  timelineDefined: false,
  privacyReviewed: false,
  staffMessageReady: false,
};

const defaultGovernanceReview: StoredActionPlan["governanceReview"] = {
  humanReviewRequired: true,
  containsGuestPersonalData: false,
  approvedOperationalUse: false,
  reviewerStatus: "Pending",
  auditTimestamp: demoTimestamp,
};

type SeedFields =
  | "generationId"
  | "version"
  | "reviewStatus"
  | "reviewComment"
  | "createdBy"
  | "approvedBy"
  | "approvedAt";

type RawAiPlan = Omit<
  AIActionPlan,
  "recommendedOperationalActions" | "sources" | "grounding"
> & { recommendedOperationalActions: string[] };

type RawDemoPlan = Omit<StoredActionPlan, SeedFields | "actionPlan"> & {
  actionPlan: RawAiPlan;
};

const rawDemoActionPlans: RawDemoPlan[] = [
  {
    id: "demo-energy-floor-shutdown",
    title:
      "Front Office & Engineering — Low-occupancy floor energy reduction",
    sustainabilityCase: {
      property: "Harbour House Singapore",
      department: "Engineering",
      issue:
        "Room assignment during low occupancy does not consistently support energy-saving floor shutdowns",
      currentMetric:
        "Low occupancy periods still show lighting and air-conditioning active across multiple lightly used floors",
      targetMetric:
        "Consolidate room assignment during low occupancy and reduce unnecessary floor-level HVAC and lighting use within 30 days",
      operationalContext:
        "Front Office and Engineering need a shared workflow so rooms are allocated by floor during low-occupancy periods where guest experience allows. Engineering can then switch off or reduce air-conditioning and lighting on unused floors while maintaining readiness and guest comfort standards.",
    },
    actionPlan: {
      situationSummary:
        "Low-occupancy nights create an opportunity to reduce floor-level energy use, but room assignment and engineering shutdown decisions are not yet coordinated through a consistent operating rhythm.",
      likelyRootCauses: [
        "Front Office allocation decisions are optimized for availability and guest preference rather than floor consolidation.",
        "Engineering does not always receive timely visibility on low-occupancy room distribution.",
        "There is no shared trigger for when a floor can move to reduced HVAC and lighting mode.",
        "Teams may be cautious about energy reduction if guest comfort or readiness standards are unclear.",
      ],
      recommendedOperationalActions: [
        "Create a low-occupancy room allocation guideline that prioritizes floor consolidation when guest preferences and room categories allow.",
        "Add a daily Front Office and Engineering check-in for occupancy forecast, blocked rooms, and floors eligible for reduced energy mode.",
        "Define minimum comfort and readiness standards before any floor-level HVAC or lighting adjustment is made.",
        "Pilot the workflow for two weeks, then review guest feedback, exceptions, and energy indicators.",
      ],
      staffMicroTrainingMessage:
        "When occupancy is low, thoughtful room assignment can help Engineering reduce energy use on unused floors while preserving guest comfort. Coordinate early, follow guest preference rules, and escalate any comfort concern immediately.",
      managerChecklist: [
        "Confirm daily low-occupancy threshold and eligible room categories.",
        "Review room assignment pattern before arrival peak.",
        "Document which floors are placed in reduced energy mode.",
        "Check guest comfort standards and exception handling.",
        "Review energy and guest feedback results weekly.",
      ],
      kpisToMonitor: [
        "Number of low-occupancy nights using floor consolidation",
        "Floors placed in reduced HVAC or lighting mode",
        "Floor-level energy consumption during eligible nights",
        "Guest comfort complaints or room move requests",
      ],
      governancePrivacyNotes: [
        "Do not use guest personal data in the action plan or KPI notes.",
        "Validate energy actions with Engineering and guest comfort standards before implementation.",
        "Treat AI output as an operational recommendation requiring manager review.",
      ],
      followUpRecommendations: [
        "Review pilot results after two weeks with Front Office and Engineering.",
        "Document approved exceptions for VIP arrivals, accessibility needs, and maintenance blocks.",
        "Convert the pilot workflow into a simple shift checklist if results are positive.",
      ],
      confidenceLevel: "Medium",
      humanReviewRequired: true,
    },
    governanceReview: defaultGovernanceReview,
    actionNotes: "",
    owner: "Engineering Manager",
    priority: "High",
    targetDate: "2026-07-07",
    nextReviewDate: "2026-06-21",
    readinessChecklist: emptyReadinessChecklist,
    kpiProgress: {
      baseline:
        "Multiple lightly occupied floors remain active during low-occupancy nights",
      current: "Manual coordination between Front Office and Engineering",
      target:
        "Documented room-assignment and floor-shutdown workflow for low-occupancy periods",
      latestUpdate: "",
    },
    approved: false,
    completed: false,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
  },
  {
    id: "demo-breakfast-croissant-waste",
    title: "Food & Beverage — Breakfast buffet croissant waste reduction",
    sustainabilityCase: {
      property: "Seaview Urban Hotel",
      department: "Food & Beverage",
      issue: "Breakfast buffet pastry waste is high, particularly croissants",
      currentMetric:
        "Croissants are frequently left over after breakfast service and discarded",
      targetMetric:
        "Reduce croissant waste within 30 days while maintaining guest satisfaction and buffet presentation standards",
      operationalContext:
        "Breakfast teams need a practical approach to batch replenishment, display size, production forecasting, and end-of-service reuse options where food safety standards allow.",
    },
    actionPlan: {
      situationSummary:
        "Croissant waste is recurring after breakfast service, suggesting production and replenishment are not yet calibrated to daily demand patterns while maintaining a premium buffet presentation.",
      likelyRootCauses: [
        "Production quantities may be based on habit rather than occupancy, covers, and recent pickup trends.",
        "Large display quantities can encourage over-replenishment late in service.",
        "Shift teams may not have a clear end-of-service decision rule for final pastry batches.",
        "Food safety and approved reuse options may not be consistently understood.",
      ],
      recommendedOperationalActions: [
        "Track croissant production, replenishment, covers, and leftovers daily for two weeks.",
        "Move to smaller late-service replenishment batches while keeping the buffet visually complete.",
        "Set a final replenishment decision point based on remaining covers and service time.",
        "Review approved reuse or staff meal options with culinary leadership and food safety standards.",
      ],
      staffMicroTrainingMessage:
        "A premium buffet does not require overproduction. Replenish croissants in smaller late-service batches, keep presentation standards high, and follow food safety guidance for any end-of-service handling.",
      managerChecklist: [
        "Confirm daily cover forecast before production.",
        "Review late-service replenishment quantities with the breakfast team.",
        "Record leftover croissants at the end of each service.",
        "Check guest satisfaction or buffet presentation comments.",
        "Validate any reuse pathway with food safety requirements.",
      ],
      kpisToMonitor: [
        "Croissants produced per breakfast cover",
        "Croissants left over after service",
        "Late-service replenishment batches",
        "Guest satisfaction comments on buffet quality",
      ],
      governancePrivacyNotes: [
        "Do not include guest personal data in waste notes or service observations.",
        "Any reuse recommendation must follow food safety and culinary approval.",
        "Avoid unsupported claims about waste reduction until measured.",
      ],
      followUpRecommendations: [
        "Review two weeks of leftover data before changing standard production quantities.",
        "Compare weekday, weekend, and high-occupancy patterns separately.",
        "Share the final replenishment rule in the breakfast shift briefing.",
      ],
      confidenceLevel: "Medium",
      humanReviewRequired: true,
    },
    governanceReview: defaultGovernanceReview,
    actionNotes: "",
    owner: "F&B Manager",
    priority: "Medium",
    targetDate: "2026-07-07",
    nextReviewDate: "2026-06-21",
    readinessChecklist: emptyReadinessChecklist,
    kpiProgress: {
      baseline: "Daily croissant leftovers observed after breakfast service",
      current: "Production and replenishment decisions vary by shift",
      target: "Reduce croissant leftovers while maintaining buffet quality",
      latestUpdate: "",
    },
    approved: false,
    completed: false,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
  },
  {
    id: "demo-procurement-supplier-screening",
    title:
      "Procurement — Supplier sustainability screening for high-impact purchases",
    sustainabilityCase: {
      property: "Alpine Bay Resort",
      department: "Procurement",
      issue:
        "Sustainability criteria are not consistently considered when selecting suppliers for recurring operational purchases",
      currentMetric:
        "Supplier selection mainly focuses on price, availability, and quality, with limited structured sustainability review",
      targetMetric:
        "Introduce a simple supplier sustainability screening step for priority purchasing categories within 60 days",
      operationalContext:
        "Procurement needs a lightweight, practical supplier review process that considers packaging, transport distance, certifications, product durability, and supplier transparency without slowing down urgent operational purchasing.",
    },
    actionPlan: {
      situationSummary:
        "Recurring supplier decisions currently emphasize price, quality, and availability, leaving sustainability factors dependent on individual buyer judgment rather than a repeatable screening step.",
      likelyRootCauses: [
        "Sustainability criteria are not embedded in the standard supplier comparison process.",
        "Buyers may lack a simple checklist for packaging, transport, certification, and durability questions.",
        "Urgent purchases can bypass broader supplier review.",
        "Supplier sustainability information may be inconsistent or difficult to compare.",
      ],
      recommendedOperationalActions: [
        "Define priority purchasing categories where sustainability screening will apply first.",
        "Create a one-page supplier screening checklist covering packaging, transport distance, certifications, durability, and transparency.",
        "Add the checklist to supplier comparison for non-urgent recurring purchases.",
        "Review the first five screened purchases with Procurement and Sustainability before standardizing.",
      ],
      staffMicroTrainingMessage:
        "Sustainable procurement starts with consistent questions. For priority categories, compare suppliers on practical sustainability factors alongside price, quality, and availability.",
      managerChecklist: [
        "Select initial high-impact purchasing categories.",
        "Approve the supplier screening checklist.",
        "Confirm when urgent purchasing exceptions apply.",
        "Review completed supplier comparisons monthly.",
        "Capture supplier gaps and follow-up questions.",
      ],
      kpisToMonitor: [
        "Priority categories with screening in place",
        "Supplier comparisons using the sustainability checklist",
        "Suppliers able to provide packaging or certification information",
        "Purchasing exceptions due to urgent operational need",
      ],
      governancePrivacyNotes: [
        "Do not include guest personal data in supplier assessments.",
        "Avoid making sustainability claims unless supplier evidence is available.",
        "Manager review is required before changing purchasing criteria.",
      ],
      followUpRecommendations: [
        "Pilot the checklist with two recurring categories before expanding.",
        "Create a shared supplier evidence folder or record in the future database design.",
        "Review whether screening affects cost, availability, and operational quality.",
      ],
      confidenceLevel: "Medium",
      humanReviewRequired: true,
    },
    governanceReview: defaultGovernanceReview,
    actionNotes: "",
    owner: "Procurement Lead",
    priority: "Medium",
    targetDate: "2026-08-06",
    nextReviewDate: "2026-06-28",
    readinessChecklist: emptyReadinessChecklist,
    kpiProgress: {
      baseline:
        "No consistent sustainability screening step for recurring supplier selection",
      current:
        "Supplier comparison is mostly price, quality, and availability based",
      target: "Sustainability screening used for priority purchasing categories",
      latestUpdate: "",
    },
    approved: false,
    completed: false,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
  },
];

/**
 * Which corpus section supports each recommended action, per demo plan
 * (outer index = action). Resolved against the ingested knowledge base when
 * the demo plans are seeded, so a demo plan cites real, retrieved sections.
 */
export type DemoCitation = { slug: string; sectionRef: string };

export const demoCitations: Record<string, DemoCitation[][]> = {
  "demo-energy-floor-shutdown": [
    [{ slug: "energy-hvac-operations-sop", sectionRef: "§2.2" }],
    [{ slug: "energy-hvac-operations-sop", sectionRef: "§2.2" }],
    [{ slug: "energy-hvac-operations-sop", sectionRef: "§3.3" }],
    [{ slug: "energy-hvac-operations-sop", sectionRef: "§4.1" }],
  ],
  "demo-breakfast-croissant-waste": [
    [{ slug: "food-waste-sop", sectionRef: "§2.1" }],
    [
      { slug: "food-waste-sop", sectionRef: "§3.1" },
      { slug: "food-waste-sop", sectionRef: "§3.3" },
    ],
    [{ slug: "food-waste-sop", sectionRef: "§3.3" }],
    [{ slug: "food-waste-sop", sectionRef: "§4.2" }],
  ],
  "demo-procurement-supplier-screening": [
    [{ slug: "sustainable-procurement-policy", sectionRef: "§1.1" }],
    [{ slug: "sustainable-procurement-policy", sectionRef: "§2.1" }],
    [
      { slug: "sustainable-procurement-policy", sectionRef: "§2.1" },
      { slug: "sustainable-procurement-policy", sectionRef: "§2.2" },
    ],
    [{ slug: "sustainable-procurement-policy", sectionRef: "§2.2" }],
  ],
};

/** Demo plans without grounding; the seed route attaches real sources. */
export const demoActionPlans: StoredActionPlan[] = rawDemoActionPlans.map(
  (plan) => ({
    ...plan,
    actionPlan: {
      ...plan.actionPlan,
      recommendedOperationalActions:
        plan.actionPlan.recommendedOperationalActions.map((action) => ({
          action,
          sourceIds: [],
        })),
      sources: [],
      grounding: { status: "ungrounded", retrievedCount: 0 },
    },
    generationId: null,
    version: 1,
    reviewStatus: "none",
    reviewComment: null,
    createdBy: null,
    approvedBy: null,
    approvedAt: null,
  }),
);
