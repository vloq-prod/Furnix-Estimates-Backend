import type { Request, Response } from 'express';
import { buildMeta, created, noContent, ok } from '../../utils/apiResponse';
import { moduleService } from './module.service';
import type { ListModulesQuery } from './module.validation';

export const moduleController = {
  async list(req: Request, res: Response) {
    const query = req.query as unknown as ListModulesQuery;
    const { items, total, page, pageSize } = await moduleService.list(query);
    return ok(res, items, 'Modules loaded', buildMeta(page, pageSize, total));
  },

  async selectable(_req: Request, res: Response) {
    return ok(res, await moduleService.listSelectable(), 'Modules loaded');
  },

  async detail(req: Request, res: Response) {
    return ok(res, await moduleService.getById(req.params.id!), 'Module loaded');
  },

  async create(req: Request, res: Response) {
    const record = await moduleService.create(req.body, req.user!.id);
    return created(res, record, `${record.name} added to the Module Master`);
  },

  async update(req: Request, res: Response) {
    const record = await moduleService.update(req.params.id!, req.body, req.user!.id);
    return ok(res, record, `${record.name} updated`);
  },

  async remove(req: Request, res: Response) {
    const record = await moduleService.softDelete(req.params.id!, req.user!.id);
    return noContent(res, `${record.name} removed`);
  },

  async restore(req: Request, res: Response) {
    const record = await moduleService.restore(req.params.id!, req.user!.id);
    return ok(res, record, `${record.name} restored`);
  },

  async reorder(req: Request, res: Response) {
    const records = await moduleService.reorder(req.body.order, req.user!.id);
    return ok(res, records, 'Display order saved');
  },
};
