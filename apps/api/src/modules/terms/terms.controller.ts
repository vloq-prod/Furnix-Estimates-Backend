import type { Request, Response } from 'express';
import { buildMeta, created, noContent, ok } from '../../utils/apiResponse';
import { termsService } from './terms.service';
import type { ListTermsQuery } from './terms.validation';

export const termsController = {
  async list(req: Request, res: Response) {
    const query = req.query as unknown as ListTermsQuery;
    const { items, total, page, pageSize } = await termsService.list(query);
    return ok(res, items, 'Terms loaded', buildMeta(page, pageSize, total));
  },

  async defaults(_req: Request, res: Response) {
    return ok(res, await termsService.listDefaults(), 'Default terms loaded');
  },

  async active(_req: Request, res: Response) {
    return ok(res, await termsService.listActive(), 'Terms loaded');
  },

  async detail(req: Request, res: Response) {
    return ok(res, await termsService.getById(req.params.id!), 'Terms loaded');
  },

  async create(req: Request, res: Response) {
    const record = await termsService.create(req.body, req.user!.id);
    return created(res, record, `${record.title} added`);
  },

  async update(req: Request, res: Response) {
    const record = await termsService.update(req.params.id!, req.body, req.user!.id);
    return ok(res, record, `${record.title} updated`);
  },

  async remove(req: Request, res: Response) {
    const record = await termsService.softDelete(req.params.id!, req.user!.id);
    return noContent(res, `${record.title} removed`);
  },
};
