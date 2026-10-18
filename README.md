# Emergency Auto Dispatch

A Node.js and PostgreSQL home-services app with customer requests, technician profiles and live locations, admin assignment, and nearest-technician dispatch.

## Requirements

- Node.js 18 or newer
- PostgreSQL
- A database with the base `public.users`, `public.customers`, `public.technicians`, and `public.admins` tables expected by the existing app

On startup, the server creates the `services` and `jobs` tables and adds the dispatch, location, technician-profile, and completion-report columns it needs to the existing tables.

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`. Set a long random `SESSION_SECRET` and provision an admin with `ADMIN_USERNAME` and `ADMIN_PASSWORD`. For Razorpay payments, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` with test-mode values; keep secrets server-side and never commit them.

3. Start the app:

   ```powershell
   npm start
   ```

4. Open `http://localhost:3000`. Geolocation works on localhost; a deployed site must use HTTPS.

To show maps, set `GOOGLE_MAPS_API_KEY` to a browser key restricted to the deployed site and the Maps JavaScript API.

## Technician and dispatch workflow

1. A technician signs in and completes the profile: photo, phone, service area, starting rate, and one active service category. Skills, achievements, and education are optional.
2. The technician (or admin) marks the technician available. The technician starts location sharing to appear online.
3. A customer submits a service request and shares GPS coordinates.
4. The server selects the nearest matching technician whose profile is complete, who is available, sharing a location updated within 30 seconds, and has no active job. Assignment is made inside a transaction.
5. If there is no eligible technician or the customer did not share GPS, the request remains visible in the admin Jobs list as unassigned/requested. An admin can assign it later.
6. The assigned technician marks the job “Ready to work” to start it, then sends a completion update to move it to completed. Admins can view that report in the job card.
7. After completion, the customer can pay the technician's configured starting rate through Razorpay Checkout. The server creates/reuses the order, verifies the checkout signature and captured INR amount with Razorpay, and only then marks the request paid. Unpaid completed requests remain payable from the customer dashboard. Configure a Razorpay webhook for `POST /api/payments/razorpay/webhook` and subscribe to `payment.captured` so successful payments reconcile even if the customer closes checkout.

Availability and online status are separate: an available technician with stale or stopped GPS is offline and is not eligible for automatic dispatch.

## Requirement coverage and current limits

| Requirement | Current implementation |
| --- | --- |
| Customer, technician, and admin access | Role-specific sign-in and workspaces with server-side role checks. |
| Emergency requests and dispatch | Customers create requests; the server assigns the nearest eligible technician by straight-line geographic distance. Requests without customer GPS or an eligible technician remain unassigned for admin review. |
| Technician tracking | Browser GPS sharing updates technician locations; customer and admin views refresh tracking data periodically. This is polling, not WebSockets, and requires the technician's browser to remain open with location permission enabled. |
| Job progress and service history | Technicians update assigned jobs through in-progress and completed; customer/admin job lists show requests and their status. |
| 24/7 system availability | The app exposes `/healthz` for process liveness and `/readyz` for database readiness. These endpoints support hosting-provider health checks; they do not provide uptime by themselves. |
| Acceptance timeout and automatic reassignment | Not implemented. Assignment is made when the request is submitted; jobs needing reassignment require admin action. |
| Road-route ETA, operational analytics, and customer feedback | Not implemented. Dispatch ranks by straight-line distance; it does not calculate traffic-aware routes or an ETA. |

The supplied project brief describes a wider target scope than this implementation. Do not present the unimplemented items above as available features.

## Tests

Run the dispatch eligibility and nearest-distance tests:

```powershell
npm test
```

These tests do not connect to PostgreSQL or Razorpay. Before deployment, also verify account sign-in, technician profile uploads, location permission, customer booking, admin assignment, technician status updates, completion reports, and Razorpay test-mode payments/webhooks against a non-production database.

## Deployment notes

- Set `NODE_ENV=production`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` through the hosting provider's secret/environment settings, not source control.
- Configure the host's liveness check to `GET /healthz` and its readiness check to `GET /readyz`. Liveness returns `200` while the process can serve requests; readiness returns `200` only when PostgreSQL responds to a query, otherwise `503`.
- Use an always-on hosting plan, a highly available PostgreSQL service, automated restart/health-check policies, and monitoring/alerting to target 24/7 availability. The health endpoints report process/database health but cannot guarantee uptime; availability also depends on the provider, database, network, and external services.
- Terminate HTTPS at the host or reverse proxy; geolocation requires a secure context outside localhost.
- Persist the `uploads` directory on durable storage. If using multiple app instances, use shared object/file storage for uploads.
- Restrict the Google Maps browser key by allowed referrers and API.
- Back up PostgreSQL before upgrades and test schema changes against a staging database.
- Bootstrap 5.3.3 styles are loaded from jsDelivr; retain the app stylesheet as the local visual override.

For a production 24/7 claim, also verify the hosting and database service-level agreements, configure external uptime monitoring against `/readyz`, test restart and database-outage recovery, and ensure someone is responsible for responding to alerts. Local development or a single free/sleeping web-service instance is not an always-on deployment.
