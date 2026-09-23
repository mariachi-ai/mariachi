import type { ColumnDefinition, ColumnReference, ColumnType, ReferentialAction, TableDefinition } from './schema';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export class ColumnBuilder<TType extends ColumnType = ColumnType, TNotNull extends boolean = false, TData = unknown> {
  /** @internal */
  readonly _def: ColumnDefinition<TType, TNotNull, TData>;

  constructor(type: TType, name?: string, extra: Partial<ColumnDefinition> = {}) {
    this._def = { type, name, notNull: false as TNotNull, unique: false, primaryKey: false, ...extra } as ColumnDefinition<TType, TNotNull, TData>;
  }

  private get def(): Mutable<ColumnDefinition> {
    return this._def as Mutable<ColumnDefinition>;
  }

  notNull(): ColumnBuilder<TType, true, TData> {
    this.def.notNull = true;
    return this as unknown as ColumnBuilder<TType, true, TData>;
  }

  unique(): this {
    this.def.unique = true;
    return this;
  }

  primaryKey(): ColumnBuilder<TType, true, TData> {
    this.def.primaryKey = true;
    this.def.notNull = true;
    return this as unknown as ColumnBuilder<TType, true, TData>;
  }

  /** Adds a single-column index. Use `TableOptions.indexes` for composite or partial indexes. */
  index(): this {
    this.def.index = true;
    return this;
  }

  defaultRandom(): this {
    this.def.default = { kind: 'random' };
    return this;
  }

  defaultNow(): this {
    this.def.default = { kind: 'now' };
    return this;
  }

  /** Set to the current time on every update. Applied automatically to `updatedAt`. */
  onUpdateNow(): this {
    this.def.onUpdateNow = true;
    return this;
  }

  default(value: TData extends unknown ? unknown : TData): this {
    this.def.default = { kind: 'value', value };
    return this;
  }

  /** Raw SQL default, e.g. `defaultSql("'{}'::jsonb")`. */
  defaultSql(sql: string): this {
    this.def.default = { kind: 'sql', value: sql };
    return this;
  }

  precision(p: number, s: number): this {
    this.def.precision = p;
    this.def.scale = s;
    return this;
  }

  /** Foreign key. `ref` is lazy so tables can reference each other. */
  references(
    ref: () => TableDefinition,
    column = 'id',
    actions: { onDelete?: ReferentialAction; onUpdate?: ReferentialAction } = {},
  ): this {
    const reference: ColumnReference = { table: ref, column, ...actions };
    this.def.references = reference;
    return this;
  }

  /** Narrows the TypeScript type (typically for json columns). */
  $type<T>(): ColumnBuilder<TType, TNotNull, T> {
    return this as unknown as ColumnBuilder<TType, TNotNull, T>;
  }
}

export const column = {
  uuid: (name?: string) => new ColumnBuilder('uuid' as const, name),
  text: (name?: string) => new ColumnBuilder('text' as const, name),
  varchar: (length: number, name?: string) => new ColumnBuilder('varchar' as const, name, { length }),
  integer: (name?: string) => new ColumnBuilder('integer' as const, name),
  bigint: (name?: string) => new ColumnBuilder('bigint' as const, name),
  double: (name?: string) => new ColumnBuilder('double' as const, name),
  boolean: (name?: string) => new ColumnBuilder('boolean' as const, name),
  /** `timestamptz` by default. */
  timestamp: (name?: string, options: { withTimezone?: boolean } = {}) =>
    new ColumnBuilder('timestamp' as const, name, { withTimezone: options.withTimezone ?? true }),
  date: (name?: string) => new ColumnBuilder('date' as const, name),
  json: (name?: string) => new ColumnBuilder('json' as const, name),
  numeric: (name?: string) => new ColumnBuilder('numeric' as const, name),
  /** Postgres enum. `enumName` defaults to `<table>_<column>` when compiled. */
  enum: <const V extends readonly [string, ...string[]]>(values: V, options: { name?: string; enumName?: string } = {}) =>
    new ColumnBuilder<'enum', false, V[number]>('enum' as const, options.name, { enumValues: values, enumName: options.enumName }),
};

/** Helper for `TableOptions.indexes`. Pass column keys (camelCase), not SQL names. */
export function index(name: string) {
  const def = { name, columns: [] as string[], unique: false, where: undefined as string | undefined };
  const api = {
    on(...columns: string[]) {
      def.columns = columns;
      return api;
    },
    unique() {
      def.unique = true;
      return api;
    },
    where(sql: string) {
      def.where = sql;
      return api;
    },
    build: () => ({ ...def }),
  };
  return api;
}
