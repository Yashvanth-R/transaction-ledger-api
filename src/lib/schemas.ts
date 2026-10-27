import { z } from 'zod';

export const accountParams = z.object({
  id: z.string().uuid('Account ID must be a UUID'),
});
export const createAccountBody = z
  .object({
    name: z.string().trim().min(1, 'Account name is required').max(100),
  })
  .strict();
export const createTransactionBody = z
  .object({
    type: z.enum(['credit', 'debit']),
    amount: z
      .number()
      .finite()
      .positive()
      .refine(
        (n) => Math.round(n * 100) / 100 === n,
        'Amount may have at most 2 decimal places',
      ),
    description: z.string().trim().max(500).optional().default(''),
    reference_id: z.string().trim().min(1).max(150),
  })
  .strict();
export const historyQuery = z
  .object({
    type: z.enum(['credit', 'debit']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
export const transferBody = z
  .object({
    source_account_id: z.string().uuid(),
    destination_account_id: z.string().uuid(),
    amount: z
      .number()
      .finite()
      .positive()
      .refine(
        (n) => Math.round(n * 100) / 100 === n,
        'Amount may have at most 2 decimal places',
      ),
    description: z.string().trim().max(500).optional().default(''),
    reference_id: z.string().trim().min(1).max(150),
  })
  .strict()
  .refine((v) => v.source_account_id !== v.destination_account_id, {
    path: ['destination_account_id'],
    message: 'Accounts must be different',
  });
