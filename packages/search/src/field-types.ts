import { SearchError } from '@mariachi/core';

type TypesenseScalar = 'string' | 'int32' | 'int64' | 'float' | 'bool';
type TypesenseType = TypesenseScalar | `${TypesenseScalar}[]`;

const TYPE_MAP: Record<string, TypesenseScalar> = {
  string: 'string',
  number: 'float',
  int: 'int32',
  int32: 'int32',
  int64: 'int64',
  float: 'float',
  bool: 'bool',
  boolean: 'bool',
};

/** Maps a framework field type (or a Typesense type read back from the server) to a Typesense type. */
export function mapFieldType(type: string): TypesenseType {
  const isArray = type.endsWith('[]');
  const mapped = TYPE_MAP[(isArray ? type.slice(0, -2) : type).toLowerCase()];
  if (!mapped) throw new SearchError('search/invalid-field-type', `Unsupported search field type "${type}"`);
  return isArray ? `${mapped}[]` : mapped;
}

export function isText(type: string): boolean {
  const mapped = mapFieldType(type);
  return mapped === 'string' || mapped === 'string[]';
}

