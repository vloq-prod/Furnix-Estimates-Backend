import { pdfService } from './pdf/pdf.service';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();

async function run() {
  const estimate = await prisma.estimate.findFirst({
    where: { id: 'c799d201-46d1-421b-9534-e42f7f59c61a' }
  });
  if (!estimate) {
    console.error('No estimate found');
    return;
  }
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user found');
    return;
  }
  try {
    const { buffer, filename } = await pdfService.renderEstimate(estimate.id, {
      id: user.id,
      role: user.role as any,
    });
    fs.writeFileSync(filename, buffer);
    console.log('PDF written to:', filename);
  } catch (err) {
    console.error('PDF generation failed:', err);
  }
  await prisma.$disconnect();
}

run();
