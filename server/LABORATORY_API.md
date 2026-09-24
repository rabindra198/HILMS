# Laboratory API

All routes are mounted at `/lab` on the server. The Vite client proxy exposes them as `/api/lab`.
Every route requires:

```http
Authorization: Bearer <laboratory-user-jwt>
Content-Type: application/json
```

Only users whose stored role is `lab` can access these routes.

## Workflow

`PENDING -> ACCEPTED -> SAMPLE_COLLECTED -> PROCESSING -> COMPLETED -> VERIFIED`

Invalid jumps are rejected with a `400` response.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/lab/dashboard` | Dashboard counts and recent requests/reports |
| GET | `/lab/requests` | List requests; optional `?status=PENDING` |
| GET | `/lab/requests/:id` | Get one request |
| POST | `/lab/requests/:id/accept` | Accept a pending request |
| PATCH | `/lab/requests/:id/status` | Move to the next valid status; body `{ "status": "PROCESSING" }` |
| GET | `/lab/samples` | List samples |
| GET | `/lab/samples/:id` | Get one sample |
| POST | `/lab/samples` | Collect a sample |
| PATCH | `/lab/samples/:id` | Update sample status, barcode, or notes |
| GET | `/lab/processing` | List collected/processing requests |
| GET | `/lab/processing/:id` | Get processing item |
| PATCH | `/lab/processing/:id/start` | Start processing; optional `{ "notes": "..." }` |
| PATCH | `/lab/processing/:id/complete` | Complete processing; optional `{ "notes": "..." }` |
| GET | `/lab/results` | List results |
| GET | `/lab/results/:id` | Get one result |
| POST | `/lab/results` | Enter result parameters |
| PATCH | `/lab/results/:id` | Update result parameters/attachments |
| GET | `/lab/reports` | List reports; optional `?status=VERIFIED` |
| GET | `/lab/reports/:id` | Get one report |
| POST | `/lab/reports` | Generate a completed report |
| PATCH | `/lab/reports/:id/verify` | Verify a completed report |
| GET | `/lab/tests` | List active tests |
| GET | `/lab/tests/:id` | Get one test |
| POST | `/lab/tests` | Create a test |
| PATCH | `/lab/tests/:id` | Update a test |
| DELETE | `/lab/tests/:id` | Soft-delete/deactivate a test |
| GET | `/lab/patients/:id` | Limited patient information and lab history |
| GET | `/lab/search?q=cbc` | Authorized categorized laboratory search |
| GET | `/lab/notifications` | Current user's notifications |
| PATCH | `/lab/notifications/:id/read` | Mark one notification read |
| PATCH | `/lab/notifications/read-all` | Mark all current-user notifications read |
| GET | `/lab/profile` | Current laboratory user's profile |
| PATCH | `/lab/profile` | Update name/phone only |
| PATCH | `/lab/profile/password` | Update password with current password |
| GET | `/lab/settings` | Current user's lab preferences |
| PATCH | `/lab/settings` | Update lab preferences |

## Example bodies

Collect sample:

```json
{
  "labRequest": "<requestId>",
  "sampleType": "Blood",
  "barcode": "BC-2026-0001",
  "notes": "Sample received without issue"
}
```

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

Generate report:

```json
{
  "labRequest": "<requestId>",
  "sample": "<sampleObjectId>",
  "results": ["<resultId>"],
  "remarks": "No abnormal findings."
}
```

## Postman sequence

1. Login through the existing auth endpoint and copy the returned JWT.
2. Set a Postman collection variable `token` to that JWT.
3. Add `Authorization: Bearer {{token}}` to every `/lab` request.
4. Call `GET /api/lab/dashboard`.
5. Call `GET /api/lab/requests`, then `GET /api/lab/requests/:id`.
6. Call `POST /api/lab/requests/:id/accept`.
7. Call `POST /api/lab/samples` with the request ID.
8. Call `PATCH /api/lab/processing/:id/start`.
9. Call `PATCH /api/lab/processing/:id/complete`.
10. Call `POST /api/lab/results` with one or more parameters.
11. Call `POST /api/lab/reports`.
12. Call `PATCH /api/lab/reports/:id/verify`.
13. Test `GET /api/lab/search?q=cbc`.
14. Test notifications, profile, password, and settings routes.

## Environment

The existing server environment is sufficient:

```env
PORT=3000
MONGO_URI=<mongodb-connection-string>
JWT_SECRET=<strong-secret>
JWT_EXPIRE=7d
NODE_ENV=development
```

Run from `server`:

```bash
npm install
npm start
```
