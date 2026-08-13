import { prisma } from '../../lib/prisma';
import type { UpdateSettingsInput } from './settings.validation';

const SINGLETON_ID = 'default';

const FALLBACK = {
  id: SINGLETON_ID,
  legalName: 'VLOQ Technologies Private Limited',
  brandName: 'Furnix',
  country: 'India',
  defaultGstPercent: 18,
  defaultValidityDays: 30,
  estimateNumberPrefix: 'FX/EST',
};

export const settingsService = {
  /** Always returns a row. Creates the singleton on first read. */
  async get() {
    const existing = await prisma.companySetting.findUnique({
      where: { id: SINGLETON_ID },
      include: { defaultTermsTemplate: { select: { id: true, title: true, version: true } } },
    });
    if (existing) return existing;

    return prisma.companySetting.create({
      data: FALLBACK,
      include: { defaultTermsTemplate: { select: { id: true, title: true, version: true } } },
    });
  },

  async update(input: UpdateSettingsInput, actorId: string) {
    await this.get();
    return prisma.companySetting.update({
      where: { id: SINGLETON_ID },
      data: { ...input, updatedById: actorId },
      include: { defaultTermsTemplate: { select: { id: true, title: true, version: true } } },
    });
  },
};
