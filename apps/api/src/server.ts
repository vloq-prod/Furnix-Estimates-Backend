import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { pdfService } from './pdf/pdf.service';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Furnix Estimates API listening on http://localhost:${env.PORT}/api/v1`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down.`);
  server.close();
  await Promise.allSettled([pdfService.shutdown(), prisma.$disconnect()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
