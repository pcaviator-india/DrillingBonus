"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function BestRigEligibleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (!logged) {
      console.error("Best Rig Eligibility page error:", error);
      setLogged(true);
    }
  }, [error, logged]);

  return (
    <div className="space-y-8 py-20 text-center">
      <h2 className="text-2xl font-bold text-red-900">Something went wrong</h2>
      <p className="text-muted-foreground">
        The Best Rig Eligibility page could not render. This is usually caused
        by a missing database migration.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
      <Button
        variant="outline"
        onClick={() => {
          window.location.href = "/calculations";
        }}
      >
        Go to Calculations
      </Button>
    </div>
  );
}