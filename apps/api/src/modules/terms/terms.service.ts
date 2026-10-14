import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { resolvePagination } from '../../utils/pagination';
import { sanitizeRichText } from '../../utils/sanitize';
import type { CreateTermsInput, ListTermsQuery, UpdateTermsInput } from './terms.validation';

export const termsService = {
  async list(query: ListTermsQuery) {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);

    const where: Prisma.TermsTemplateWhereInput = {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.termsTemplate.findMany({
        where,
        skip,
        take,
        orderBy: [{ sequence: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.termsTemplate.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },

  /** The clause set loaded by the "Load default terms" action in the builder. */
  async listDefaults() {
    return prisma.termsTemplate.findMany({
      where: { deletedAt: null, isActive: true, isDefault: true },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async listActive() {
    return prisma.termsTemplate.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sequence: 'asc' }, { title: 'asc' }],
    });
  },

  async getById(id: string) {
    const found = await prisma.termsTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundError('Terms template');
    return found;
  },

  async create(input: CreateTermsInput, actorId: string) {
    return prisma.termsTemplate.create({
      data: {
        ...input,
        contentHtml: sanitizeRichText(input.contentHtml),
        createdById: actorId,
        updatedById: actorId,
      },
    });
  },

  async update(id: string, input: UpdateTermsInput, actorId: string) {
    await this.getById(id);
    return prisma.$transaction(async (tx) => {
      const updatedTemplate = await tx.termsTemplate.update({
        where: { id },
        data: {
          ...input,
          ...(input.contentHtml ? { contentHtml: sanitizeRichText(input.contentHtml) } : {}),
          updatedById: actorId,
        },
      });

      // Update estimate clauses derived from this template that are NOT customized
      await tx.estimateTermClause.updateMany({
        where: {
          sourceTemplateId: id,
          isCustom: false,
        },
        data: {
          title: updatedTemplate.title,
          contentHtml: updatedTemplate.contentHtml,
          version: updatedTemplate.version,
        },
      });

      return updatedTemplate;
    });
  },

  async softDelete(id: string, actorId: string) {
    await this.getById(id);
    return prisma.termsTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false, updatedById: actorId },
    });
  },
};
