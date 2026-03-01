import type { ColumnType, ColumnDefinition } from './schema';

export class ColumnBuilder<
  TType extends ColumnType = ColumnType,
  TNotNull extends boolean = false,
> {
  /** @internal */
  readonly _def: ColumnDefinition<TType, TNotNull>;

  constructor(type: TType, name?: string) {
    this._def = {
      type,
      name,
      notNull: false as TNotNull,
      unique: false,
      primaryKey: false,
    };
  }

  notNull(): ColumnBuilder<TType, true> {
    (this._def as any).notNull = true;
    return this as unknown as ColumnBuilder<TType, true>;
  }

  unique(): this {
    (this._def as any).unique = true;
    return this;
  }

  primaryKey(): ColumnBuilder<TType, true> {
    (this._def as any).primaryKey = true;
    (this._def as any).notNull = true;
    return this as unknown as ColumnBuilder<TType, true>;
  }

  defaultRandom(): this {
    (this._def as any).default = { kind: 'random' };
    return this;
  }

  defaultNow(): this {
    (this._def as any).default = { kind: 'now' };
    return this;
  }

  default(value: unknown): this {
    (this._def as any).default = { kind: 'value', value };
    return this;
  }

  precision(p: number, s: number): this {
    (this._def as any).precision = p;
    (this._def as any).scale = s;
    return this;
  }
}

export const column = {
  uuid:      (name?: string) => new ColumnBuilder('uuid' as const, name),
  text:      (name?: string) => new ColumnBuilder('text' as const, name),
  integer:   (name?: string) => new ColumnBuilder('integer' as const, name),
  boolean:   (name?: string) => new ColumnBuilder('boolean' as const, name),
  timestamp: (name?: string) => new ColumnBuilder('timestamp' as const, name),
  json:      (name?: string) => new ColumnBuilder('json' as const, name),
  numeric:   (name?: string) => new ColumnBuilder('numeric' as const, name),
};
