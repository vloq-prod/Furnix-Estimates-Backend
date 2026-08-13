import type { Request, Response } from 'express';
import { buildMeta, created, noContent, ok } from '../../utils/apiResponse';
import { pdfService } from '../../pdf/pdf.service';
import { estimateService } from './estimate.service';
import { serializeEstimate, serializeEstimateListRow } from './estimate.serializer';
import type { ListEstimatesQuery } from './estimate.validation';

function actorOf(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

export const estimateController = {
  async list(req: Request, res: Response) {
    const query = req.query as unknown as ListEstimatesQuery;
    const { items, total, page, pageSize } = await estimateService.list(query);
    return ok(
      res,
      items.map((item) => serializeEstimateListRow(item, req.user!.role)),
      'Estimates loaded',
      buildMeta(page, pageSize, total),
    );
  },

  async summary(_req: Request, res: Response) {
    return ok(res, await estimateService.summary(), 'Summary loaded');
  },

  async detail(req: Request, res: Response) {
    const estimate = await estimateService.getById(req.params.id!, { includeDeleted: true });
    return ok(res, serializeEstimate(estimate, { role: req.user!.role }), 'Estimate loaded');
  },

  /** Client-facing shape. Internal pricing is stripped regardless of role. */
  async preview(req: Request, res: Response) {
    const estimate = await estimateService.getById(req.params.id!);
    return ok(
      res,
      serializeEstimate(estimate, { role: req.user!.role, clientFacing: true }),
      'Preview loaded',
    );
  },

  async activity(req: Request, res: Response) {
    return ok(res, await estimateService.getActivity(req.params.id!), 'Activity loaded');
  },

  async revisions(req: Request, res: Response) {
    return ok(res, await estimateService.getRevisions(req.params.id!), 'Revisions loaded');
  },

  async calculate(req: Request, res: Response) {
    const pricing = await estimateService.preview(req.body, actorOf(req));
    return ok(res, pricing, 'Pricing calculated');
  },

  async create(req: Request, res: Response) {
    const estimate = await estimateService.create(req.body, actorOf(req));
    return created(
      res,
      serializeEstimate(estimate, { role: req.user!.role }),
      `${estimate.estimateNumber} saved as draft`,
    );
  },

  async update(req: Request, res: Response) {
    const estimate = await estimateService.update(req.params.id!, req.body, actorOf(req));
    return ok(
      res,
      serializeEstimate(estimate, { role: req.user!.role }),
      `${estimate.estimateNumber} updated`,
    );
  },

  async updateStatus(req: Request, res: Response) {
    const estimate = await estimateService.updateStatus(
      req.params.id!,
      req.body.status,
      req.body.note,
      actorOf(req),
    );
    return ok(
      res,
      serializeEstimate(estimate, { role: req.user!.role }),
      `${estimate.estimateNumber} marked ${String(req.body.status).toLowerCase()}`,
    );
  },

  async duplicate(req: Request, res: Response) {
    const estimate = await estimateService.duplicate(req.params.id!, actorOf(req));
    return created(
      res,
      serializeEstimate(estimate, { role: req.user!.role }),
      `Copied to ${estimate.estimateNumber}`,
    );
  },

  async remove(req: Request, res: Response) {
    const estimate = await estimateService.softDelete(req.params.id!, actorOf(req));
    return noContent(res, `${estimate.estimateNumber} deleted`);
  },

  async restore(req: Request, res: Response) {
    const estimate = await estimateService.restore(req.params.id!, actorOf(req));
    return ok(res, serializeEstimate(estimate, { role: req.user!.role }), 'Estimate restored');
  },

  async downloadPdf(req: Request, res: Response) {
    const { buffer, filename } = await pdfService.renderEstimate(req.params.id!, actorOf(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.inline === 'true' ? 'inline' : 'attachment'}; filename="${filename}"`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  },

  async expireOverdue(_req: Request, res: Response) {
    return ok(res, await estimateService.expireOverdue(), 'Expiry sweep complete');
  },
};
