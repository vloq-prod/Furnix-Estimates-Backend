import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { resolvePagination } from '../../utils/pagination';
import type {
  CreateModuleInput,
  ListModulesQuery,
  UpdateModuleInput,
} from './module.validation';

const AUDIT_SELECT = { id: true, name: true, email: true } as const;

export const moduleService = {
  async list(query: ListModulesQuery) {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);

    const where: Prisma.ModuleWhereInput = {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.module.findMany({
        where,
        skip,
        take,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        include: { createdBy: { select: AUDIT_SELECT }, updatedBy: { select: AUDIT_SELECT } },
      }),
      prisma.module.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },

  /** Active modules only, for the estimate builder picker. */
  async listSelectable() {
    return prisma.module.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        cloudSetupFee: true,
        selfHostedSetupFee: true,
        sequence: true,
      },
    });
  },

  async getById(id: string) {
    const found = await prisma.module.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: { select: AUDIT_SELECT }, updatedBy: { select: AUDIT_SELECT } },
    });
    if (!found) throw new NotFoundError('Module');
    return found;
  },

  async create(input: CreateModuleInput, actorId: string) {
    const existing = await prisma.module.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new ConflictError(
        existing.deletedAt
          ? `Module code ${input.code} belongs to a deleted module. Restore it instead.`
          : `Module code ${input.code} is already in use`,
      );
    }

    return prisma.module.create({
      data: {
        ...input,
        description: input.description ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  },

  async update(id: string, input: UpdateModuleInput, actorId: string) {
    await this.getById(id);
    return prisma.module.update({
      where: { id },
      data: { ...input, updatedById: actorId },
    });
  },

  /**
   * Soft delete. Existing estimates keep their own snapshot of this module's
   * prices, so removing it here never rewrites history.
   */
  async softDelete(id: string, actorId: string) {
    await this.getById(id);
    return prisma.module.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedById: actorId },
    });
  },

  async restore(id: string, actorId: string) {
    const found = await prisma.module.findUnique({ where: { id } });
    if (!found) throw new NotFoundError('Module');
    return prisma.module.update({
      where: { id },
      data: { deletedAt: null, isActive: true, updatedById: actorId },
    });
  },

  async reorder(order: { id: string; sequence: number }[], actorId: string) {
    await prisma.$transaction(
      order.map((entry) =>
        prisma.module.update({
          where: { id: entry.id },
          data: { sequence: entry.sequence, updatedById: actorId },
        }),
      ),
    );
    return this.listSelectable();
  },
};