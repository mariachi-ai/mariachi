# Recipe: Add a Domain Entity End-to-End

This walks through adding a new domain (e.g. `orders`) from schema to API endpoint. Each step references real patterns from the existing `users` domain.

---

## 1. Define the Schema

Create the table definition in `@mariachi/database`.

**File:** `packages/database/src/schema/orders.ts`

```ts
import { defineTable } from '../table';
import { column } from '../column';

export const ordersTable = defineTable('orders', {
  id:        column.uuid().primaryKey().defaultRandom(),
  tenantId:  column.text().notNull(),
  userId:    column.text().notNull(),
  total:     column.numeric().notNull(),
  status:    column.text().notNull(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
```

Export it from `packages/database/src/index.ts`:

```ts
export { ordersTable } from './schema/orders';
```

**Reference:** `packages/database/src/schema/users.ts`

---

## 2. Compile to Drizzle

Add the compiled table in `@mariachi/database-postgres`.

**File:** `packages/database-postgres/src/compiled-schemas.ts` (add to existing)

```ts
import { ordersTable } from '@mariachi/database';
export const orders = compileTable(ordersTable);
```

Export from `packages/database-postgres/src/index.ts`:

```ts
export { orders } from './compiled-schemas';
```

---

## 3. Create the Repository

**File:** `packages/database-postgres/src/repositories/orders.repository.ts`

```ts
import type { Context } from '@mariachi/core';
import { DrizzleRepository } from './drizzle.repository';
import { orders } from '../compiled-schemas';

export interface Order {
  id: string;
  tenantId: string;
  userId: string;
  total: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class DrizzleOrdersRepository extends DrizzleRepository<Order> {
  constructor(db: import('drizzle-orm/postgres-js').PostgresJsDatabase<Record<string, never>>) {
    super(orders, db, { tenantColumn: 'tenantId' });
  }

  async findByUser(ctx: Context, userId: string): Promise<Order[]> {
    return this.findMany(ctx, { userId } as Partial<Order>);
  }
}
```

Inherited from `DrizzleRepository`: `findById`, `findMany`, `create`, `update`, `softDelete`, `hardDelete`, `paginate`, `count`.

Export from `packages/database-postgres/src/index.ts`:

```ts
export { DrizzleOrdersRepository } from './repositories/orders.repository';
export type { Order } from './repositories/orders.repository';
```

**Reference:** `packages/database-postgres/src/repositories/users.repository.ts`

---

## 4. Create the Service

**File:** `apps/services/src/orders/orders.service.ts`

```ts
import type { Context } from '@mariachi/core';
import { z } from 'zod';

export const CreateOrderInput = z.object({
  userId: z.string(),
  total: z.string(),
  status: z.string().default('pending'),
  tenantId: z.string(),
});

export const GetOrderInput = z.object({
  orderId: z.string(),
});

export const OrdersService = {
  create: async (ctx: Context, input: z.infer<typeof CreateOrderInput>) => {
    ctx.logger.info({ userId: input.userId }, 'Creating order');
    // Replace with real repository call:
    // const repo = new DrizzleOrdersRepository(db);
    // return repo.create(ctx, input);
    return { id: crypto.randomUUID(), ...input, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
  },
  getById: async (ctx: Context, input: z.infer<typeof GetOrderInput>) => {
    ctx.logger.info({ orderId: input.orderId }, 'Fetching order');
    // Replace with real repository call:
    // const repo = new DrizzleOrdersRepository(db);
    // return repo.findById(ctx, input.orderId);
    return null;
  },
};
```

**Reference:** `apps/services/src/users/users.service.ts`

---

## 5. Register Communication Handlers

**File:** `apps/services/src/orders/orders.handler.ts`

```ts
import { createCommunication } from '@mariachi/communication';
import { OrdersService, CreateOrderInput, GetOrderInput } from './orders.service';
import { z } from 'zod';

const OrderOutput = z.object({
  id: z.string(),
  userId: z.string(),
  total: z.string(),
  status: z.string(),
  tenantId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export function registerOrdersHandlers(communication: ReturnType<typeof createCommunication>) {
  communication.register('orders.create', {
    schema: { input: CreateOrderInput, output: OrderOutput },
    handler: (ctx, input) => OrdersService.create(ctx, input),
  });
  communication.register('orders.getById', {
    schema: { input: GetOrderInput, output: OrderOutput.nullable() },
    handler: (ctx, input) => OrdersService.getById(ctx, input),
  });
}
```

Wire into the aggregate registration in `apps/services/src/index.ts`:

```ts
import { registerOrdersHandlers } from './orders/orders.handler';

export function registerServiceHandlers(communication) {
  registerUsersHandlers(communication);
  registerOrdersHandlers(communication);  // add this
}
```

**Reference:** `apps/services/src/users/users.handler.ts`

---

## 6. Add the Controller

**File:** `apps/api/src/controllers/orders.controller.ts`

```ts
import { z } from 'zod';
import { BaseController, type HttpContext } from '@mariachi/api-facade';
import { createCommunication } from '@mariachi/communication';

const CreateOrderInput = z.object({
  userId: z.string(),
  total: z.string(),
  status: z.string().optional(),
});

const GetOrderParams = z.object({
  orderId: z.string(),
});

const communication = createCommunication();

export class OrdersController extends BaseController {
  readonly prefix = 'orders';

  init() {
    this.post(this.buildPath(), this.create);
    this.get(this.buildPath(':id'), this.getById);
  }

  create = async (ctx: HttpContext, body: unknown) => {
    const input = CreateOrderInput.parse(body);
    return communication.call('orders.create', ctx, input);
  };

  getById = async (ctx: HttpContext, _body: unknown, params: Record<string, string>) => {
    const input = GetOrderParams.parse({ orderId: params.id });
    return communication.call('orders.getById', ctx, input);
  };
}
```

Register on a server in `apps/api/src/index.ts`:

```ts
import { OrdersController } from './controllers/orders.controller';

const publicServer = createPublicServer()
  .registerController(new UsersController())
  .registerController(new OrdersController());  // add this
```

**Reference:** `apps/api/src/controllers/users.controller.ts`

---

## 7. Add Tests

**File:** `apps/services/src/orders/test/orders.service.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestContext } from '@mariachi/testing';
import { OrdersService } from '../orders.service';

describe('OrdersService', () => {
  it('creates an order', async () => {
    const ctx = createTestContext();
    const result = await OrdersService.create(ctx, {
      userId: 'user-1',
      total: '99.99',
      status: 'pending',
      tenantId: 'tenant-1',
    });
    expect(result.id).toBeDefined();
    expect(result.userId).toBe('user-1');
  });
});
```

---

## Checklist

- [ ] Schema defined in `packages/database/src/schema/`
- [ ] Schema exported from `packages/database/src/index.ts`
- [ ] Compiled table added in `packages/database-postgres/src/compiled-schemas.ts`
- [ ] Repository created in `packages/database-postgres/src/repositories/`
- [ ] Service created in `apps/services/src/<domain>/`
- [ ] Handler registered via `communication.register()`
- [ ] Handler wired into `registerServiceHandlers()`
- [ ] Controller created in `apps/api/src/controllers/`
- [ ] Controller registered on server in `apps/api/src/index.ts`
- [ ] Tests added
