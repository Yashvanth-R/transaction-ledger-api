import 'dotenv/config';
import app from './app';
import { prisma } from './lib/prisma';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () =>
  console.log(`Transaction Ledger API listening on port ${port}`),
);

async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
