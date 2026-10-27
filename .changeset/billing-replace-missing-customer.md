---
"@mariachi/billing": minor
---

`ensureCustomer(ctx, input, { verify: true })` asks the provider whether it still has the stored customer, and replaces one it doesn't have with a new customer. That happens when the customer was deleted at the provider, or was made by another adapter, such as the memory adapter's before a provider was configured. The tenant's credit ledger and usage records move to the new customer, so the balance carries over. The stores have a new `replaceCustomer(oldCustomerId, customer, occurredAt)`, which does this atomically.
