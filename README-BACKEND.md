# Furnix Estimates — Backend

Node 20 · Express 4 · TypeScript · Prisma 5 · Zod · Puppeteer

Database schema and seed ship separately in the **prisma** bundle. Drop that
bundle's `prisma/` folder into `apps/api/` before running anything.

## What's inside

```
apps/api/src/
├── app.ts · server.ts · routes/index.ts
├── config/env.ts              fail-fast env parsing
├── lib/                       prisma client · error classes
├── middleware/                authenticate · authorize · validate · errorHandler
├── modules/
│   ├── auth/                  login · refresh · me
│   ├── module-master/         controller · service · validation · routes
│   ├── terms/                 same four-file shape
│   ├── settings/
│   └── estimates/             + estimate.serializer.ts (RBAC field redaction)
├── pdf/                       pdf.service (Puppeteer) · estimate.template
└── utils/                     apiResponse · asyncHandler · pagination
                               fiscalYear · sanitize

packages/shared/               pricing engine — see the note below
docs/API.md                    endpoints, envelope, sample payloads
```

## Run

```bash
pnpm install
pnpm --filter @furnix/shared build
cp apps/api/.env.example apps/api/.env    # set DATABASE_URL + both JWT secrets
# ...place the prisma/ folder, then generate + migrate + seed (see that bundle)
pnpm --filter @furnix/api dev             # http://localhost:4000
```

Generate secrets with `openssl rand -base64 48`.

On slim images, skip Puppeteer's ~150 MB Chromium download and point at the
system browser instead:

```bash
PUPPETEER_SKIP_DOWNLOAD=true pnpm install
# apps/api/.env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## The shared package

`packages/shared` also ships in the frontend bundle — the same code in both, so
the browser and the server compute totals with one implementation rather than two
that drift. **Keep the copies identical**, and collapse them to a single
`packages/shared` once both bundles live in one repo.

## Three things to know before changing anything

**The serializer is the security boundary.** `estimate.serializer.ts` strips the
internal adjustment fields from every response unless the caller holds
`estimate:adjustment:view`, and always strips them from preview and PDF output.
It also strips the un-adjusted subtotals and line-level list prices — publishing
those next to the adjusted taxable amount would leak the adjustment by
subtraction. Add a new field to the Estimate model and you must decide which side
of that line it sits on.

**The two payables are never summed.** `netPayableOneTime` and
`monthlyRecurringPayable` are separate columns, separately taxed, separately
rendered. `firstYearIndicativeValue` exists for pipeline reporting only and is
labelled as indicative wherever it appears.

**Estimate numbers are minted inside the creation transaction** from a
per-fiscal-year counter row, so concurrent requests cannot collide. Don't move
that logic outside the transaction.

## Operational

`POST /estimates/maintenance/expire-overdue` flips `SENT` estimates past their
`validUntil` to `EXPIRED`. Run it daily from cron.

Rich text from the terms editor is sanitised on the way in (`utils/sanitize.ts`),
not on the way out.
