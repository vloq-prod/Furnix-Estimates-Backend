import { type Prisma } from '@prisma/client';
import {
  type AdjustmentInput,
  type ModulePriceInput,
  Permission,
  type PricingResult,
  type UserPricingInput,
  type UserRole,
  calculateEstimate,
  can,
  canTransition,
  isEditable,
  toDecimalString,
} from '@furnix/shared';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { type TxClient, prisma } from '../../lib/prisma';
import { formatEstimateNumber, getFiscalYear } from '../../utils/fiscalYear';
import { resolvePagination } from '../../utils/pagination';
import { sanitizeRichText } from '../../utils/sanitize';
import { ESTIMATE_INCLUDE, type EstimateWithRelations } from './estimate.serializer';
import type {
  CreateEstimateInput,
  ListEstimatesQuery,
  PreviewPricingInput,
  UpdateEstimateInput,
} from './estimate.validation';

interface Actor {
  id: string;
  role: UserRole;
}

export const estimateService = {
  // ── Read ────────────────────────────────────────────────────────────────

  async list(query: ListEstimatesQuery) {
    const limit = query.limit ?? query.pageSize;
    const { page, pageSize, skip, take } = resolvePagination(query.page, limit);

    const where: Prisma.EstimateWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: { in: query.status } } : {}),
      ...(query.hostingModel ? { hostingModel: query.hostingModel } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
          estimateDate: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
        : {}),
      ...(query.search
        ? {
          OR: [
            { estimateNumber: { contains: query.search, mode: 'insensitive' } },
            { clientCompanyName: { contains: query.search, mode: 'insensitive' } },
            { contactPerson: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { mobile: { contains: query.search } },
          ],
        }
        : {}),
    };

    let items: any[] = [];
    let total = 0;

    if (query.search) {
      // Fetch all matching records to rank them properly in memory
      const allItems = await prisma.estimate.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true, email: true } } },
      });

      const searchTerm = query.search.trim().toLowerCase();
      const rankedItems = allItems.sort((a, b) => {
        const getScore = (item: any) => {
          const estNum = (item.estimateNumber || '').toLowerCase();
          const client = (item.clientCompanyName || '').toLowerCase();
          const contact = (item.contactPerson || '').toLowerCase();
          const email = (item.email || '').toLowerCase();
          const mobile = (item.mobile || '').toLowerCase();

          // Score 0: exact match
          if (estNum === searchTerm || client === searchTerm || contact === searchTerm || email === searchTerm) {
            return 0;
          }

          // Score 1: prefix match (starts with)
          if (
            estNum.startsWith(searchTerm) ||
            client.startsWith(searchTerm) ||
            contact.startsWith(searchTerm) ||
            email.startsWith(searchTerm)
          ) {
            return 1;
          }

          // Score 2: contains match
          if (
            estNum.includes(searchTerm) ||
            client.includes(searchTerm) ||
            contact.includes(searchTerm) ||
            email.includes(searchTerm) ||
            mobile.includes(searchTerm)
          ) {
            return 2;
          }

          return 3;
        };

        const scoreA = getScore(a);
        const scoreB = getScore(b);

        if (scoreA !== scoreB) {
          return scoreA - scoreB;
        }

        // Tie-breaker: use query.sortBy and query.sortDir
        const sortBy = query.sortBy ?? 'createdAt';
        const valA = a[sortBy];
        const valB = b[sortBy];
        const isDesc = (query.sortDir ?? 'desc') === 'desc';

        if (valA === valB || valA === undefined || valB === undefined) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }

        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else {
          comparison = valA < valB ? -1 : valA > valB ? 1 : 0;
        }

        return isDesc ? -comparison : comparison;
      });

      total = rankedItems.length;
      items = rankedItems.slice(skip, skip + take);
    } else {
      [items, total] = await prisma.$transaction([
        prisma.estimate.findMany({
          where,
          skip,
          take,
          orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
          include: { createdBy: { select: { id: true, name: true, email: true } } },
        }),
        prisma.estimate.count({ where }),
      ]);
    }

    return { items, total, page, pageSize };
  },

  /** Status counts + pipeline value for the dashboard header. */
  async summary() {
    const [byStatus, totals, expiringSoon] = await prisma.$transaction([
      prisma.estimate.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { netPayableOneTime: true, monthlyRecurringPayable: true },
        orderBy: { status: 'asc' },
      }),
      prisma.estimate.aggregate({
        where: { deletedAt: null, status: { in: ['SENT', 'ACCEPTED'] } },
        _sum: { netPayableOneTime: true, monthlyRecurringPayable: true },
      }),
      prisma.estimate.count({
        where: {
          deletedAt: null,
          status: 'SENT',
          validUntil: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      byStatus: (byStatus as any[]).map((row) => ({
        status: row.status,
        count: row._count?._all ?? 0,
        oneTimeValue: row._sum?.netPayableOneTime ?? '0',
        recurringValue: row._sum?.monthlyRecurringPayable ?? '0',
      })),
      pipelineOneTime: totals._sum.netPayableOneTime ?? '0',
      pipelineMonthly: totals._sum.monthlyRecurringPayable ?? '0',
      expiringWithin7Days: expiringSoon,
    };
  },

  async getById(id: string, options: { includeDeleted?: boolean } = {}) {
    const estimate = await prisma.estimate.findFirst({
      where: { id, ...(options.includeDeleted ? {} : { deletedAt: null }) },
      include: ESTIMATE_INCLUDE,
    });
    if (!estimate) throw new NotFoundError('Estimate');
    return estimate;
  },

  async getActivity(estimateId: string) {
    await this.getById(estimateId, { includeDeleted: true });
    return prisma.estimateActivity.findMany({
      where: { estimateId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true } } },
      take: 200,
    });
  },

  async getRevisions(estimateId: string) {
    await this.getById(estimateId, { includeDeleted: true });
    return prisma.estimateRevision.findMany({
      where: { estimateId },
      orderBy: { version: 'desc' },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      take: 50,
    });
  },

  // ── Pricing ─────────────────────────────────────────────────────────────

  /** Live recalculation for the builder. Reads master prices, writes nothing. */
  async preview(input: PreviewPricingInput, actor: Actor): Promise<PricingResult> {
    const adjustment = this.assertAdjustmentAllowed(input.adjustment, actor);
    const [priceInputs, userPricing] = await Promise.all([
      this.loadModulePrices(input.modules, prisma),
      this.loadUserPricing(input, prisma),
    ]);
    return calculateEstimate({
      hostingModel: input.hostingModel,
      userCount: input.userCount,
      gstPercent: input.gstPercent,
      modules: priceInputs,
      userPricing,
      adjustment,
    });
  },

  // ── Write ───────────────────────────────────────────────────────────────

  async create(input: CreateEstimateInput, actor: Actor) {
    const adjustment = this.assertAdjustmentAllowed(input.adjustment, actor);

    return prisma.$transaction(async (tx) => {
      const settings = await this.ensureSettings(tx);
      const estimateNumber = await this.mintEstimateNumber(tx, input.estimateDate, settings.estimateNumberPrefix);
      const fiscalYear = getFiscalYear(input.estimateDate);

      const priceInputs = await this.loadModulePrices(input.modules, tx);
      const userPricing = await this.loadUserPricing(input, tx);
      const pricing = calculateEstimate({
        hostingModel: input.hostingModel,
        userCount: input.userCount,
        gstPercent: input.gstPercent,
        modules: priceInputs,
        userPricing,
        adjustment,
      });

      const estimate = await tx.estimate.create({
        data: {
          estimateNumber,
          fiscalYear,
          ...this.toScalarData(input, pricing, adjustment, actor.id),
          createdById: actor.id,
          updatedById: actor.id,
          version: 1,
          modules: { create: this.toModuleRows(pricing) },
          clauses: { create: this.toClauseRows(input.clauses) },
        },
        include: ESTIMATE_INCLUDE,
      });

      await this.recordRevision(tx, estimate, actor.id, 'Estimate created');
      await this.recordActivity(tx, estimate.id, 'CREATED', `Estimate ${estimateNumber} created`, actor.id);

      return estimate;
    });
  },

  async update(id: string, input: UpdateEstimateInput, actor: Actor) {
    const adjustment = this.assertAdjustmentAllowed(input.adjustment, actor);

    return prisma.$transaction(async (tx) => {
      const current = await tx.estimate.findFirst({
        where: { id, deletedAt: null },
        include: ESTIMATE_INCLUDE,
      });
      if (!current) throw new NotFoundError('Estimate');

      if (!isEditable(current.status)) {
        throw new ConflictError(
          `An estimate marked ${current.status.toLowerCase()} cannot be edited. Duplicate it to make changes.`,
        );
      }

      // A user without the adjustment permission must not silently wipe an
      // adjustment set by their manager, so carry the stored one forward.
      const effectiveAdjustment =
        adjustment ??
        (can(actor.role, Permission.ADJUSTMENT_MANAGE)
          ? null
          : {
            type: current.internalAdjustmentType,
            value: current.internalAdjustmentValue.toString(),
            scope: current.internalAdjustmentScope,
          });

      const priceInputs = await this.loadModulePrices(input.modules, tx);
      const userPricing = await this.loadUserPricing(input, tx);
      const pricing = calculateEstimate({
        hostingModel: input.hostingModel,
        userCount: input.userCount,
        gstPercent: input.gstPercent,
        modules: priceInputs,
        userPricing,
        adjustment: effectiveAdjustment,
      });

      // Replace children wholesale — simpler and safer than diffing, and the
      // whole thing is inside one transaction.
      await tx.estimateModule.deleteMany({ where: { estimateId: id } });
      await tx.estimateTermClause.deleteMany({ where: { estimateId: id } });

      const adjustmentChanged =
        current.internalAdjustmentType !== (effectiveAdjustment?.type ?? 'NONE') ||
        current.internalAdjustmentValue.toString() !== String(effectiveAdjustment?.value ?? 0);

      const updated = await tx.estimate.update({
        where: { id },
        data: {
          ...this.toScalarData(input, pricing, effectiveAdjustment, actor.id, current),
          updatedById: actor.id,
          version: { increment: 1 },
          modules: { create: this.toModuleRows(pricing) },
          clauses: { create: this.toClauseRows(input.clauses) },
        },
        include: ESTIMATE_INCLUDE,
      });

      await this.recordRevision(tx, updated, actor.id, 'Estimate updated');
      await this.recordActivity(
        tx,
        id,
        'UPDATED',
        `Estimate updated to version ${updated.version}`,
        actor.id,
      );
      if (adjustmentChanged) {
        await this.recordActivity(
          tx,
          id,
          'ADJUSTMENT_CHANGED',
          'Internal price adjustment changed',
          actor.id,
          {
            from: { type: current.internalAdjustmentType, value: current.internalAdjustmentValue },
            to: { type: effectiveAdjustment?.type ?? 'NONE', value: effectiveAdjustment?.value ?? 0 },
          },
        );
      }

      return updated;
    });
  },

  async updateStatus(id: string, status: EstimateStatusValue, note: string | undefined, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.estimate.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Estimate');

      if (!canTransition(current.status, status)) {
        throw new ConflictError(
          `An estimate cannot move from ${current.status.toLowerCase()} to ${status.toLowerCase()}`,
        );
      }

      const now = new Date();
      const updated = await tx.estimate.update({
        where: { id },
        data: {
          status,
          updatedById: actor.id,
          ...(status === 'SENT' && !current.sentAt ? { sentAt: now } : {}),
          ...(status === 'ACCEPTED' ? { acceptedAt: now } : {}),
          ...(status === 'REJECTED' ? { rejectedAt: now } : {}),
        },
        include: ESTIMATE_INCLUDE,
      });

      await this.recordActivity(
        tx,
        id,
        status === 'SENT' ? 'SENT' : 'STATUS_CHANGED',
        note?.trim()
          ? `Status changed to ${status.toLowerCase()} — ${note.trim()}`
          : `Status changed from ${current.status.toLowerCase()} to ${status.toLowerCase()}`,
        actor.id,
        { from: current.status, to: status },
      );

      return updated;
    });
  },

  /** Copies everything except identity, status and timestamps. */
  async duplicate(id: string, actor: Actor) {
    const source = await this.getById(id);

    return prisma.$transaction(async (tx) => {
      const settings = await this.ensureSettings(tx);
      const estimateDate = new Date();
      const estimateNumber = await this.mintEstimateNumber(tx, estimateDate, settings.estimateNumberPrefix);

      const validUntil = new Date(estimateDate);
      validUntil.setDate(validUntil.getDate() + settings.defaultValidityDays);

      const copy = await tx.estimate.create({
        data: {
          estimateNumber,
          fiscalYear: getFiscalYear(estimateDate),
          estimateDate,
          validUntil,
          clientCompanyName: source.clientCompanyName,
          contactPerson: source.contactPerson,
          email: source.email,
          mobile: source.mobile,
          billingAddress: source.billingAddress,
          gstin: source.gstin,
          hostingModel: source.hostingModel,
          userCount: source.userCount,
          gstPercent: source.gstPercent,
          status: 'DRAFT',
          // The adjustment carries over only if the actor is allowed to hold one.
          ...(can(actor.role, Permission.ADJUSTMENT_MANAGE)
            ? {
              internalAdjustmentType: source.internalAdjustmentType,
              internalAdjustmentValue: source.internalAdjustmentValue,
              internalAdjustmentScope: source.internalAdjustmentScope,
              internalAdjustmentNote: source.internalAdjustmentNote,
              internalAdjustmentById: actor.id,
              internalAdjustmentAt: new Date(),
              oneTimeAdjustment: source.oneTimeAdjustment,
              recurringAdjustment: source.recurringAdjustment,
            }
            : {}),
          oneTimeSubtotal: source.oneTimeSubtotal,
          recurringSubtotal: source.recurringSubtotal,
          taxableOneTime: source.taxableOneTime,
          taxableRecurring: source.taxableRecurring,
          gstOneTime: source.gstOneTime,
          gstRecurring: source.gstRecurring,
          netPayableOneTime: source.netPayableOneTime,
          monthlyRecurringPayable: source.monthlyRecurringPayable,
          notes: source.notes,
          termsIntro: source.termsIntro,
          pricingSnapshot: source.pricingSnapshot ?? undefined,
          duplicatedFromId: source.id,
          createdById: actor.id,
          updatedById: actor.id,
          version: 1,
          modules: {
            create: source.modules.map(({ id: _id, estimateId: _estimateId, ...line }) => line),
          },
          clauses: {
            create: source.clauses.map(({ id: _id, estimateId: _estimateId, ...clause }) => clause),
          },
        },
        include: ESTIMATE_INCLUDE,
      });

      await this.recordRevision(tx, copy, actor.id, `Duplicated from ${source.estimateNumber}`);
      await this.recordActivity(
        tx,
        copy.id,
        'DUPLICATED',
        `Created as a copy of ${source.estimateNumber}`,
        actor.id,
        { sourceId: source.id, sourceNumber: source.estimateNumber },
      );

      return copy;
    });
  },

  async softDelete(id: string, actor: Actor) {
    const current = await this.getById(id);
    if (current.status === 'ACCEPTED') {
      throw new ConflictError('An accepted estimate cannot be deleted');
    }

    return prisma.$transaction(async (tx) => {
      const deleted = await tx.estimate.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: actor.id },
      });
      await this.recordActivity(tx, id, 'DELETED', 'Estimate moved to deleted', actor.id);
      return deleted;
    });
  },

  async restore(id: string, actor: Actor) {
    const current = await this.getById(id, { includeDeleted: true });
    if (!current.deletedAt) throw new BadRequestError('This estimate is not deleted');

    return prisma.$transaction(async (tx) => {
      const restored = await tx.estimate.update({
        where: { id },
        data: { deletedAt: null, updatedById: actor.id },
        include: ESTIMATE_INCLUDE,
      });
      await this.recordActivity(tx, id, 'RESTORED', 'Estimate restored', actor.id);
      return restored;
    });
  },

  /** Sweeps sent estimates past their validity date. Safe to run on a schedule. */
  async expireOverdue() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = await prisma.estimate.findMany({
      where: { deletedAt: null, status: 'SENT', validUntil: { lt: today } },
      select: { id: true },
    });
    if (overdue.length === 0) return { expired: 0 };

    await prisma.$transaction([
      prisma.estimate.updateMany({
        where: { id: { in: overdue.map((row) => row.id) } },
        data: { status: 'EXPIRED' },
      }),
      prisma.estimateActivity.createMany({
        data: overdue.map((row) => ({
          estimateId: row.id,
          action: 'STATUS_CHANGED' as const,
          message: 'Marked expired — the valid-until date has passed',
        })),
      }),
    ]);

    return { expired: overdue.length };
  },

  // ── Internals ───────────────────────────────────────────────────────────

  /**
   * The adjustment is the one field where a validation pass is not enough:
   * an unauthorised caller must be rejected outright rather than have the field
   * quietly dropped, otherwise they would never learn their change was ignored.
   */
  assertAdjustmentAllowed(
    adjustment: CreateEstimateInput['adjustment'],
    actor: Actor,
  ): AdjustmentInput | null {
    if (!adjustment || adjustment.type === 'NONE') return null;
    if (!can(actor.role, Permission.ADJUSTMENT_MANAGE)) {
      throw new ForbiddenError('Your role does not allow changing internal pricing');
    }
    return { type: adjustment.type, value: adjustment.value, scope: adjustment.scope };
  },

  /**
   * Reads the full active catalogue and merges the per-estimate selections and
   * overrides onto it.
   *
   * Every active module comes back, not just the selected ones, because the
   * estimate document lists the whole catalogue and marks what the client took.
   * Unselected modules are priced but charge nothing, and are snapshotted onto
   * the estimate so a module added to the master next month does not
   * retroactively appear on an estimate issued today.
   */
  async loadModulePrices(
    selections: CreateEstimateInput['modules'],
    client: TxClient | typeof prisma,
  ): Promise<ModulePriceInput[]> {
    const masters = await client.module.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sequence: 'asc' }, { code: 'asc' }],
    });

    const bySelection = new Map(selections.map((selection) => [selection.moduleId, selection]));

    // A selection pointing at a module that is gone or deactivated is a stale
    // form, not a silent no-op — fail loudly rather than quote the wrong scope.
    const availableIds = new Set(masters.map((master) => master.id));
    const missing = selections
      .map((selection) => selection.moduleId)
      .filter((id) => !availableIds.has(id));

    if (missing.length > 0) {
      throw new BadRequestError('One or more selected modules are no longer available', { missing });
    }

    return masters.map((master, index) => {
      const selection = bySelection.get(master.id);
      return {
        moduleId: master.id,
        moduleCode: master.code,
        moduleName: master.name,
        moduleDescription: master.description,
        sequence: selection?.sequence ?? master.sequence ?? index,
        cloudSetupFee: master.cloudSetupFee.toString(),
        selfHostedSetupFee: master.selfHostedSetupFee.toString(),
        isSelected: Boolean(selection),
        overrideOneTimeFee: selection?.overrideOneTimeFee ?? null,
        userCount: selection?.userCount ?? 0,
      };
    });
  },

  /**
   * Platform user pricing, read from company settings and overridable per
   * estimate. Deliberately independent of the module catalogue above.
   */
  async loadUserPricing(
    // Narrowed deliberately: this reads one field, so both the create payload
    // and the lighter preview payload satisfy it without a cast.
    input: { userRateOverride?: number | null },
    client: TxClient | typeof prisma,
  ): Promise<UserPricingInput> {
    const settings = await client.companySetting.findUnique({ where: { id: 'default' } });

    return {
      monthlyPricePerUser: settings?.monthlyPricePerUser?.toString() ?? '0',
      overrideMonthlyPerUser: input.userRateOverride ?? null,
      label: settings?.userLineLabel ?? undefined,
    };
  },

  toScalarData(
    input: CreateEstimateInput,
    pricing: PricingResult,
    adjustment: AdjustmentInput | null,
    actorId: string,
    current?: EstimateWithRelations,
  ) {
    return {
      estimateDate: input.estimateDate,
      validUntil: input.validUntil,
      clientCompanyName: input.clientCompanyName,
      contactPerson: input.contactPerson,
      email: input.email,
      mobile: input.mobile,
      billingAddress: input.billingAddress,
      gstin: input.gstin || null,
      hostingModel: input.hostingModel,
      userCount: pricing.userCount,
      gstPercent: String(input.gstPercent),
      notes: input.notes ?? null,
      termsIntro: input.termsIntro ? sanitizeRichText(input.termsIntro) : null,

      internalAdjustmentType: adjustment?.type ?? 'NONE',
      internalAdjustmentValue: String(adjustment?.value ?? 0),
      internalAdjustmentScope: adjustment?.scope ?? 'ONE_TIME',
      internalAdjustmentNote: input.adjustment?.note ?? current?.internalAdjustmentNote ?? null,
      internalAdjustmentById: adjustment ? actorId : null,
      internalAdjustmentAt: adjustment ? new Date() : null,

      userLineLabel: pricing.userLine.label,
      userRateSnapshot: toDecimalString(pricing.userLine.monthlyPricePerUser),
      userRateOverride:
        input.userRateOverride === null || input.userRateOverride === undefined
          ? null
          : String(input.userRateOverride),
      appliedMonthlyPerUser: toDecimalString(pricing.userLine.appliedMonthlyPerUser),
      userLineMonthlyAmount: toDecimalString(pricing.userLine.lineMonthlyAmount),

      oneTimeSubtotal: toDecimalString(pricing.oneTimeSubtotal),
      recurringSubtotal: toDecimalString(pricing.recurringSubtotal),
      oneTimeAdjustment: toDecimalString(pricing.oneTimeAdjustment),
      recurringAdjustment: toDecimalString(pricing.recurringAdjustment),
      taxableOneTime: toDecimalString(pricing.taxableOneTime),
      taxableRecurring: toDecimalString(pricing.taxableRecurring),
      gstOneTime: toDecimalString(pricing.gstOneTime),
      gstRecurring: toDecimalString(pricing.gstRecurring),
      netPayableOneTime: toDecimalString(pricing.netPayableOneTime),
      monthlyRecurringPayable: toDecimalString(pricing.monthlyRecurringPayable),

      // The snapshot is what makes an old estimate immune to a master price change.
      pricingSnapshot: ({
        engineVersion: 1,
        calculatedAt: new Date().toISOString(),
        ...pricing,
      } as unknown) as Prisma.InputJsonValue,
    };
  },

  toModuleRows(pricing: PricingResult) {
    return pricing.lines.map((line) => ({
      moduleId: line.moduleId,
      moduleCode: line.moduleCode,
      moduleName: line.moduleName,
      moduleDescription: line.moduleDescription,
      sequence: line.sequence,
      isSelected: line.isSelected,
      cloudSetupFee: toDecimalString(line.cloudSetupFee),
      selfHostedSetupFee: toDecimalString(line.selfHostedSetupFee),
      overrideOneTimeFee: line.isOverridden ? toDecimalString(line.appliedOneTimeFee) : null,
      isOverridden: line.isOverridden,
      applicableOneTimeFee: toDecimalString(line.applicableOneTimeFee),
      appliedOneTimeFee: toDecimalString(line.appliedOneTimeFee),
      lineOneTimeAmount: toDecimalString(line.lineOneTimeAmount),
      userCount: line.userCount,
    }));
  },

  toClauseRows(clauses: CreateEstimateInput['clauses']) {
    return clauses.map((clause, index) => ({
      sourceTemplateId: clause.sourceTemplateId ?? null,
      title: clause.title,
      contentHtml: sanitizeRichText(clause.contentHtml),
      version: clause.version ?? null,
      sequence: clause.sequence ?? index,
      isCustom: clause.isCustom,
    }));
  },

  /**
   * Atomic, gapless estimate numbering. The upsert takes a row lock for the
   * fiscal year, so two simultaneous creates queue rather than collide.
   */
  async mintEstimateNumber(tx: TxClient, date: Date, prefix: string): Promise<string> {
    const fiscalYear = getFiscalYear(date);
    const sequence = await tx.estimateSequence.upsert({
      where: { fiscalYear },
      create: { fiscalYear, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return formatEstimateNumber(prefix, fiscalYear, sequence.lastNumber);
  },

  async ensureSettings(tx: TxClient) {
    const existing = await tx.companySetting.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return tx.companySetting.create({
      data: {
        id: 'default',
        legalName: 'VLOQ Technologies Private Limited',
        brandName: 'Furnix',
      },
    });
  },

  async recordRevision(
    tx: TxClient,
    estimate: EstimateWithRelations,
    actorId: string,
    changeSummary: string,
  ) {
    await tx.estimateRevision.create({
      data: {
        estimateId: estimate.id,
        version: estimate.version,
        changeSummary,
        createdById: actorId,
        snapshot: JSON.parse(JSON.stringify(estimate)) as Prisma.InputJsonValue,
      },
    });
  },

  async recordActivity(
    tx: TxClient,
    estimateId: string,
    action: ActivityActionValue,
    message: string,
    actorId?: string,
    meta?: Record<string, unknown>,
  ) {
    await tx.estimateActivity.create({
      data: {
        estimateId,
        action,
        message,
        actorId: actorId ?? null,
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  },
};

type EstimateStatusValue = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
type ActivityActionValue =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'SENT'
  | 'DUPLICATED'
  | 'PDF_GENERATED'
  | 'ADJUSTMENT_CHANGED'
  | 'DELETED'
  | 'RESTORED';
