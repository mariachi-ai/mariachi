import { compileTable } from './compiler';
import { usersTable, tenantsTable } from '@mariachi/database';

export const users = compileTable(usersTable);
export const tenants = compileTable(tenantsTable);
