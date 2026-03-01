export type ColumnType = 'uuid' | 'text' | 'integer' | 'boolean' | 'timestamp' | 'json' | 'numeric';

export interface ColumnDefault {
  kind: 'value' | 'random' | 'now';
  value?: unknown;
}

export interface ColumnDefinition<
  TType extends ColumnType = ColumnType,
  TNotNull extends boolean = boolean,
> {
  type: TType;
  name?: string;
  notNull: TNotNull;
  unique: boolean;
  primaryKey: boolean;
  default?: ColumnDefault;
  precision?: number;
  scale?: number;
}

export interface TableDefinition<
  TColumns extends Record<string, ColumnDefinition> = Record<string, ColumnDefinition>,
> {
  tableName: string;
  columns: TColumns;
}

type ColumnTsType<C extends ColumnDefinition> =
  C['type'] extends 'uuid' ? string :
  C['type'] extends 'text' ? string :
  C['type'] extends 'integer' ? number :
  C['type'] extends 'boolean' ? boolean :
  C['type'] extends 'timestamp' ? Date :
  C['type'] extends 'json' ? unknown :
  C['type'] extends 'numeric' ? string :
  unknown;

type NullableColumn<C extends ColumnDefinition, V> =
  C['notNull'] extends true ? V : V | null;

/**
 * Infer a TypeScript entity type from a TableDefinition.
 * Not-null columns produce required non-null types;
 * nullable columns produce `T | null`.
 */
export type InferEntity<T extends TableDefinition> = {
  [K in keyof T['columns']]: NullableColumn<T['columns'][K], ColumnTsType<T['columns'][K]>>;
};
