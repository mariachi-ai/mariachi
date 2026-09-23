export type ColumnType =
  | 'uuid'
  | 'text'
  | 'varchar'
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'timestamp'
  | 'date'
  | 'json'
  | 'numeric'
  | 'double'
  | 'enum';

export interface ColumnDefault {
  kind: 'value' | 'random' | 'now' | 'sql';
  value?: unknown;
}

export type ReferentialAction = 'cascade' | 'restrict' | 'set null' | 'set default' | 'no action';

export interface ColumnReference {
  /** Lazily resolved to avoid import cycles between tables. */
  table: () => TableDefinition;
  column: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export interface ColumnDefinition<
  TType extends ColumnType = ColumnType,
  TNotNull extends boolean = boolean,
  TData = unknown,
> {
  type: TType;
  name?: string;
  notNull: TNotNull;
  unique: boolean;
  primaryKey: boolean;
  default?: ColumnDefault;
  precision?: number;
  scale?: number;
  length?: number;
  enumValues?: readonly string[];
  enumName?: string;
  /** Timestamps default to `timestamptz`. */
  withTimezone?: boolean;
  references?: ColumnReference;
  /** Single-column index shorthand. */
  index?: boolean;
  /** Timestamp bumped to now() on every update. */
  onUpdateNow?: boolean;
  /** Phantom type for `.$type<T>()` and enums. */
  readonly _data?: TData;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
  /** Raw SQL predicate for partial indexes, e.g. `deleted_at IS NULL`. */
  where?: string;
}

export interface CheckDefinition {
  name: string;
  sql: string;
}

export interface TableOptions {
  indexes?: IndexDefinition[];
  checks?: CheckDefinition[];
  /** Composite primary key (column keys). */
  primaryKey?: string[];
  /** Column key that scopes rows to a tenant. Auto-detected as `tenantId` when present. Set `false` to disable. */
  tenantColumn?: string | false;
  /** Soft delete column key. Auto-detected as `deletedAt` when present. Set `false` to disable. */
  softDeleteColumn?: string | false;
}

export interface TableDefinition<
  TColumns extends Record<string, ColumnDefinition> = Record<string, ColumnDefinition>,
> {
  tableName: string;
  columns: TColumns;
  indexes: IndexDefinition[];
  checks: CheckDefinition[];
  primaryKey?: string[];
  tenantColumn?: string;
  softDeleteColumn?: string;
}

type ColumnTsType<C extends ColumnDefinition> = unknown extends C['_data']
  ? C['type'] extends 'uuid' | 'text' | 'varchar' | 'numeric' | 'date' | 'enum'
    ? string
    : C['type'] extends 'integer' | 'double' | 'bigint'
      ? number
      : C['type'] extends 'boolean'
          ? boolean
          : C['type'] extends 'timestamp'
            ? Date
            : unknown
  : NonNullable<C['_data']>;

type NullableColumn<C extends ColumnDefinition, V> = C['notNull'] extends true ? V : V | null;

/**
 * Infer a TypeScript entity type from a TableDefinition.
 * Not-null columns produce required non-null types; nullable columns produce `T | null`.
 */
export type InferEntity<T extends TableDefinition> = {
  [K in keyof T['columns']]: NullableColumn<T['columns'][K], ColumnTsType<T['columns'][K]>>;
};

type HasDefault<C extends ColumnDefinition> = C['default'] extends ColumnDefault ? true : false;
type OptionalKeys<T extends TableDefinition> = {
  [K in keyof T['columns']]: T['columns'][K]['notNull'] extends true
    ? HasDefault<T['columns'][K]> extends true
      ? K
      : T['columns'][K]['primaryKey'] extends true
        ? K
        : never
    : K;
}[keyof T['columns']];

/** Insert shape: columns with defaults or nullable columns are optional. */
export type InferInsert<T extends TableDefinition> = Omit<InferEntity<T>, OptionalKeys<T>> &
  Partial<Pick<InferEntity<T>, OptionalKeys<T>>>;
