import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const search = 'Mohammad';
  const where = {
    deletedAt: null,
    OR: [
      { estimateNumber: { contains: search, mode: 'insensitive' as const } },
      { clientCompanyName: { contains: search, mode: 'insensitive' as const } },
      { contactPerson: { contains: search, mode: 'insensitive' as const } },
      { email: { contains: search, mode: 'insensitive' as const } },
      { mobile: { contains: search } },
    ],
  };
  try {
    const items = await prisma.estimate.findMany({
      where,
    });
    console.log('Query successful, found items:', items.length);
    console.log('Items:', items.map(item => ({
      estimateNumber: item.estimateNumber,
      clientCompanyName: item.clientCompanyName,
      contactPerson: item.contactPerson,
      email: item.email
    })));
  } catch (err) {
    console.error('Query failed with error:', err);
  }
  await prisma.$disconnect();
}

run();
