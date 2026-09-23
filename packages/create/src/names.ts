import { ValidationError } from '@mariachi/core';

export interface Names {
  /** `invoice-item` */
  kebab: string;
  /** `InvoiceItem` */
  pascal: string;
  /** `invoiceItem` */
  camel: string;
  /** `invoice-items` */
  pluralKebab: string;
  /** `InvoiceItems` */
  pluralPascal: string;
  /** `invoiceItems` (procedure namespace) */
  pluralCamel: string;
  /** `invoice_items` (SQL table) */
  pluralSnake: string;
}

const NAME = /^[a-zA-Z][a-zA-Z0-9]*(?:[-_ ][a-zA-Z0-9]+)*$/;

function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function names(input: string): Names {
  if (!NAME.test(input)) {
    throw new ValidationError(`Invalid name "${input}": use letters, digits and dashes, starting with a letter`, [
      { path: ['name'], message: 'Invalid name' },
    ]);
  }
  const parts = words(input);
  const plural = [...parts.slice(0, -1), pluralize(parts[parts.length - 1])];
  const pascal = (ws: string[]) => ws.map(cap).join('');
  const camel = (ws: string[]) => ws[0] + ws.slice(1).map(cap).join('');
  return {
    kebab: parts.join('-'),
    pascal: pascal(parts),
    camel: camel(parts),
    pluralKebab: plural.join('-'),
    pluralPascal: pascal(plural),
    pluralCamel: camel(plural),
    pluralSnake: plural.join('_'),
  };
}
