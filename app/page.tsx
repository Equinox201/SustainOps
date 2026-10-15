import { Suspense } from "react";
import ActionPlansApp from "@/features/action-plans/components/ActionPlansApp";

export default function Home() {
  // useSearchParams (list filters) needs a Suspense boundary for static pages.
  return (
    <Suspense fallback={null}>
      <ActionPlansApp />
    </Suspense>
  );
}
