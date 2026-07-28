# Frontend Integration Guide

Reference files:
- `04-api-reference.md` — all endpoints, request/response shapes
- `FLOWS.md` — full user/admin flows and business rules

---

## Auth Setup

### Login flow
1. Button redirects to `GET /auth/google?from=<current frontend URL>`
2. After OAuth, backend redirects to `/auth/callback?token=<jwt>`
3. Frontend reads `?token=` from URL → stores in `localStorage` (or memory)
4. All API requests send `Authorization: Bearer <token>` header
5. On logout, clear the token and redirect to `/login`

### Token expiry
JWT expires after 7 days. On any `401` response → clear token → redirect to `/login`.

---

## Profile Gate

After login, call `GET /users/me`. Check the response:

```
is_profile_complete = 0  →  redirect to /profile/setup
pdpa_accepted = null     →  show PDPA checkbox on the setup form (must accept to submit)
```

Profile setup form fields (all required for profile completion except instagram):
- `nickname` (ชื่อเล่น) — required
- `year` — integer 1–6 — required
- `department` — dropdown (Thai department name list) — required
- `study_group` — dropdown A–T (no I, no O) — required
- `phone_number` — required
- `line_id` — required
- `instagram` — optional (not required for completion)
- PDPA acceptance checkbox — **required, cannot submit without it**

`PATCH /users/me` to save. `is_profile_complete` becomes `1` only when all required fields above are filled and `pdpa_accepted` is set.

---

## Pages & Features

### 1. Dashboard / Home
- `GET /status` — show summary counts (pending tickets, overdue, etc.)
- Quick links to active tickets and upcoming visits

---

### 2. Profile
- `GET /users/me` — load current profile
- `PATCH /users/me` — edit profile fields

---

### 3. Projects

**List page** — `GET /projects`

**Create form** — `POST /projects`
- Fields: `name`, `organization_type` (dropdown), `description` (optional), `start_date`, `end_date`

**Project detail page** — `GET /projects/:id`
- Show project info + members list

| Action | Who sees it | API |
|---|---|---|
| Edit project | leader / admin | `PATCH /projects/:id` |
| Delete project | leader / admin | `DELETE /projects/:id` — blocked only if any ticket is `in_lend` or `returned`; other tickets are auto-cancelled |
| Add member | leader / admin | `POST /projects/:id/members` with `{ user_id }` — always adds as `member` |
| Transfer leader | leader / admin | `PATCH /projects/:id/transfer` with `{ new_leader_id }` — old leader becomes member |
| Remove member | leader / admin | `DELETE /projects/:id/members/:userId` — if admin removes a leader, body `{ new_leader_id }` required |
| Leave project | member (not leader) | `DELETE /projects/:id/members/:myUserId` — leader gets `leader_must_transfer_first` error |

---

### 4. Borrow Requests

**List page** — `GET /requests?status=`
- Show `is_overdue` badge on in_lend tickets past due date

**Create form** — `POST /requests`

Only `name` and `project_id` are required at creation:
- `name` — ticket name
- `project_id`

Dates are **not** required here — the user fills them at the submit step.

After creating, the request is in `draft` status. User then:
- `POST /requests/:id/items` — add items `{ item_id, quantity_requested }`. Warns but doesn't block if qty > stock.
- `DELETE /requests/:id/items/:itemId` — remove item (**draft only**)
- `PATCH /requests/:id` — edit name or dates (**draft only**)

Then at submit — show a form to fill in dates before calling `POST /requests/:id/submit`:
- `PATCH /requests/:id` to save `{ requested_pickup_datetime, requested_return_datetime }`
- Call `GET /slots?service_type=borrow` to build the picker (Mon/Wed/Fri 12:30 or 16:30)
- Call `GET /holidays?year=` to disable public holidays
- Then `POST /requests/:id/submit` — validates dates against slots, project range, and return > pickup

**Ticket detail page** — `GET /requests/:id`

Show action buttons based on `status`:

| Status | User actions | Admin actions |
|---|---|---|
| draft | Edit name/dates, add/remove items, Submit | — |
| pending | Cancel (`PATCH /:id/cancel`) | Process (`PATCH /:id/process`) |
| processing | (read only) | Adjust qty per item (`PATCH /:id/items/:itemId`), Assign handler (`PATCH /:id/assign`), Ready (`PATCH /:id/ready`), Cancel |
| ready_for_pickup | Pickup (`PATCH /:id/pickup`) | Pickup (`PATCH /:id/pickup`), Cancel |
| in_lend | Submit Conditions + then Return | Assign handler (`PATCH /:id/assign`) |
| returned | — | Confirm Return (`PATCH /returns/:id/confirm`) |
| completed / cancelled | read only | — |

**Admin: process step**
`PATCH /requests/:id/process` with `{ confirmed_pickup_datetime?, admin_note? }` — the API auto-approves all items at `quantity_requested`. Admin then adjusts each item individually via `PATCH /requests/:id/items/:itemId` with `{ quantity_approved }` (0 = reject item).

**Condition report** (required before return)
- `GET /requests/:id/conditions` — check if already submitted
- `POST /requests/:id/conditions` with `{ conditions: [{ borrow_request_item_id, condition_type, note? }] }`
- If nothing is wrong, send `conditions: []` (empty array)

**Return submission**
1. Upload photo: `POST /upload/presign` → `PUT /upload/photo/:r2Key`
2. `POST /requests/:id/returns` with `{ photo_r2_key, note?, all_items_ok }` (1 = nothing missing/broken)

**Admin: confirm return**
`PATCH /returns/:id/confirm` requires `{ items: [{ item_id, quantity_returned, quantity_to_repair? }] }` for every item in the request. The backend calculates any missing quantity as "lost" and deducts it from total stock.

---

### 5. Storage Visits

**List page** — `GET /visits?status=` (also supports `?date=` and `?project_id=`)

**Create form** — `POST /visits`
- `GET /slots?service_type=visit` to build date/time picker (Mon/Wed/Fri 16:30 by default)
- `GET /holidays?year=` to disable public holidays
- Fields: `project_id`, `visit_date`, `visit_time`, `num_people` (optional, default 1), `borrow_request_id` (optional)

**Visit detail** — `GET /visits/:id`

| Status | User actions | Admin actions |
|---|---|---|
| pending | Cancel (`PATCH /:id/cancel`) | Confirm (`PATCH /:id/confirm`), Reject (`PATCH /:id/reject`) |
| confirmed | Cancel (`PATCH /:id/cancel`) | Complete (`PATCH /:id/complete`) |
| rejected | (rebook allowed) | — |
| completed / cancelled | read only | — |

Note: cancel works from both `pending` and `confirmed`.

---

### 6. Temporary Deposits

**List page** — `GET /deposits`

**Create flow (2 steps)**

Step 1: `POST /deposits` with `{ project_id }` → creates empty draft

Step 2 (draft editing):
- `PATCH /deposits/:id` — set `deposit_date`, `withdraw_date`
- `POST /deposits/:id/items` — add item `{ name, quantity?, description? }`
- `DELETE /deposits/:id/items/:itemId` — remove item

Step 3: `POST /deposits/:id/submit`

**Deposit detail** — `GET /deposits/:id`

| Status | Who | Action | API |
|---|---|---|---|
| draft | user | Edit dates, add/remove items, Submit | — |
| pending | admin | Approve | `PATCH /:id/approve` |
| pending | admin | Reject | `PATCH /:id/reject` |
| approved | user | Upload deposit photo → mark deposited | `PATCH /:id/deposit` with `{ deposit_photo_r2_key }` |
| deposited | user | Upload withdrawal photo → complete | `PATCH /:id/complete` with `{ withdrawal_photo_r2_key }` |
| completed / rejected | — | read only | — |

**Note:** The `complete` action (pickup of items) is done by the **user**, not admin.

---

### 7. Storage Area Requests

**List page** — `GET /storage-areas`

**Create flow**

Step 1: `POST /storage-areas` with `{ project_id }` → creates empty draft

Step 2: `PATCH /storage-areas/:id` — set `start_date`, `end_date`

Step 3: `POST /storage-areas/:id/submit`

**Detail** — `GET /storage-areas/:id`

| Status | Who | Action | API |
|---|---|---|---|
| draft | user | Edit dates, Submit | — |
| pending | admin | Approve | `PATCH /:id/approve` |
| pending | admin | Reject | `PATCH /:id/reject` |
| approved | — | Waiting for cron (activates on start_date) | — |
| in_use | user | Upload checkout photo → complete | `PATCH /:id/checkout` with `{ checkout_photo_r2_key }` |
| completed / rejected | — | read only | — |

---

### 8. Donations

**List page** — `GET /donations`

**Create flow (2 steps)**

Step 1: `POST /donations` with `{ project_id }` → creates empty draft

Step 2 (draft editing):
- `POST /donations/:id/items` — add item `{ item_id?, proposed_name?, proposed_description?, proposed_category_code?, quantity_donated }`. Either `item_id` or `proposed_name` required.
- `DELETE /donations/:id/items/:itemId` — remove item

Step 3: `POST /donations/:id/submit`

**Donation detail** — `GET /donations/:id`

| Status | Who | Action | API |
|---|---|---|---|
| draft | user | Add/remove items, Submit | — |
| pending | admin | Review each item | `PATCH /:id/items/:itemId` with `{ item_status, quantity_approved? }` |
| pending | admin | Approve all (after all items reviewed) | `PATCH /:id/approve` — blocked until no item has status 'pending' |
| pending | admin | Reject all | `PATCH /:id/reject` |
| approved | user | Upload photo + set donation date | `PATCH /:id/donate` with `{ donation_date, photo_r2_key }` |
| donated | admin | Confirm received | `PATCH /:id/complete` |
| completed / rejected | — | read only | — |

---

### 9. Notifications

**Inbox page** — `GET /notifications?page=&limit=`
- Response: `{ notifications: [...], pagination: { page, limit, total, unread } }`
- Use `pagination.unread` for the badge count
- `PATCH /notifications/:id/read` — mark one read
- `PATCH /notifications/read-all` — mark all read

---

## Admin-Only Pages

### Admin: Returns Queue
- `GET /returns?status=pending` — list pending returns
- `GET /returns/:id` — detail + conditions array + photo
- `PATCH /returns/:id/confirm` with `{ items: [{ item_id, quantity_returned, quantity_to_repair? }] }` for every item

### Admin: Users
- `GET /users` — list all users
- `PATCH /users/:id/role` — change role
- `PATCH /users/:id/status` — activate / deactivate

### Admin: Items & Stock
- `GET /items/categories` + `POST /items/categories` + `PATCH /items/categories/:code` + `DELETE /items/categories/:code`
- `GET /items?search=&category_code=&low_stock=true`
- `POST /items` — creates item with **quantity = 0**, then add stock separately
- `PATCH /items/:id` — metadata only (no quantity fields)
- Stock: `POST /items/:id/stock` with `{ action: "add"|"remove"|"send_to_repair"|"restore_from_repair", quantity, note? }`
- `GET /items/:id/stock-logs`

### Admin: Calendar
- `GET /calendar`

### Admin: Operational Slots
- `GET /slots` / `POST /slots` / `PATCH /slots/:id` / `DELETE /slots/:id`
- `day_of_week` values: `monday`, `wednesday`, `friday` only

### Admin: Thai Holidays
- `GET /holidays?year=` / `POST /holidays` / `DELETE /holidays/:id`

### Admin: Broadcast
- `POST /notifications/broadcast` with `{ title, body }`

---

## Photo Upload (shared util)

Used for: return photo, deposit photo, withdrawal photo, checkout photo, donation photo, pickup photo.

```
1. POST /upload/presign        → { data: { r2Key, uploadPath } }
2. PUT  /upload/photo/:r2Key   with binary image, Content-Type: image/*  (max 10 MB)
3. Include r2Key in the submit call
```

To display: `GET /upload/photo/:r2Key` returns the image directly.

---

## Key UI Rules

- **All service dates** must fall within the linked project's `start_date` / `end_date`
- **Borrow pickup/return**: must be a Mon/Wed/Fri slot from `GET /slots?service_type=borrow`; disable Thai holidays
- **Visit date/time**: must be from `GET /slots?service_type=visit`; disable Thai holidays
- **`is_overdue`** is a display flag only — show a warning badge, the ticket still flows normally
- **Return confirm** requires per-item quantities — admin must specify how many were returned good vs. damaged
- **Deposit complete** (withdrawal) is done by the user, not admin
- **Donations**: admin reviews items one by one first, then approves the whole request — the approve button should be disabled until all items have been reviewed
- **Creating items** always starts with 0 quantity — stock must be added via the stock endpoint
- **Notifications response** uses `{ notifications, pagination }` not `{ data }`
