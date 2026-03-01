import type { BillingAdapter, CreditBalance } from '../types';

export class CreditService {
  constructor(private adapter: BillingAdapter) {}

  async getBalance(customerId: string): Promise<CreditBalance> {
    return this.adapter.getCredits(customerId);
  }

  async addCredits(
    customerId: string,
    amount: number,
    currency: string
  ): Promise<CreditBalance> {
    return this.adapter.addCredits(customerId, amount, currency);
  }
}
