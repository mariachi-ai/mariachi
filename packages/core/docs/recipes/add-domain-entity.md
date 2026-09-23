# Recipe: add a domain entity

Goal: an `orders` domain with a table, repository, service, procedures, HTTP routes and tests.

## 0. Generate the slice

```bash
mariachi generate entity order
```

This writes the files below and registers them in `src/schema/index.ts`, `src/services/index.ts` and
`src/api/controllers/index.ts`. The steps that follow explain each file and what to change. If you
write them by hand, keep the same names and locations: `mariachi validate` relies on them.

## 1. Table: `src/schema/orders.ts`

```ts
import { column, defineTable, index, type InferEntity } from '@mariachi/database';

export const ordersTable = defineTable(
  'orders',
  {
    id: column.uuid().primaryKey().defaultRandom(),
    tenantId: column.text().notNull(),                 // tenant-scoped: repositories filter by ctx.tenantId
    customerId: column.uuid().notNull().references(() => customersTable.columns.id, { onDelete: 'restrict' }),
    status: column.enum(['pending', 'paid', 'cancelled']).notNull().default('pending'),
    totalCents: column.integer().notNull(),
    createdAt: column.timestamp().notNull().defaultNow(),
    updatedAt: column.timestamp().notNull().defaultNow(),   // bumped on every update
    deletedAt: column.timestamp(),                     // soft delete
  },
  { indexes: [index('orders_tenant_status_idx').on('tenantId', 'status')] },
);

export type Order = InferEntity<typeof ordersTable>;
```

Then create the migration and apply it:

```bash
mariachi db generate --name add_orders
mariachi db migrate
```

## 2. Contract: `src/contracts/orders.ts`

Zod schemas for every procedure's input and output, plus the `Procedures` augmentation that types
`communication.call`. Controllers and handlers both import from here; this is the only thing they share.

```ts
export const orderSchema = z.object({ id: z.string().uuid(), status: z.enum(['pending', 'paid', 'cancelled']), totalCents: z.number().int(), createdAt: z.date(), updatedAt: z.date() });
export const createOrderInput = z.object({ customerId: z.string().uuid(), totalCents: z.number().int().positive() });
export type CreateOrderInput = z.infer<typeof createOrderInput>;
export type OrderDto = z.infer<typeof orderSchema>;

declare module '@mariachi/communication' {
  interface Procedures {
    'orders.create': { input: CreateOrderInput; output: OrderDto };
  }
}
```

Output schemas strip anything they don't list (such as `tenantId` and `deletedAt`), so internal
columns never reach clients.

## 3. Repository: `src/services/orders/orders.repository.ts`

```ts
export class OrdersRepository extends DrizzleRepository<Order> {
  constructor(db: DrizzleDb) {
    super(ordersTable, db);
  }

  findPendingForCustomer(ctx: Context, customerId: string) {
    return this.findMany(ctx, { customerId, status: 'pending' });
  }
}
```

The base class provides `findById`, `getById` (throws `NotFoundError`), `findOne`, `findMany`, `exists`,
`create`, `createMany`, `update`, `updateWhere`, `softDelete`, `restore`, `hardDelete`, `paginate`,
`paginateCursor`, `count` and `deleteWhere`. Every one of them applies the tenant filter and hides
soft-deleted rows. Filters on unknown columns throw.

## 4. Service: `src/services/orders/orders.service.ts`

Business rules live here. Methods take `ctx` first and throw typed errors.

```ts
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly jobs: Jobs,
  ) {}

  async create(ctx: Context, input: CreateOrderInput): Promise<Order> {
    const order = await this.orders.create(ctx, { customerId: input.customerId, totalCents: input.totalCents });
    await this.jobs.enqueue(ctx, 'send-order-confirmation', { orderId: order.id });
    return order;
  }

  async cancel(ctx: Context, id: string): Promise<Order> {
    const order = await this.orders.getById(ctx, id);
    if (order.status === 'paid') throw new ConflictError('orders/already-paid', 'Paid orders cannot be cancelled');
    return this.orders.update(ctx, id, { status: 'cancelled' });
  }
}
```

For several writes that must succeed together, wrap them in `withTransaction(db, ctx, async () => ...)`.
Repositories inside the callback use the transaction automatically. Use the
[outbox](../events.md#transactional-outbox) to publish events from inside it.

## 5. Handler: `src/services/orders/orders.handler.ts`

```ts
export function registerOrdersHandlers(communication: CommunicationLayer, service: OrdersService): void {
  communication.register('orders.create', {
    schema: { input: createOrderInput, output: orderSchema },
    requiredScopes: ['orders:write'],   // optional; checked against ctx.scopes
    handler: (ctx, input) => service.create(ctx, input),
  });
}
```

Wire it in `src/services/index.ts` (the generator does this):

```ts
registerOrdersHandlers(communication, new OrdersService(new OrdersRepository(deps.db), deps.jobs));
```

## 6. Controller: `src/api/controllers/orders.controller.ts`

```ts
export class OrdersController extends BaseController {
  readonly prefix = 'orders';

  init(): void {
    this.post('/', { schema: { body: createOrderInput, response: orderSchema }, status: 201, scopes: ['orders:write'] }, (ctx, body) =>
      this.call<OrderDto>(ctx, 'orders.create', body),
    );
  }
}
```

The communication layer reaches the controller through its constructor
(`new OrdersController(communication)` in `src/api/controllers/index.ts`), not through an import of the
service. See [http.md](../http.md) for route options.

## 7. Tests

- **Service unit test** (`orders.service.test.ts`, generated): fake the repository and assert the
  rules.
- **Integration test** against real Postgres, using Testcontainers or `DATABASE_URL`: run migrations,
  then call procedures through `communication.call(ctx, 'orders.create', input)` with a context for
  tenant A, and assert tenant B can't read the row.

Finally, run `mariachi validate`.
