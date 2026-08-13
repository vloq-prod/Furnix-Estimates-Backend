-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'VIEWER');

-- CreateEnum
CREATE TYPE "HostingModel" AS ENUM ('VLOQ_CLOUD', 'CLIENT_OWNED');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('NONE', 'FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "AdjustmentScope" AS ENUM ('ONE_TIME', 'RECURRING', 'BOTH');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'SENT', 'DUPLICATED', 'PDF_GENERATED', 'ADJUSTMENT_CHANGED', 'DELETED', 'RESTORED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES_EXECUTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "cloudSetupFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "selfHostedSetupFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_templates" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "terms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" VARCHAR(200) NOT NULL,
    "brandName" VARCHAR(120) NOT NULL,
    "gstin" VARCHAR(20),
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(100) NOT NULL DEFAULT 'India',
    "email" VARCHAR(180),
    "phone" VARCHAR(30),
    "website" VARCHAR(180),
    "logoUrl" VARCHAR(400),
    "defaultGstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 30,
    "estimateNumberPrefix" VARCHAR(20) NOT NULL DEFAULT 'FX/EST',
    "monthlyPricePerUser" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "userLineLabel" VARCHAR(120) NOT NULL DEFAULT 'Platform users',
    "bankName" VARCHAR(150),
    "bankAccountNumber" VARCHAR(40),
    "bankIfsc" VARCHAR(20),
    "defaultTermsTemplateId" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_sequences" (
    "fiscalYear" VARCHAR(9) NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_sequences_pkey" PRIMARY KEY ("fiscalYear")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" UUID NOT NULL,
    "estimateNumber" VARCHAR(40) NOT NULL,
    "fiscalYear" VARCHAR(9) NOT NULL,
    "estimateDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "clientCompanyName" VARCHAR(200) NOT NULL,
    "contactPerson" VARCHAR(150) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "mobile" VARCHAR(20) NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "gstin" VARCHAR(20),
    "hostingModel" "HostingModel" NOT NULL DEFAULT 'VLOQ_CLOUD',
    "userCount" INTEGER NOT NULL DEFAULT 1,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "userLineLabel" VARCHAR(120) NOT NULL DEFAULT 'Platform users',
    "userRateSnapshot" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "userRateOverride" DECIMAL(14,2),
    "appliedMonthlyPerUser" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "userLineMonthlyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "internalAdjustmentType" "AdjustmentType" NOT NULL DEFAULT 'NONE',
    "internalAdjustmentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "internalAdjustmentScope" "AdjustmentScope" NOT NULL DEFAULT 'ONE_TIME',
    "internalAdjustmentNote" TEXT,
    "internalAdjustmentById" UUID,
    "internalAdjustmentAt" TIMESTAMP(3),
    "oneTimeSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recurringSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "oneTimeAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recurringAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableOneTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableRecurring" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstOneTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstRecurring" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayableOneTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthlyRecurringPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "termsIntro" TEXT,
    "pricingSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "duplicatedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_modules" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "moduleId" UUID,
    "moduleCode" VARCHAR(60) NOT NULL,
    "moduleName" VARCHAR(150) NOT NULL,
    "moduleDescription" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "cloudSetupFee" DECIMAL(14,2) NOT NULL,
    "selfHostedSetupFee" DECIMAL(14,2) NOT NULL,
    "overrideOneTimeFee" DECIMAL(14,2),
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "applicableOneTimeFee" DECIMAL(14,2) NOT NULL,
    "appliedOneTimeFee" DECIMAL(14,2) NOT NULL,
    "lineOneTimeAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estimate_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_term_clauses" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "sourceTemplateId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "version" VARCHAR(30),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "estimate_term_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_revisions" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_activities" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "message" VARCHAR(400) NOT NULL,
    "meta" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "modules_isActive_deletedAt_sequence_idx" ON "modules"("isActive", "deletedAt", "sequence");

-- CreateIndex
CREATE INDEX "modules_deletedAt_idx" ON "modules"("deletedAt");

-- CreateIndex
CREATE INDEX "terms_templates_isActive_isDefault_deletedAt_idx" ON "terms_templates"("isActive", "isDefault", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "terms_templates_title_version_key" ON "terms_templates"("title", "version");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimateNumber_key" ON "estimates"("estimateNumber");

-- CreateIndex
CREATE INDEX "estimates_status_deletedAt_idx" ON "estimates"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "estimates_clientCompanyName_idx" ON "estimates"("clientCompanyName");

-- CreateIndex
CREATE INDEX "estimates_estimateDate_idx" ON "estimates"("estimateDate" DESC);

-- CreateIndex
CREATE INDEX "estimates_validUntil_idx" ON "estimates"("validUntil");

-- CreateIndex
CREATE INDEX "estimates_createdById_idx" ON "estimates"("createdById");

-- CreateIndex
CREATE INDEX "estimates_deletedAt_createdAt_idx" ON "estimates"("deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "estimate_modules_estimateId_isSelected_sequence_idx" ON "estimate_modules"("estimateId", "isSelected", "sequence");

-- CreateIndex
CREATE INDEX "estimate_modules_estimateId_sequence_idx" ON "estimate_modules"("estimateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_modules_estimateId_moduleCode_key" ON "estimate_modules"("estimateId", "moduleCode");

-- CreateIndex
CREATE INDEX "estimate_term_clauses_estimateId_sequence_idx" ON "estimate_term_clauses"("estimateId", "sequence");

-- CreateIndex
CREATE INDEX "estimate_revisions_estimateId_createdAt_idx" ON "estimate_revisions"("estimateId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_revisions_estimateId_version_key" ON "estimate_revisions"("estimateId", "version");

-- CreateIndex
CREATE INDEX "estimate_activities_estimateId_createdAt_idx" ON "estimate_activities"("estimateId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_templates" ADD CONSTRAINT "terms_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_defaultTermsTemplateId_fkey" FOREIGN KEY ("defaultTermsTemplateId") REFERENCES "terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_modules" ADD CONSTRAINT "estimate_modules_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_modules" ADD CONSTRAINT "estimate_modules_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_term_clauses" ADD CONSTRAINT "estimate_term_clauses_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_revisions" ADD CONSTRAINT "estimate_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_revisions" ADD CONSTRAINT "estimate_revisions_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_activities" ADD CONSTRAINT "estimate_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_activities" ADD CONSTRAINT "estimate_activities_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
