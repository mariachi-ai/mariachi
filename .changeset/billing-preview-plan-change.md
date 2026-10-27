---
"@mariachi/billing": minor
---

`previewPlanChange(ctx, subscriptionId, patch)` reports what `changePlan` would bill without making the change, for a confirmation step. The result has the proration total, the invoice total and when that invoice is billed, the lines, and `prorationDate`. `changePlan` takes `prorationDate`; pass the preview's to bill exactly what was shown. Adapters gain `previewSubscriptionChange`: Stripe's uses `invoices.createPreview` with the same item changes the update sends, and the memory adapter's prorates by the time left in the period.
