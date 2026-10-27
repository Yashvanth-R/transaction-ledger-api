import { Prisma, Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errors';

const money = (amount: number) => new Prisma.Decimal(amount.toFixed(2));

export async function createTransaction(
  accountId: string,
  input: {
    type: 'credit' | 'debit';
    amount: number;
    description: string;
    reference_id: string;
  },
): Promise<{ transaction: Transaction; balance: string }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; balance: Prisma.Decimal }>
    >`SELECT id, balance FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
    const account = rows[0];
    if (!account)
      throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
    const amount = money(input.amount);
    const current = new Prisma.Decimal(account.balance);
    if (input.type === 'debit' && current.lessThan(amount))
      throw new HttpError(422, 'Insufficient balance', 'INSUFFICIENT_BALANCE');
    const balance =
      input.type === 'credit' ? current.plus(amount) : current.minus(amount);
    await tx.account.update({ where: { id: accountId }, data: { balance } });
    const transaction = await tx.transaction.create({
      data: { account_id: accountId, ...input, amount },
    });
    return { transaction, balance: balance.toFixed(2) };
  });
}

export async function transfer(input: {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  description: string;
  reference_id: string;
}) {
  return prisma.$transaction(async (tx) => {
    const ids = [input.source_account_id, input.destination_account_id].sort();
    const rows = await tx.$queryRaw<
      Array<{ id: string; name: string; balance: Prisma.Decimal }>
    >`SELECT id, name, balance FROM accounts WHERE id IN (${ids[0]}::uuid, ${ids[1]}::uuid) ORDER BY id FOR UPDATE`;
    if (rows.length !== 2)
      throw new HttpError(
        404,
        'One or both accounts were not found',
        'ACCOUNT_NOT_FOUND',
      );
    const source = rows.find((row) => row.id === input.source_account_id)!;
    const destination = rows.find(
      (row) => row.id === input.destination_account_id,
    )!;
    const amount = money(input.amount);
    const sourceBalance = new Prisma.Decimal(source.balance);
    const destinationBalance = new Prisma.Decimal(destination.balance);
    if (sourceBalance.lessThan(amount))
      throw new HttpError(422, 'Insufficient balance', 'INSUFFICIENT_BALANCE');
    const debitRef = `TRF-OUT-${input.reference_id}`;
    const creditRef = `TRF-IN-${input.reference_id}`;
    await tx.account.update({
      where: { id: source.id },
      data: { balance: sourceBalance.minus(amount) },
    });
    await tx.account.update({
      where: { id: destination.id },
      data: { balance: destinationBalance.plus(amount) },
    });
    const [debit, credit] = await Promise.all([
      tx.transaction.create({
        data: {
          account_id: source.id,
          type: 'debit',
          amount,
          reference_id: debitRef,
          description: input.description || `Transfer to ${destination.name}`,
        },
      }),
      tx.transaction.create({
        data: {
          account_id: destination.id,
          type: 'credit',
          amount,
          reference_id: creditRef,
          description: input.description || `Transfer from ${source.name}`,
        },
      }),
    ]);
    return {
      reference_id: input.reference_id,
      amount: amount.toFixed(2),
      source_balance: sourceBalance.minus(amount).toFixed(2),
      destination_balance: destinationBalance.plus(amount).toFixed(2),
      transactions: [debit, credit],
    };
  });
}
