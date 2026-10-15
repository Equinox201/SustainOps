import { Suspense } from "react";
import type { Metadata } from "next";
import ActionPlansApp from "@/features/action-plans/components/ActionPlansApp";

export const metadata: Metadata = {
  title: "Action plan — SustainOps",
};

/**
 * A deep link to one plan (or `/plans/new`). The same client app renders it:
 * it reads the id from the address, so signing in, filters and Back/Forward
 * keep working without a full page reload.
 */
export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <ActionPlansApp />
    </Suspense>
  );
}
