# Mariachi Architecture

## Three-Layer Request Flow

```
HTTP Request → Facade → Controller → Communication Layer → Service
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Facade** | `apps/api/src/servers/` | Fastify server, auth strategies, rate limiting |
| **Controller** | `apps/api/src/controllers/` | Parse/validate input (Zod), call `communication.call()` |
| **Service** | `apps/services/src/<domain>/` | Business logic, DB, cache, events, jobs |

## Import Boundaries

- **Controllers** may import: `@mariachi/api-facade`, `@mariachi/communication`, `zod`
- **Services** may import: any `@mariachi/*` package
- **Controllers never import services directly** -- always go through the communication layer

## Project Structure

```
apps/
  api/              → HTTP servers + controllers (Facade + Controller layers)
  services/         → Domain services + communication handlers (Service layer)
  worker/           → BullMQ job workers
packages/           → 27 shared framework packages (see packages.md)
integrations/       → Third-party integrations (Slack, etc.)
examples/           → Reference implementations
docs/               → Architecture docs, recipes, ADRs
```

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

- `bootstrap()` from `@mariachi/lifecycle` -- loads config, creates observability, sets up DI container
- `createCommunication()` from `@mariachi/communication` -- returns in-process communication layer
- `FastifyAdapter` from `@mariachi/api-facade` -- builds HTTP server with auth and rate limiting
- `registerServiceHandlers()` from `apps/services` -- wires all domain handlers to communication layer
