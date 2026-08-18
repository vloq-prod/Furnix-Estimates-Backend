import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MODULES = [
  {
    code: 'PROJECT_MGMT',
    name: 'Project Management',
    description:
      'Lead to handover lifecycle — pipeline stages, site measurement, client approvals, payment milestones and AMC.',
    cloudSetupFee: '75000.00',
    selfHostedSetupFee: '125000.00',
    sequence: 1,
  },
  {
    code: 'TRACK_TRACE',
    name: 'Track & Trace',
    description:
      'Factory floor visibility — machine masters, cutlist assignment and barcode scanning at every production stage.',
    cloudSetupFee: '60000.00',
    selfHostedSetupFee: '100000.00',
    sequence: 2,
  },
  {
    code: 'QUALITY_CONTROL',
    name: 'Quality Control',
    description:
      'Stage-wise QC checkpoints, defect marking with photo evidence, rework routing and sign-off trails.',
    cloudSetupFee: '45000.00',
    selfHostedSetupFee: '80000.00',
    sequence: 3,
  },
  {
    code: 'SCAN_PACK',
    name: 'Scan & Pack',
    description:
      'Project-based packing workflows, site-wise dispatch checklists and partial or full dispatch support.',
    cloudSetupFee: '50000.00',
    selfHostedSetupFee: '85000.00',
    sequence: 4,
  },
  {
    code: 'INVENTORY_MGMT',
    name: 'Inventory Management',
    description:
      'Product master, PI/PO/GRN workflows, GST pricing, stock movement and purchase history.',
    cloudSetupFee: '65000.00',
    selfHostedSetupFee: '110000.00',
    sequence: 5,
  },
];

const TERMS = [
  {
    title: 'Payment Schedule',
    version: 'v1.0',
    sequence: 1,
    contentHtml:
      '<p>50% of the one-time setup amount is payable on acceptance of this estimate. The balance 50% is payable on go-live. Monthly recurring charges, where applicable, are invoiced in advance on the 1st of each calendar month.</p>',
  },
  {
    title: 'Taxes',
    version: 'v1.0',
    sequence: 2,
    contentHtml:
      '<p>All amounts are exclusive of GST unless stated otherwise. GST is charged at the rate prevailing on the date of invoice. Any change in statutory rates will be applied to invoices raised after the effective date of that change.</p>',
  },
  {
    title: 'Scope of Work',
    version: 'v1.0',
    sequence: 3,
    contentHtml:
      '<p>The setup fee covers configuration, master data setup, up to three rounds of remote training and thirty days of post go-live support. Custom development, third-party integrations and on-site work are quoted separately.</p>',
  },
  {
    title: 'User Licensing',
    version: 'v1.0',
    sequence: 4,
    contentHtml:
      '<p>The monthly amount is calculated on the licensed user count stated in this estimate. Additional users may be added at any time at the same per-user rate and are billed pro rata from the date of activation. Reductions take effect from the following billing cycle.</p>',
  },
  {
    title: 'Client-Owned Server Deployments',
    version: 'v1.0',
    sequence: 5,
    contentHtml:
      '<p>For client-owned server deployments, procurement, hosting, backups, uptime and operating system patching remain the client\u2019s responsibility. Furnix supplies the application, deployment assistance and version updates for twelve months from go-live.</p>',
  },
  {
    title: 'Data Ownership',
    version: 'v1.0',
    sequence: 6,
    contentHtml:
      '<p>All business data entered into the platform remains the property of the client. A full export in a machine-readable format is available on request at any time during the engagement and for sixty days after termination.</p>',
  },
  {
    title: 'Validity',
    version: 'v1.0',
    sequence: 7,
    contentHtml:
      '<p>This estimate is valid until the date stated on the first page. Pricing is subject to revision after that date.</p>',
  },
];

const USERS = [
  { name: 'Zaid Ansari', email: process.env.SEED_ADMIN_EMAIL ?? 'admin@vloq.com', role: 'SUPER_ADMIN' as const },
  { name: 'Priya Nair', email: 'priya.nair@vloq.com', role: 'SALES_MANAGER' as const },
  { name: 'Rahul Mehta', email: 'rahul.mehta@vloq.com', role: 'SALES_EXECUTIVE' as const },
  { name: 'Finance Desk', email: 'finance@vloq.com', role: 'VIEWER' as const },
];

async function main() {
  console.log('Seeding Furnix estimates…');

  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Furnix@2026';
  const passwordHash = await bcrypt.hash(password, 12);

  const users = [];
  for (const user of USERS) {
    users.push(
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name, role: user.role, isActive: true },
        create: { ...user, passwordHash },
      }),
    );
  }
  const admin = users[0]!;
  console.log(`  ${users.length} users`);

  for (const module of MODULES) {
    await prisma.module.upsert({
      where: { code: module.code },
      update: { ...module, isActive: true, deletedAt: null, updatedById: admin.id },
      create: { ...module, isActive: true, createdById: admin.id, updatedById: admin.id },
    });
  }
  console.log(`  ${MODULES.length} modules`);

  for (const clause of TERMS) {
    await prisma.termsTemplate.upsert({
      where: { title_version: { title: clause.title, version: clause.version } },
      update: { ...clause, isActive: true, isDefault: true, deletedAt: null },
      create: { ...clause, isActive: true, isDefault: true, createdById: admin.id },
    });
  }
  console.log(`  ${TERMS.length} default terms clauses`);

  await prisma.companySetting.upsert({
    where: { id: 'default' },
    update: {
      monthlyPricePerUser: '1200.00',
    },
    create: {
      id: 'default',
      legalName: 'VLOQ Technologies Private Limited',
      brandName: 'Furnix',
      gstin: '27AABCV1234A1Z5',
      addressLine1: 'Unit 402, Kanakia Wall Street',
      addressLine2: null,
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: null,
      country: 'India',
      email: 'sales@vloq.com',
      phone: '+91 22 4890 1200',
      website: 'https://furnixcrm.com',
      defaultGstPercent: '18.00',
      defaultValidityDays: 30,
      estimateNumberPrefix: 'FX/EST',
      // Platform access, charged per user per month. Independent of modules:
      // taking more modules does not change it, taking none does not remove it.
      monthlyPricePerUser: '1200.00',
      userLineLabel: 'Platform users',
      bankName: 'HDFC Bank, Andheri East',
      bankAccountNumber: '50200012345678',
      bankIfsc: 'HDFC0000123',
      updatedById: admin.id,
    },
  });
  console.log('  company settings');

  console.log(`\nDone. Sign in with ${admin.email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
