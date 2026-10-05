# HILMS - Authentication & Access Control

A MERN stack authentication system with patient self-registration, administrator-reviewed
staff access requests and role-based access control (RBAC), using React 19, Express,
MongoDB, and shadcn/ui.

**Patients register themselves.** `doctor` and `lab` accounts are created only by an
Admin approving an access request, and receive their password by email - never by choosing
one on a public form.

## Access Model

| Role | How it is obtained | Dashboard |
|------|--------------------|-----------|
| `patient` | Public self-registration (instant) | `/patient/dashboard` |
| `doctor` | Public request + admin approval | `/doctor/dashboard` |
| `lab` | Public request + admin approval | `/lab/dashboard` |
| `admin` | Bootstrap only (`npm run seed`) | `/admin/dashboard` |

Every account also carries a lifecycle `status`: `PENDING`, `APPROVED` or `REJECTED`.
Only `APPROVED` accounts can authenticate or issue a reset token.

## Folder Structure

```
HILMS/
├── client/                          # React frontend
│   └── src/
│       ├── components/
│       │   ├── ProtectedRoute.jsx    # auth + status + role route guards
│       │   └── layout/               # DashboardLayout, Sidebar, Header
│       ├── context/AuthContext.jsx   # backend-session auth state
│       ├── Features/
│       │   ├── login/                # /login
│       │   ├── request-access/       # RequestAccessDialog (modal on /login)
│       │   ├── change-password/      # /change-password (forced first login)
│       │   ├── forgot-password/      # /forgot-password, /reset-password
│       │   ├── Landing/
│       │   └── unauthorized/         # 403 page
│       ├── lib/
│       │   ├── axios.js              # cookie-based Axios client
│       │   └── roles.js              # role constants + redirect map
│       ├── services/adminApi.js      # admin endpoints
│       ├── pages/                    # role dashboards
│       │   └── admin/                # incl. AccessRequests review screen
│       └── App.jsx
├── server/                          # Node.js + Express backend
│   └── src/
│       ├── config/
│       │   ├── db.js                 # MongoDB connection
│       │   ├── env.js                # validated environment config
│       │   └── roles.js              # role allowlist, permissions, resolvers
│       ├── controllers/
│       ├── middleware/
│       │   ├── auth.js               # protect, requireRole, isAdmin
│       │   ├── role.middleware.js
│       │   └── error.middleware.js
│       ├── models/
│       │   ├── User.js               # role + status + bcrypt password + profile
│       │   ├── AccessRequest.js      # staff requests: PENDING / APPROVED / REJECTED
│       │   ├── PasswordResetToken.js # hashed, single-use, expiring
│       │   └── AuditLog.js
│       ├── routes/                   # auth, admin, laboratory
│       ├── realtime/                 # Socket.IO auth, rooms, and event publishing
│       ├── services/
│       │   ├── accessRequest.service.js
│       │   ├── admin.service.js
│       │   ├── password.service.js
│       │   ├── tempPassword.service.js # CSPRNG temporary passwords
│       │   ├── email.service.js      # Nodemailer over SMTP
│       │   └── audit.service.js
│       ├── validators/
│       ├── scripts/
│       │   ├── seed.js               # bootstrap the Admin
│       │   └── *.e2e.js              # test suites
│       └── app.js
└── README.md
```

Socket.IO setup, event contracts, React listener usage, and realtime test
instructions are documented in [server/REALTIME.md](./server/REALTIME.md).

## How The Access Flow Works

All public entry points live in a single **"Request Access"** dialog on the login
screen (`/login?requestAccess=1`). The dialog switches behaviour based on the role
the visitor picks.

### 1. Patient - instant self-registration

- `POST /auth/register/patient`
- The visitor supplies name, email, phone, date of birth, gender, address and a
  password of their choosing.
- The account is created **immediately** with `role: "patient"`, `status: APPROVED`
  and a bcrypt hash of the submitted password. There is nothing to approve.
- The email must be free of any existing account or open staff request, so one
  person can never hold two identities.
- A welcome confirmation email is sent. `admin` is not reachable
  from this path.

### 2. Doctor / Laboratory - request, then approval

- `POST /auth/access-requests`
- The visitor submits identity and role-specific contact details. **No password is
  accepted, stored or emailed** - the field is rejected server-side if present.
- Doctor requests carry an NMC registration number; laboratory requests carry a
  lab registry number. Each role is validated against its own field allowlist, so a
  laboratory cannot smuggle in an NMC number and vice versa.
  - `admin` **cannot** be requested, and unknown roles are rejected
    rather than defaulted.
  - The NMC number and lab registry number are each unique. A number already held
    by an account, or already queued under review, is refused with `409`.
  - **No account is created, no role is granted and no token is issued.** Only one
  open (`PENDING`) request per email, enforced by a partial unique index.

### 3. Admin review

At `/admin/access-requests` an Admin accepts or declines.

- `PATCH /admin/access-requests/:id/approve`
  - Generates a 14-character temporary password with `crypto.randomInt`, guaranteed
    to contain upper, lower, digit and symbol characters, then shuffles it with a
    CSPRNG so the class ordering is not predictable. Obvious values (`password`,
    `admin123`, the email local-part, ...) are rejected and regenerated.
  - Re-checks the NMC / lab registry number against live accounts and other open
    requests. On a clash it refuses with `409` and leaves the request `PENDING`
    rather than creating a duplicate or taking over an existing identity.
  - Creates the `User` with `status: APPROVED` and the requested role. Only the
    bcrypt **hash** of the temporary password is stored.
  - Sets `mustChangePassword: true`, which the backend uses to block every other
    route until the password is replaced.
  - Emails the plaintext temporary password to the applicant. The approval **HTTP
    response never contains the credential**.
  - **If the email cannot be delivered the whole approval is rolled back**: the new
    account is deleted, the request is restored to `PENDING`, the attempt is
    audited as `ACCESS_REQUEST_APPROVAL_ROLLED_BACK`, and the endpoint returns
    `502`. An applicant who never chose a password is otherwise left with an
    account they can never log into.
- `PATCH /admin/access-requests/:id/reject` records the reason and emails a
  decline notice; the account is never created.
- Re-reviewing an already-reviewed request is refused (`409`).

### 3b. Admin / system-created Patient accounts

Walk-in and referred patients often have no email account of their own, so a
receptionist or an upstream system can provision one instead. This is the third
account-provisioning path, and it deliberately reuses the same primitives as the
other two.

- `POST /admin/patients` (Admin only)
  - Body: `name`, `email`, and optionally `contactNumber` and `address`.
  - **No password is accepted.** A client-supplied `password` is rejected with
    `400` rather than silently ignored, and a non-`patient` `role` is rejected -
    the role is forced server-side.
  - Generates the temporary password with the same
    `tempPassword.service` CSPRNG used for staff approvals, sets
    `mustChangePassword: true`, and stores only the bcrypt hash.
  - Refuses with `409` if the email already belongs to an account or to an open
    staff request, so a patient can never hold two identities.
  - Emails subject **"HILMS - Your Temporary Login Password"** with the login
    email, the password, a mandatory-change warning, a sign-in link, and a
    "do not share" notice. The response contains the safe user record and
    `emailDelivered`, and **never the credential**.
  - **If the email cannot be delivered the account is deleted**, the attempt is
    audited as `PATIENT_ACCOUNT_CREATE_ROLLED_BACK`, and the endpoint returns
    `502`. The patient is never left with an unusable login.
  - Reachable from the Admin UI via **Admin → Patients → Register Patient**
    (`client/src/pages/admin/CreatePatientDialog.jsx`).

### 4. Login and forced password change

- `POST /auth/login`
- A `PENDING` or `REJECTED` account is refused with `403` **before** a token is issued.
- On success a JWT is set as an **httpOnly cookie** and the authoritative
  `{ user, role, permissions, abilities }` payload is returned. The client only
  consumes the role; it never decides it.
- If `mustChangePassword` is set, the client redirects to `/change-password` and
  `blockUntilPasswordChanged` returns `403 PASSWORD_CHANGE_REQUIRED` for any other
  protected route. The change-password endpoint itself stays reachable.
- `PATCH /auth/change-password` (authenticated) requires the temporary password as
  the current password, clears the flag and revokes the old credential.
  - Accepts `temporaryPassword` (what the forced screen sends) or `currentPassword`.
  - `confirmPassword` is verified **server-side**; the backend is the only
    authority on what gets stored, even if a client skips the check.
  - The screen also offers **Cancel / Log out**, the only legitimate exit while a
    temporary password is still held. It is a full page rather than a modal
    because a modal would vanish on refresh and the requirement is that the
    change is still pending afterwards.

### 5. Password recovery

- `POST /auth/forgot-password` issues a single-use, 30-minute token and emails a
  reset link. The HTTP response is identical for unknown emails, so the endpoint
  cannot be used to enumerate accounts, and the token is never returned over HTTP.
- `POST /auth/reset-password` consumes the token, invalidates every other
  outstanding token for that account, and clears any forced-change state.

## Environment Variables

See `server/.env.example` for the authoritative, commented list. Key values:

```
PORT=5000
MONGO_URI=<your connection string>
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=1d
APP_URL=http://localhost:5173      # used to build emailed reset links
CLIENT_URL=http://localhost:5173   # CORS credentialed origin

# Transactional email - SRS requires SMTP. Leave SMTP_HOST empty to disable
# outbound email in development (links are then logged to the console).
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false                   # true for implicit TLS (usually port 465)
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=HILMS <no-reply@your-domain.com>
```

Mail is sent with **Nodemailer over SMTP** (no third-party API dependency). If
`SMTP_HOST` is absent the server still issues reset tokens, logs the reset link to
the console in **development only**, and falls back to an in-app notification.
Approval emails carrying temporary passwords need working SMTP; the temporary
password is never returned over HTTP, so without SMTP the account must be reset.

## API Endpoints

The Vite dev proxy strips the leading `/api`; the tables below show the browser paths.

### Auth (`/api/auth`)

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| POST | `/api/auth/register/patient` | Patient self-registration (instant) | Public |
| POST | `/api/auth/access-requests` | Submit a Doctor / Laboratory request | Public |
| POST | `/api/access-requests` | Alias of the above (SRS-documented path) | Public |
| POST | `/api/auth/login` | Login, set httpOnly cookie | Public |
| POST | `/api/auth/logout` | Clear auth cookie | Public |
| GET | `/api/auth/me` | Current user + role + permissions | Authenticated |
| POST | `/api/auth/forgot-password` | Email a reset link | Public |
| POST | `/api/auth/reset-password` | Consume a reset token | Public |
| PATCH | `/api/auth/change-password` | Change password | Authenticated |

> `POST /api/auth/signup` and `POST /api/auth/register` **do not exist** (404).
> `POST /api/auth/register/patient` accepts a `password`; the staff request
> endpoint rejects one.

Any protected route returns `403 PASSWORD_CHANGE_REQUIRED` while the caller still
holds an Admin-issued temporary password.

`PATCH /api/auth/change-password`

| Field | Notes |
|-------|-------|
| `temporaryPassword` | The credential from the email. `currentPassword` is accepted as an alias. |
| `newPassword` | Min 6 characters; must differ from the current password. |
| `confirmPassword` | Optional; if present it must equal `newPassword` (checked server-side). |

### Admin (`/api/admin`) - Admin only

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/access-requests` | List / filter requests (returns `requests` + `counts` by status) |
| GET | `/api/admin/access-requests/summary` | Pending-request and per-role user totals |
| GET | `/api/admin/access-requests/:id` | Single request detail |
| PATCH | `/api/admin/access-requests/:id/approve` | Approve + create account + email temp password (rolls back if mail fails) |
| PATCH | `/api/admin/access-requests/:id/reject` | Reject (stores `rejectionReason`, keeps history) |
| POST | `/api/admin/patients` | Create a Patient account + email a temp password (rolls back if mail fails) |
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/:id/role` | Change role |
| PATCH | `/api/admin/users/:id/status` | Change status |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/overview` | System role/status counts + pending request summary |
| GET | `/api/admin/audit-logs` | Recent audit entries |

`POST /api/admin/patients` request body:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | 2-100 characters |
| `email` | yes | Must be free of any account and any open request, else `409` |
| `contactNumber` | no | Synced to `phone` |
| `address` | no | Max 300 characters |
| `password` | **never** | Rejected with `400` if present - the backend owns the credential |
| `role` | **never** | Must be `patient` if present; the role is forced server-side |

Response `201`: `{ user, emailDelivered }` - `user` is the safe resource
(including `mustChangePassword: true`) and the temporary password is absent.
`502` means the email could not be sent and **no account was created**.

## How Role-Based Access Control Works

- **User Model** - `role` is one of `patient`, `doctor`, `lab`, `admin`.
  `server/src/config/roles.js` is the single source of truth for the allowlist,
  permissions and alias resolution.
- **Backend middleware** (`server/src/middleware/auth.js`) - one implementation for
  every route. It reads the JWT from the httpOnly cookie *or* an `Authorization:
  Bearer` header, reloads the user from the database, and rejects any account that is
  not `APPROVED`/active. `authorize` and `isAdmin` layer role checks on top.
- **Escalation rules** - Admin is the highest role and can assign any role,
  including Admin, but nobody can change their own role or status, and a
  non-admin can never grant or change the Admin role.
- **Removed role** - a `superadmin` role previously existed and was removed. It is
  rejected by the role allowlist, by the request validator, by role updates, and
  the `/api/super-admin` surface no longer exists.
- **Frontend guards** (`client/src/components/ProtectedRoute.jsx`) - `ProtectedRoute`
  checks authentication, account status and role; `PublicOnlyRoute` redirects signed-in
  users away from the login/request screens.
- **These guards are a UX convenience, not a security boundary.** Every protected
  endpoint is independently authorised server-side, and status is re-read from the
  database on each request.

## Setup Instructions

### Prerequisites
- Node.js (v18+ - global `fetch` is used for outbound email)
- MongoDB (local or Atlas)

### 1. Install Dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure Environment

```bash
cp server/.env.example server/.env
```

Set at minimum `MONGO_URI` and a strong `JWT_SECRET`.

### 3. Create the First Admin

Public registration is disabled, so the first Admin must be bootstrapped:

```bash
cd server
npm run seed
```

The script is idempotent - re-running updates the existing account rather than
duplicating it. It **refuses to run** with its development default password when
`NODE_ENV=production`; set `SEED_ADMIN_PASSWORD` first.

### 4. Start the Application

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:5000`

### 5. Run the Tests

```bash
cd server
npm test               # email templates + service-level + HTTP end-to-end suites
npm run verify:smtp    # full provisioning flow over a real SMTP socket
npm run check:fixtures # report leftover test data in the live database
```

`verify:smtp` starts a local SMTP responder on `127.0.0.1:2525` and drives the
whole flow through the real Express app, so nodemailer performs a genuine
`EHLO/AUTH/MAIL/RCPT/DATA` conversation. It proves the SMTP code path works; it is
**not** a substitute for sending through your production mail provider.

`check:fixtures` exists because a leaked test account in a real database is a
security problem. Add `--purge` to delete leftover `E2E_*` audit rows.

The suites namespace their fixtures with `E2E_` and clean up after themselves -
users, access requests, reset tokens, notifications **and audit rows**.

## Key Implementation Details

- **Token Storage** - the JWT lives in an httpOnly cookie. It is never written to
  `localStorage` or `sessionStorage`, so XSS cannot read it.
- **Password Hashing** - bcrypt, 12 salt rounds, on `User.password` only. Staff
  requests never hold a credential at all, so there is no `AccessRequest.passwordHash`.
- **Temporary Passwords** - generated with `crypto.randomInt` (CSPRNG), 14
  characters, guaranteed to mix upper, lower, digit and symbol, then shuffled with
  a CSPRNG so class ordering is unpredictable. Obvious values are rejected and
  regenerated. Only the bcrypt hash is persisted; the plaintext exists in the
  approval email and is never returned by an API.
- **Forced First-Login Change** - `mustChangePassword` is enforced server-side by
  `blockUntilPasswordChanged`, so a temporary password cannot reach any feature
  route. The client redirect is convenience only, not the control.
- **Identity Integrity** - an address is reserved by an open staff request, so a
  patient cannot claim it. Approval refuses (`409`) rather than adopting an
  account that appeared later, and a failed review write rolls the new account
  back. Neither path can re-role a live identity.
- **Password Reset Tokens** - 32 random bytes; only a SHA-256 hash is persisted.
  Single-use, 30-minute expiry, and all sibling tokens are invalidated on use.
- **Input Validation** - `express-validator` on the backend, `zod` + `react-hook-form`
  on the frontend. Each role is validated against its own field allowlist, so a
  laboratory request cannot carry an NMC number and vice versa, and a staff request
  that smuggles in a password is rejected outright. The form's `confirmPassword` is
  a client/server cross-check only and is never stored.
- **Error Handling** - centralised middleware; 5xx messages are sanitised before
  they reach the client.
- **CORS** - credentialed, restricted to `CLIENT_URL`.
- **Email** - Nodemailer over SMTP. Delivery is best-effort and never blocks or
  fails the surrounding operation, which is logged and audited instead.
- **Audit Trail** - approvals, rejections, role/status changes, deletions and password
  events are written to `AuditLog`. Audit records reference the fact that a
  credential was issued; they never contain the credential.
- **Schema changes need no migration** - Mongoose creates collections and indexes on
  model initialisation.

## Notes

- In production, serve over HTTPS so the cookie can be set with `secure: true`.
- MongoDB must be reachable before the backend starts.
- The email TLD pattern accepts 2-63 characters, so `.local`, `.health` and `.care`
  are all valid.
- The laboratory workflow (`PENDING → ACCEPTED → SAMPLE_COLLECTED → PROCESSING →
  COMPLETED → VERIFIED`) is unchanged. See `server/LABORATORY_API.md`.

## Development Admin account

`npm run seed` creates the Admin, which is the highest role in the system. It is a
**local development account only**; its credentials come from the environment and are
never exposed in the frontend or hard-coded in client code.

```
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@hilms.local
ADMIN_PASSWORD=Admin@12345
```

`SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` work too and take
precedence. The password is bcrypt-hashed before storage, and the seed refuses to
fall back to its built-in defaults when `NODE_ENV=production`. Re-running updates
the account in place instead of duplicating it.
