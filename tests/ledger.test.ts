import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('Transaction Ledger API (requires migrated PostgreSQL)', () => {
  let accountId: string;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a zero-balance account and applies an idempotent credit/debit ledger', async () => {
    const created = await request(app)
      .post('/accounts')
      .send({ name: `Jest ${Date.now()}` })
      .expect(201);
    accountId = created.body.data.id;
    expect(created.body.data.balance).toBe('0');

    const creditBody = {
      type: 'credit',
      amount: 100,
      reference_id: `credit-${Date.now()}`,
    };
    await request(app)
      .post(`/accounts/${accountId}/transactions`)
      .send(creditBody)
      .expect(201);
    await request(app)
      .post(`/accounts/${accountId}/transactions`)
      .send(creditBody)
      .expect(409);
    await request(app)
      .post(`/accounts/${accountId}/transactions`)
      .send({ type: 'debit', amount: 101, reference_id: 'overdraw' })
      .expect(422);
    const balance = await request(app)
      .get(`/accounts/${accountId}/balance`)
      .expect(200);
    expect(balance.body.balance).toBe('100.00');

    const history = await request(app)
      .get(`/accounts/${accountId}/transactions?page=1&limit=10`)
      .expect(200);
    expect(history.body.total_records).toBe(1);
  });

  it('rejects client-supplied balances and invalid pagination', async () => {
    await request(app)
      .post('/accounts')
      .send({ name: 'Invalid', balance: 10 })
      .expect(400);
    await request(app)
      .get(`/accounts/${accountId}/transactions?page=0`)
      .expect(400);
  });
});
