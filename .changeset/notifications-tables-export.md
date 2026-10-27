---
"@mariachi/notifications": patch
---

Export `notificationTables` from `@mariachi/notifications/postgres`: the compiled Drizzle tables, so an app's drizzle-kit schema can migrate them (as `billingTables` does for billing).
