# Mariachi Architecture

## Three-Layer Request Flow

```
HTTP Request → Facade → Controller → Communication Layer → Service
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Facade** | Your API app (e.g. `src/servers/`) | Fastify server, auth strategies, rate limiting |
| **Controller** | Your API app (e.g. `src/controllers/`) | Parse/validate input (Zod), call `communication.call()` |
| **Service** | Your services app (e.g. `src/<domain>/`) | Business logic, DB, cache, events, jobs |

## Import Boundaries

- **Controllers** may import: `@mariachi/api-facade`, `@mariachi/communication`, `zod`
- **Services** may import: any `@mariachi/*` package
- **Controllers never import services directly** — always go through the communication layer

## Project Structure

Organize your app in three layers:

- **API app** — HTTP servers + controllers (Facade + Controller layers)
- **Services app** — Domain services + communication handlers (Service layer)
- **Worker app** — BullMQ job workers and schedules

## Naming Conventions

| Artifact | Convention | Example |
|----------|-----------|---------|
| Controller | `<Domain>Controller` in `<domain>.controller.ts` | `UsersController` |
| Service | `<Domain>Service` object in `<domain>.service.ts` | `UsersService` |
| Handler | `register<Domain>Handlers` in `<domain>.handler.ts` | `registerUsersHandlers` |
| Job | `<Action>Job` object in `<action>.job.ts` | `SendEmailJob` |
| Schema table | `<domain>Table` via `defineTable` | `usersTable` |
| Repository | `Drizzle<Domain>Repository` | `DrizzleUsersRepository` |
| Procedure name | `<domain>.<action>` | `users.create` |

## Key Entry Points

- `bootstrap()` from `@mariachi/lifecycle` — loads config, creates observability, sets up DI container
- `createCommunication()` from `@mariachi/communication` — returns in-process communication layer
- `FastifyAdapter` from `@mariachi/api-facade` — builds HTTP server with auth and rate limiting
- Register your domain handlers with the communication layer so controllers can call them via `communication.call('<domain>.<action>', ctx, input)`
