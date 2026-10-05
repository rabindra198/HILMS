# Realtime events

Socket.IO is an optional push layer over the existing REST API. Express remains
the source of truth: an event says that a record changed, and a screen refreshes
that record through its existing authenticated endpoint.

## Startup and local development

`src/server.js` connects MongoDB, wraps the unchanged Express `app` with
`http.createServer`, attaches Socket.IO, and listens on the same port. Existing
controllers and tests can continue importing `src/app.js` and calling
`app.listen()`.

Set `CLIENT_URL` to the browser origin (or a comma-separated list of allowed
origins). The Vite development server proxies `/socket.io` to the API with
WebSocket support. Run the existing API and Vite development commands as usual;
no separate Socket.IO port is needed.

## Authentication and room policy

- The browser sends the existing HttpOnly `token` cookie with
  `withCredentials: true`; do not put a JWT in a query string or in the
  Socket.IO `auth` payload.
- The handshake verifies the JWT and reloads the account from MongoDB. It
  rejects missing/expired tokens, stale token versions, pending/rejected or
  inactive accounts, and accounts that must change their temporary password.
- The server assigns exactly `user:<MongoDB id>` and `role:<canonical role>`.
  There is no client-facing room-join handler. Never accept a role, user id, or
  room name supplied by the browser as authorization.
- Logout, session revocation, account role/status changes, account deletion,
  and JWT expiry disconnect existing sockets. Normal HTTP authorization remains
  enforced by the existing middleware.

The Socket.IO in-memory adapter is suitable for a single API process. For
multiple API replicas, configure the official Redis adapter and Redis pub/sub
before accepting connections so room emissions and disconnects reach sockets
connected to every replica. When using polling across replicas, also configure
load-balancer sticky sessions; alternatively enforce WebSocket-only transport
after verifying the deployment network supports it.

## Event contract

Events carry identifiers/status, not clinical values. Consumers must fetch
details from their role-authorized REST API.

| Event | Server room(s) | Trigger |
| --- | --- | --- |
| `patient:registered` | `role:admin`, `role:doctor` | Patient self-registration or Admin provisioning; contains only a timestamp |
| `appointment:created` | Admin role, assigned doctor, patient | Any supported appointment booking path |
| `appointment:updated` | Admin role, assigned doctor, patient | Admin reschedules an appointment |
| `appointment:status-changed` | Admin role, assigned doctor, patient | A supported status transition or cancellation |
| `lab:request-created` | Laboratory role | Doctor creates a laboratory request |
| `lab:report-verified` | Laboratory role; report doctor/patient when the verifier's report-alert preference allows | Verification transaction has committed |
| `lab:report-approved` | Laboratory role, report doctor, report patient | Approval transaction has committed |
| `lab:report-revised` | Laboratory role, report doctor | Revision transaction has committed |
| `notification:created` | Notification recipient's user room | A notification has been persisted |

Appointment payloads contain `appointmentId`, `patientId`, `doctorId`, `status`,
and `changedAt` (plus `from`/`to` for status changes). The patient-registration
payload intentionally contains no patient identifier because every doctor
receives that role-level refresh signal; each doctor's subsequent REST request
remains scoped to their care team. Lab events contain only `requestId` or
`reportId`, status, and a timestamp. Notification events contain the stored
notification id/type and entity reference, not its message.

The current API has no separate patient check-in action. Appointment booking and
the existing appointment status transitions refresh the waiting lists; do not
treat account registration alone as a check-in or as a confirmed visit.

## React usage

`client/src/main.jsx` mounts `SocketProvider` inside `AuthProvider`. The provider
maintains one cookie-authenticated connection per signed-in account, reconnects
automatically, tears down listeners/connections on logout or account changes, and
refreshes relevant screens when a connection is restored. Use `useSocketEvent`
for screen-level handlers; it always removes its listener on unmount:

```jsx
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

function LabQueue({ reload }) {
  useSocketEvent(SOCKET_EVENTS.LAB_REQUEST_CREATED, reload);
  return null;
}
```

Do not mutate MongoDB or trust client-sent business events through the socket.
All writes continue through the existing REST controllers/services; those
services publish only after their writes succeed. Report verification and
approval publish after their optional MongoDB transactions commit.

## Validation

Run `cd server && npm run test:socket` to exercise cookie authentication,
token-version revocation, server-assigned rooms, event delivery, rejection of
client-selected rooms, and live disconnect. The test uses an in-memory User
lookup stub and does not connect to MongoDB.
