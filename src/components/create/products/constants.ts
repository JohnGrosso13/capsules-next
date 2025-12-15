import type { WizardLayoutStep } from "@/components/create/ladders/components/WizardLayout";

import type { ProductStepId } from "./types";

export const PRODUCT_STEPS: WizardLayoutStep<ProductStepId>[] = [
  { id: "design", title: "Design", subtitle: "Upload art, pick colors/sizes, and placement" },
  { id: "details", title: "Details", subtitle: "Title, summary, and storefront copy" },
  { id: "pricing", title: "Pricing", subtitle: "Set price, publish state, and feature flag" },
  { id: "review", title: "Review", subtitle: "Confirm variants and publish to store" },
];
