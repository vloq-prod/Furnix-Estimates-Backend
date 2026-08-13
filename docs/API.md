# API reference

Base URL: `http://localhost:4000/api/v1`
All endpoints except `/auth/*` and `/health` require `Authorization: Bearer <accessToken>`.

## Response envelope

Every endpoint answers with the same shape, so the client has one thing to unwrap.

```json
{
  "success": true,
  "data": {},
  "message": "OK",
  "meta": { "page": 1, "pageSize": 20, "total": 43, "totalPages": 3, "hasNext": true, "hasPrevious": false },
  "timestamp": "2026-07-28T09:14:22.104Z"
}
```

Failures keep the envelope and add `error`:

```json
{
  "success": false,
  "data": null,
  "message": "Some fields need attention",
  "error": {
    "code": "VALIDATION_FAILED",
    "details": [
      { "field": "userCount", "message": "Cloud hosting needs at least one user" },
      { "field": "gstin", "message": "Enter a valid 15-character GSTIN" }
    ]
  },
  "timestamp": "2026-07-28T09:14:22.104Z"
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Zod rejected the body or query |
| `UNAUTHENTICATED` | 401 | Missing, expired or malformed token |
| `FORBIDDEN` | 403 | Authenticated, but the role lacks the permission |
| `NOT_FOUND` | 404 | No such record, or it is soft-deleted |
| `DUPLICATE_RECORD` | 409 | Unique constraint (module code, estimate number) |
| `CONFLICT` | 409 | Illegal state transition, e.g. editing an `ACCEPTED` estimate |
| `INTERNAL_ERROR` | 500 | Unhandled — details only outside production |

Money crosses the wire as a fixed-2-decimal **string** (`"125000.00"`), never a float.

---

## Endpoints

### Auth
| Method | Path | Permission |
|---|---|---|
| POST | `/auth/login` | — |
| POST | `/auth/refresh` | — |
| GET | `/auth/me` | authenticated |

### Modules — Module Master
| Method | Path | Permission |
|---|---|---|
| GET | `/modules` | `module:view` |
| GET | `/modules/:id` | `module:view` |
| POST | `/modules` | `module:manage` |
| PUT | `/modules/:id` | `module:manage` |
| PATCH | `/modules/:id/status` | `module:manage` |
| PATCH | `/modules/reorder` | `module:manage` |
| DELETE | `/modules/:id` | `module:manage` |

### Terms
| Method | Path | Permission |
|---|---|---|
| GET | `/terms` · `/terms/defaults` | `terms:view` |
| POST · PUT · DELETE | `/terms` · `/terms/:id` | `terms:manage` |

### Settings
| Method | Path | Permission |
|---|---|---|
| GET | `/settings` | `settings:view` |
| PUT | `/settings` | `settings:manage` |

### Estimates
| Method | Path | Permission |
|---|---|---|
| GET | `/estimates` | `estimate:view` |
| GET | `/estimates/summary` | `estimate:view` |
| GET | `/estimates/:id` | `estimate:view` |
| GET | `/estimates/:id/preview` | `estimate:view` |
| GET | `/estimates/:id/activity` | `estimate:view` |
| GET | `/estimates/:id/revisions` | `estimate:view` |
| GET | `/estimates/:id/pdf` | `estimate:view` |
| POST | `/estimates/calculate` | `estimate:view` |
| POST | `/estimates` | `estimate:create` |
| PUT | `/estimates/:id` | `estimate:update` |
| PATCH | `/estimates/:id/status` | `estimate:status` |
| POST | `/estimates/:id/duplicate` | `estimate:create` |
| DELETE | `/estimates/:id` | `estimate:delete` |
| POST | `/estimates/:id/restore` | `estimate:delete` |
| POST | `/estimates/maintenance/expire-overdue` | `estimate:status` |

`GET /estimates` query: `page`, `pageSize`, `search`, `status` (repeatable or `ALL`),
`hostingModel`, `dateFrom`, `dateTo`, `createdById`, `includeDeleted`,
`sortBy` (`createdAt` · `estimateDate` · `estimateNumber` · `netPayableOneTime` ·
`clientCompanyName` · `validUntil`), `sortDir`.

---

## Samples

### Live recalculation — `POST /estimates/calculate`

Called on every change in the builder. Persists nothing.

```json
{
  "hostingModel": "VLOQ_CLOUD",
  "userCount": 25,
  "gstPercent": 18,
  "modules": [
    { "moduleId": "8f2c1a90-0b6e-4c1a-9a55-5f0a7d3c1e01", "sequence": 1 },
    { "moduleId": "3d5b7e21-4c88-4f19-8ab2-91c4d6e70a02", "sequence": 2 },
    { "moduleId": "b1447c56-2f0d-4a33-9f61-77b2e5c8d903", "overrideOneTimeFee": "40000.00", "sequence": 3 }
  ],
  "adjustment": { "type": "PERCENT", "value": 7.5, "scope": "ONE_TIME", "note": "Multi-module rollout" }
}
```

```json
{
  "success": true,
  "message": "Pricing calculated",
  "data": {
    "hostingModel": "VLOQ_CLOUD",
    "userCount": 25,
    "gstPercent": 18,
    "lines": [
      {
        "moduleCode": "PROJECT_MGMT", "moduleName": "Project Management", "sequence": 1,
        "appliedOneTimeFee": "75000.00", "appliedMonthlyPerUser": "450.00",
        "lineOneTimeAmount": "75000.00", "lineMonthlyAmount": "11250.00", "isOverridden": false
      },
      {
        "moduleCode": "TRACK_TRACE", "moduleName": "Track & Trace", "sequence": 2,
        "appliedOneTimeFee": "60000.00", "appliedMonthlyPerUser": "350.00",
        "lineOneTimeAmount": "60000.00", "lineMonthlyAmount": "8750.00", "isOverridden": false
      },
      {
        "moduleCode": "QUALITY_CONTROL", "moduleName": "Quality Control", "sequence": 3,
        "appliedOneTimeFee": "40000.00", "appliedMonthlyPerUser": "275.00",
        "lineOneTimeAmount": "40000.00", "lineMonthlyAmount": "6875.00", "isOverridden": true
      }
    ],
    "oneTimeSubtotal": "175000.00",
    "recurringSubtotal": "26875.00",
    "oneTimeAdjustment": "13125.00",
    "recurringAdjustment": "0.00",
    "taxableOneTime": "161875.00",
    "taxableRecurring": "26875.00",
    "gstOneTime": "29137.50",
    "gstRecurring": "4837.50",
    "netPayableOneTime": "191012.50",
    "monthlyRecurringPayable": "31712.50",
    "firstYearIndicativeValue": "571562.50"
  }
}
```

Callers without `estimate:adjustment:view` get the same response minus
`oneTimeSubtotal`, `recurringSubtotal`, `oneTimeAdjustment`, `recurringAdjustment` — the
adjusted taxable figures only.

The same body with `"hostingModel": "CLIENT_OWNED"` prices the self-hosted column instead and
returns `recurringSubtotal`, `taxableRecurring`, `gstRecurring` and
`monthlyRecurringPayable` as `"0.00"`; `userCount` is still recorded.

### Create — `POST /estimates`

```json
{
  "estimateDate": "2026-07-28",
  "validUntil": "2026-08-12",
  "clientCompanyName": "Sterling Modular Interiors Pvt Ltd",
  "contactPerson": "Anand Kulkarni",
  "email": "anand@sterlingmodular.in",
  "mobile": "9820045612",
  "billingAddress": "Plot 14, MIDC Phase II, Andheri East, Mumbai 400093",
  "gstin": "27AAECS1234F1Z5",
  "hostingModel": "VLOQ_CLOUD",
  "userCount": 25,
  "gstPercent": 18,
  "modules": [
    { "moduleId": "8f2c1a90-0b6e-4c1a-9a55-5f0a7d3c1e01", "sequence": 1 },
    { "moduleId": "3d5b7e21-4c88-4f19-8ab2-91c4d6e70a02", "sequence": 2 }
  ],
  "clauses": [
    {
      "sourceTemplateId": "c8e1f3a4-5b62-4d07-9e13-2a4f6b8c0d11",
      "title": "Payment terms",
      "contentHtml": "<p>Setup fees are payable in full against the proforma invoice. Monthly charges are billed in advance on the 1st of each month.</p>",
      "version": "v2.1", "sequence": 1, "isCustom": false
    },
    {
      "title": "Onboarding window",
      "contentHtml": "<p>Configuration and training are completed within 21 working days of kick-off.</p>",
      "sequence": 2, "isCustom": true
    }
  ],
  "notes": "Pricing held for 15 days. Includes two on-site training days at the Andheri plant.",
  "adjustment": { "type": "FIXED", "value": 15000, "scope": "BOTH", "note": "Q2 rollout, approved by RM" }
}
```

`201 Created`:

```json
{
  "success": true,
  "message": "Estimate created",
  "data": {
    "id": "f0a91c7d-3e54-4b8a-9c21-6d8e0f4a2b77",
    "estimateNumber": "FX/EST/2026-27/0042",
    "fiscalYear": "2026-27",
    "status": "DRAFT",
    "version": 1,
    "hostingModel": "VLOQ_CLOUD",
    "userCount": 25,
    "gstPercent": "18.00",
    "taxableOneTime": "121969.70",
    "taxableRecurring": "19030.30",
    "gstOneTime": "21954.55",
    "gstRecurring": "3425.45",
    "netPayableOneTime": "143924.25",
    "monthlyRecurringPayable": "22455.75",
    "canViewAdjustment": true,
    "hasAdjustment": true,
    "modules": [ "…snapshotted lines…" ],
    "clauses": [ "…ordered clauses…" ],
    "createdBy": { "id": "…", "name": "Priya Nair", "email": "priya.nair@vloq.com" },
    "createdAt": "2026-07-28T09:14:22.104Z"
  }
}
```

Two-part validation failure, `422`, both errors returned at once so the form marks every
bad field in one pass:

```json
{
  "success": false, "data": null,
  "message": "Some fields need attention",
  "error": {
    "code": "VALIDATION_FAILED",
    "details": [
      { "field": "validUntil", "message": "Valid-until date must be on or after the estimate date" },
      { "field": "modules", "message": "The same module is selected more than once" }
    ]
  },
  "timestamp": "2026-07-28T09:14:22.104Z"
}
```

A caller without `estimate:adjustment:manage` sending an `adjustment` block gets `403`
`FORBIDDEN` — the field is rejected rather than silently dropped.

### Status — `PATCH /estimates/:id/status`

```json
{ "status": "SENT", "note": "Emailed to Anand with the signed NDA" }
```

Sets `sentAt`, appends an `EstimateActivity` row, and locks the estimate against edits once
`ACCEPTED`. Reverting `ACCEPTED` → `DRAFT` returns `409 CONFLICT`.

### List — `GET /estimates?status=SENT&status=ACCEPTED&search=sterling&sortBy=estimateDate&sortDir=desc&page=1&pageSize=20`

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "f0a91c7d-3e54-4b8a-9c21-6d8e0f4a2b77",
      "estimateNumber": "FX/EST/2026-27/0042",
      "estimateDate": "2026-07-28",
      "validUntil": "2026-08-12",
      "status": "SENT",
      "clientCompanyName": "Sterling Modular Interiors Pvt Ltd",
      "contactPerson": "Anand Kulkarni",
      "hostingModel": "VLOQ_CLOUD",
      "userCount": 25,
      "netPayableOneTime": "143924.25",
      "monthlyRecurringPayable": "22455.75",
      "version": 1,
      "hasAdjustment": true,
      "createdBy": { "id": "…", "name": "Priya Nair" },
      "updatedAt": "2026-07-28T11:02:40.882Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 43, "totalPages": 3, "hasNext": true, "hasPrevious": false }
}
```

`hasAdjustment` is absent entirely for roles without `estimate:adjustment:view`.

### Dashboard counters — `GET /estimates/summary`

```json
{
  "success": true,
  "data": {
    "counts": { "DRAFT": 12, "SENT": 18, "ACCEPTED": 9, "REJECTED": 3, "EXPIRED": 1, "total": 43 },
    "acceptedOneTimeValue": "1842500.00",
    "acceptedMonthlyValue": "214300.00",
    "expiringWithin7Days": 4
  }
}
```

### PDF — `GET /estimates/:id/pdf`

Returns `application/pdf` with
`Content-Disposition: attachment; filename="FX-EST-2026-27-0042-sterling-modular.pdf"`.
Rendered through the client-facing serializer, so no adjustment data can reach the document
regardless of who requests it.

### Duplicate — `POST /estimates/:id/duplicate`

Copies client details, modules with their snapshotted prices, clauses and the adjustment
(for authorised callers). Mints a new number, resets status to `DRAFT` and `version` to 1,
sets `duplicatedFromId`, and re-dates to today plus the configured validity window.
