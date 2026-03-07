# Recipe: Add a Domain Entity End-to-End

This walks through adding a new domain (e.g. `orders`) from schema to API endpoint. Each step references real patterns from the existing `users` domain.

---

## 1. Define the Schema

Create the table definition in `@mariachi/database`.

**File:** (in your app or shared package) e.g. `src/schema/orders.ts`

```ts
import { defineTable } from '@mariachi/database';
import { column } from '@mariachi/database';

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

---

## 2. Compile to Drizzle

Add the compiled table for use with `@mariachi/database-postgres`. For framework tables (auth, billing, ai, etc.), import the table definitions from `@mariachi/schema` and compile them in the same file.

**File:** e.g. `src/compiled-schemas.ts`

```ts
import { ordersTable } from './schema/orders';
import { compileTable } from '@mariachi/database-postgres';
export const orders = compileTable(ordersTable);

// Optional: compile framework tables from @mariachi/schema
// import { rolesTable, billingCustomersTable } from '@mariachi/schema';
// export const roles = compileTable(rolesTable);
// export const billingCustomers = compileTable(billingCustomersTable);
```

---

## 3. Create the Repository

**File:** e.g. `src/repositories/orders.repository.ts`

```ts
import type { Context } from '@mariachi/core';
import { DrizzleRepository } from '@mariachi/database-postgres';
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

---

## 4. Create the Service

**File:** e.g. `src/orders/orders.service.ts` (in your services app)

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
    const repo = new DrizzleOrdersRepository(db);
    return repo.create(ctx, input);
  },
  getById: async (ctx: Context, input: z.infer<typeof GetOrderInput>) => {
    ctx.logger.info({ orderId: input.orderId }, 'Fetching order');
    const repo = new DrizzleOrdersRepository(db);
    return repo.findById(ctx, input.orderId);
  },
};
```

---

## 5. Register Communication Handlers

**File:** e.g. `src/orders/orders.handler.ts`

```ts
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

Wire into your aggregate registration (e.g. in your services app entry):

```ts
import { registerOrdersHandlers } from './orders/orders.handler';

export function registerServiceHandlers(communication) {
  registerUsersHandlers(communication);
  registerOrdersHandlers(communication);
}
```

---

## 6. Add the Controller

**File:** e.g. `src/controllers/orders.controller.ts` (in your API app)

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

Register on your server:

```ts
import { OrdersController } from './controllers/orders.controller';

const publicServer = createPublicServer()
  .registerController(new UsersController())
  .registerController(new OrdersController());
```

---

## 7. Add Tests

**File:** e.g. `src/orders/test/orders.service.test.ts`

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

- [ ] Schema defined and exported
- [ ] Compiled table added for Drizzle
- [ ] Repository created extending `DrizzleRepository`
- [ ] Service created in services app
- [ ] Handler registered via `communication.register()`
- [ ] Handler wired into `registerServiceHandlers()`
- [ ] Controller created in API app
- [ ] Controller registered on server
- [ ] Tests added
