import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __furnixPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__furnixPrisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });

if (!env.isProduction) globalThis.__furnixPrisma = prisma;

/** Transaction client type, for services that must run inside an outer transaction. */
export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
