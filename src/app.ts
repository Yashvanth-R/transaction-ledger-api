import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { prisma } from './lib/prisma';
import {
  accountParams,
  createAccountBody,
  createTransactionBody,
  historyQuery,
  transferBody,
} from './lib/schemas';
import { errorHandler, HttpError } from './middleware/errors';
import { createTransaction, transfer } from './services/ledger';

const swaggerDocument = JSON.parse(
  readFileSync(path.join(process.cwd(), 'docs', 'swagger.json'), 'utf8'),
);

const app = express();
app.use(express.json({ limit: '32kb' }));
app.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };

app.post(
  '/accounts',
  asyncRoute(async (req, res) => {
    const parsed = createAccountBody.safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues.map((i) => i.message).join('; '),
        'VALIDATION_ERROR',
      );
    const account = await prisma.account.create({
      data: { name: parsed.data.name, balance: 0 },
    });
    res.status(201).json({ data: account });
  }),
);

app.get(
  '/accounts/:id',
  asyncRoute(async (req, res) => {
    const parsed = accountParams.safeParse(req.params);
    if (!parsed.success)
      throw new HttpError(400, 'Account ID must be a UUID', 'VALIDATION_ERROR');
    const account = await prisma.account.findUnique({
      where: { id: parsed.data.id },
    });
    if (!account)
      throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
    res.json({ data: account });
  }),
);

app.get(
  '/accounts/:id/balance',
  asyncRoute(async (req, res) => {
    const parsed = accountParams.safeParse(req.params);
    if (!parsed.success)
      throw new HttpError(400, 'Account ID must be a UUID', 'VALIDATION_ERROR');
    const account = await prisma.account.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, balance: true },
    });
    if (!account)
      throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
    res.json({ account_id: account.id, balance: account.balance.toFixed(2) });
  }),
);

app.post(
  '/accounts/:id/transactions',
  asyncRoute(async (req, res) => {
    const params = accountParams.safeParse(req.params);
    const body = createTransactionBody.safeParse(req.body);
    if (!params.success)
      throw new HttpError(400, 'Account ID must be a UUID', 'VALIDATION_ERROR');
    if (!body.success)
      throw new HttpError(
        400,
        body.error.issues.map((i) => i.message).join('; '),
        'VALIDATION_ERROR',
      );
    const result = await createTransaction(params.data.id, body.data);
    res.status(201).json({ data: result.transaction, balance: result.balance });
  }),
);

app.get(
  '/accounts/:id/transactions',
  asyncRoute(async (req, res) => {
    const params = accountParams.safeParse(req.params);
    const query = historyQuery.safeParse(req.query);
    if (!params.success || !query.success)
      throw new HttpError(
        400,
        'Invalid account ID or pagination/filter parameters',
        'VALIDATION_ERROR',
      );
    const id = params.data.id;
    const { type, page, limit } = query.data;
    const account = await prisma.account.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!account)
      throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
    const where = { account_id: id, ...(type ? { type } : {}) };
    const [totalRecords, data] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    res.json({
      current_page: page,
      page_size: limit,
      total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit),
      data,
    });
  }),
);

app.post(
  '/transfers',
  asyncRoute(async (req, res) => {
    const parsed = transferBody.safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues.map((i) => i.message).join('; '),
        'VALIDATION_ERROR',
      );
    res.status(201).json({ data: await transfer(parsed.data) });
  }),
);

app.use((_req, _res, next) =>
  next(new HttpError(404, 'Route not found', 'ROUTE_NOT_FOUND')),
);
app.use(errorHandler);
export default app;
