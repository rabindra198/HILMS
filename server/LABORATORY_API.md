# Laboratory API

All routes are mounted at `/lab` on the server. The Vite client proxy exposes them as `/api/lab`.
Every route requires an authenticated session whose stored role is `lab`:

```http
# browser (httpOnly cookie set at login, sent automatically)
Cookie: <session-cookie>

# non-browser clients
Authorization: Bearer <laboratory-user-jwt>
Content-Type: application/json
```

A laboratory account still holding an approved temporary password is refused with `403` until
it changes the password.

Doctors submit new requests through a separate doctor-authorized API:

| Method | Route | Purpose |
|---|---|---|
| GET | `/doctor/laboratory` | List active patients, active tests, and this doctor's recent requests |
| POST | `/doctor/laboratory/requests` | Create a pending request for an active patient and test |

The create body accepts `patient`, `test`, optional `priority` (`ROUTINE`, `URGENT`, or `STAT`), and optional `clinicalNotes`. The server derives the doctor from the authenticated session. New requests immediately appear in the laboratory request queue and notify every active laboratory user.

## Workflow

`PENDING -> ACCEPTED -> SAMPLE_COLLECTED -> PROCESSING -> COMPLETED -> VERIFIED`

Every transition is validated against the stored current status, so two laboratory users racing
on the same request cannot both succeed. An invalid jump returns `409`; an unknown status value
returns `422`. `VERIFIED` is only reachable through report verification, never through
`PATCH /lab/requests/:id/status`.

Every mutation writes an entry to the audit log with the acting user's id, email and role.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/lab/dashboard` | Counts, urgent tally, active queue, recent samples/requests/reports |
| GET | `/lab/requests` | List requests; filters below |
| GET | `/lab/requests/:id` | Get one request |
| POST | `/lab/requests/:id/accept` | Accept a pending request |
| PATCH | `/lab/requests/:id/status` | Move to the next valid status; body `{ "status": "CANCELLED" }` |
| GET | `/lab/samples` | List samples; optional `?status=`, `?labRequest=`, `?patient=` |
| GET | `/lab/samples/:id` | Get one sample |
| POST | `/lab/samples` | Collect a sample |
| PATCH | `/lab/samples/:id` | Update sample status, notes, collection date/time |
| GET | `/lab/processing` | List collected/processing requests, each with its `sample` joined in |
| GET | `/lab/processing/:id` | Get processing item |
| PATCH | `/lab/processing/:id/start` | Start processing; optional `{ "notes": "..." }` |
| PATCH | `/lab/processing/:id/complete` | Complete processing; optional `{ "notes": "..." }` |
| GET | `/lab/results` | List results |
| GET | `/lab/results/:id` | Get one result |
| POST | `/lab/results` | Enter result parameters (JSON, or multipart to attach files) |
| PATCH | `/lab/results/:id` | Update result parameters/attachments |
| GET | `/lab/results/:id/attachments/:fileId` | Stream one attachment |
| GET | `/lab/reports` | List reports; optional `?status=COMPLETED\|VERIFIED` |
| GET | `/lab/reports/:id` | Get one report |
| POST | `/lab/reports` | Generate a completed report |
| PATCH | `/lab/reports/:id/verify` | Verify a completed report |
| GET | `/lab/tests` | List tests; `?includeInactive=true` returns every test |
| GET | `/lab/tests/:id` | Get one test |
| POST | `/lab/tests` | Create a test |
| PATCH | `/lab/tests/:id` | Update a test |
| DELETE | `/lab/tests/:id` | Soft-delete/deactivate a test |
| PATCH | `/lab/tests/:id/status` | Set availability; body `{ "isActive": false }` |
| GET | `/lab/patients/:id` | Limited patient information and lab history |
| GET | `/lab/search?q=cbc` | Authorized categorized laboratory search |
| GET | `/lab/notifications` | Current user's notifications; optional `?unread=true` |
| GET | `/lab/notifications/unread-count` | Unread count for the header badge |
| PATCH | `/lab/notifications/:id/read` | Mark one notification read |
| PATCH | `/lab/notifications/read-all` | Mark all current-user notifications read |
| GET | `/lab/profile` | Current laboratory user's profile |
| PATCH | `/lab/profile` | Update name/phone only |
| PATCH | `/lab/profile/password` | Update password with current password |
| GET | `/lab/settings` | Current user's lab preferences |
| PATCH | `/lab/settings` | Update lab preferences |

## List query parameters

All list routes return a plain array in `data` with pagination metadata as a sibling key.
`?limit=0` returns everything; `?page=`/`?limit=` page the result. Sorting is restricted to a
whitelisted set per collection and anything else returns `422`.

`GET /lab/requests` accepts:

| Parameter | Notes |
|---|---|
| `status` | `PENDING`, `ACCEPTED`, `SAMPLE_COLLECTED`, `PROCESSING`, `COMPLETED`, `VERIFIED`, `CANCELLED` |
| `priority` | `ROUTINE`, `URGENT`, `STAT` |
| `test`, `patient`, `doctor` | ObjectIds |
| `dateFrom`, `dateTo` | ISO dates applied to `requestedDate` |
| `search` | Free text of 2+ characters, matched against patient name/email, test name/code, clinical notes and request id |
| `sort`, `order` | `createdAt`, `updatedAt`, `requestedDate`, `status`, `priority` |

## Example bodies

Collect sample. `collectionDate` and `collectionTime` are recorded separately (SRS FR-LB-03).
`collectionTime` accepts a full timestamp or a bare `HH:mm` applied to the collection date, and
falls back to the collection date when omitted.

```json
{
  "labRequest": "<requestId>",
  "sampleType": "blood",
  "collectionDate": "2026-01-31T00:00:00.000Z",
  "collectionTime": "09:30",
  "notes": "Fasting sample, collected in EDTA tube"
}
```

`sampleId` and `barcode` are generated by the server and cannot be supplied by the caller.

Enter results:

```json
{
  "labRequest": "<requestId>",
  "sample": "<sampleObjectId>",
  "parameters": [
    {
      "parameter": "Hemoglobin",
      "value": "14.2",
      "unit": "g/dL",
      "referenceRange": "13.0-17.0",
      "flag": "NORMAL"
    }
  ],
  "attachments": []
}
```

To attach files, send `multipart/form-data` instead, with `labRequest` and `sample` as text
fields, `parameters` as a JSON string, and up to 5 files named `attachments`. Accepted types are
JPG, PNG, WEBP, GIF and PDF; the server verifies the file's magic bytes and deletes anything
mismatched. The stored `id` is an opaque token, never a filesystem path, and
`GET /lab/results/:id/attachments/:fileId` is the only way to read one back.

Generate report:

```json
{
  "labRequest": "<requestId>",
  "sample": "<sampleObjectId>",
  "results": ["<resultId>"],
  "remarks": "No abnormal findings."
}
```

## Integrity rules

- Ownership is proved, not assumed: every result and the sample on a report must belong to the
  request being reported.
- The sample cited on a report must be the specimen for the requested test.
- A rejected sample cannot have a result recorded against it and cannot be reported on.
- A result that belongs to a `VERIFIED` report is frozen: `PATCH /lab/results/:id` returns `409`.
  A verified report is a released clinical document.
- One sample per request. A duplicate returns `409`.
- A `COMPLETED` request stays on `GET /lab/processing` until it is reported, so a missing parameter can
  still be recorded before the report is generated. Notes typed during result entry are stored on
  `LabRequest.processingNotes` via `processingNotes`.
- Verifying a report moves the request to `VERIFIED`, notifies the requesting doctor and the
  patient, and emails both, all inside one transaction where the deployment supports it.

## Notifications raised by the workflow

| Event | Recipient |
|---|---|
| `LAB_REQUEST_CREATED` | Every active laboratory user |
| `LAB_REQUEST_ACCEPTED` | Requesting doctor |
| `SAMPLE_COLLECTED` | Requesting doctor |
| `LAB_PROCESSING_STARTED` | Requesting doctor |
| `LAB_PROCESSING_COMPLETED` | Requesting doctor |
| `LAB_RESULT_ENTERED` | Requesting doctor |
| `LAB_REPORT_GENERATED` | Requesting doctor |
| `LAB_REPORT_VERIFIED` | Requesting doctor and patient (plus email) |
| `LAB_REPORT_COMMENTED` | Patient (raised by the reviewing doctor) |

## Postman sequence

1. Login through the existing auth endpoint and copy the returned JWT.
2. Set a Postman collection variable `token` to that JWT.
3. Add `Authorization: Bearer {{token}}` to every `/lab` request.
4. Call `GET /api/lab/dashboard`.
5. Call `GET /api/lab/requests`, then `GET /api/lab/requests/:id`.
6. Call `POST /api/lab/requests/:id/accept`.
7. Call `POST /api/lab/samples` with the request ID.
8. Call `PATCH /api/lab/processing/:id/start`.
9. Call `POST /api/lab/results` with one or more parameters.
10. Call `PATCH /api/lab/processing/:id/complete`.
11. Call `POST /api/lab/reports`.
12. Call `PATCH /api/lab/reports/:id/verify`.
13. Test `GET /api/lab/search?q=cbc`.
14. Test notifications, profile, password, and settings routes.

Verification suites live in `src/scripts` and run against a real MongoDB and the real Express app:

```bash
npm run test:lab      # 241 laboratory workflow checks
npm run test:http     # 122 HTTP/auth checks
npm run test:e2e      # 137 service-level checks
npm run test:email    #  30 mail-template checks
```

## Environment

The existing server environment is sufficient:

```env
PORT=3000
MONGO_URI=<mongodb-connection-string>
JWT_SECRET=<strong-secret>
JWT_EXPIRE=7d
NODE_ENV=development
```

Optional result-attachment settings, both with working defaults:

```env
UPLOAD_DIR=<absolute path outside the web root>
UPLOAD_MAX_BYTES=5242880
```

Run from `server`:

```bash
npm install
npm start
```
