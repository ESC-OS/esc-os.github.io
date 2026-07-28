# API Reference

All routes return JSON. Auth is via `Authorization: Bearer <token>` header.
`[A]` = admin only (`requireAdmin`). `[auth]` = any authenticated user. `[profile]` = auth + complete profile + PDPA accepted.

## Response shape
- Items / lists: `{ data: ... }`
- Delete / simple actions: `{ success: true }` or `{ data: { deleted: true } }`
- Errors: `{ error: "message" }` — status 400/401/403/404/409/500

---

## Auth — `/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /auth/google | none | Redirect to Google OAuth. Query: `?from=<frontendUrl>` |
| GET | /auth/google/callback | none | Exchange code → redirect to `${frontendUrl}/auth/callback?token=<jwt>` |
| POST | /auth/logout | none | Returns `{ data: { success: true } }` (token is client-side) |

---

## Users — `/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /users | [A] | List all users. Query: `?role=user\|admin`, `?is_active=0\|1`, `?search=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /users/me | [auth] | Current user's full profile |
| PATCH | /users/me | [auth] | Update own profile. Body: `{ nickname?, year?, department?, study_group?, phone_number?, line_id?, instagram?, pdpa_accepted? }`. Sending `pdpa_accepted: false` withdraws consent — blocked if user is still a leader in any project |
| PATCH | /users/:id/role | [A] | Change role. Body: `{ role: "user"\|"admin" }` |
| PATCH | /users/:id/status | [A] | Activate/deactivate. Body: `{ is_active: 0\|1 }`. Cannot deactivate self |

**Profile completion** — `is_profile_complete` becomes 1 only when ALL of these are set: `nickname`, `year`, `department`, `study_group`, `phone_number`, `line_id`, and `pdpa_accepted`. Instagram is not required.

---

## Item Categories — `/items/categories`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /items/categories | [auth] | List all categories |
| POST | /items/categories | [A] | Create. Body: `{ code, name }` (code = exactly 2 uppercase letters) |
| PATCH | /items/categories/:code | [A] | Update name. Body: `{ name }` |
| DELETE | /items/categories/:code | [A] | Delete — blocked if any active items use this code |

---

## Items — `/items`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /items | [auth] | List active items. Query: `?category_code=`, `?search=`, `?low_stock=true`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /items/:id | [auth] | Item detail + last 10 stock logs |
| POST | /items | [A] | Create item (quantity starts at 0 — add stock separately). Body: `{ category_code, name, description?, stock_location?, unit?, image_r2_key? }` |
| PATCH | /items/:id | [A] | Update metadata only. Body: `{ name?, description?, stock_location?, unit?, image_r2_key? }` |
| DELETE | /items/:id | [A] | Soft-delete — blocked if item is in any active borrow (processing/ready_for_pickup/in_lend/returned) |

### Stock — `POST /items/:id/stock` [A]
Single endpoint for all stock actions. Body: `{ action, quantity, note? }`

| action | What it does | Blocked if |
|---|---|---|
| `add` | +qty to total + available (restock) | — |
| `remove` | -qty from total + available (disposal/lost) | qty > available |
| `send_to_repair` | available → repair | qty > available |
| `restore_from_repair` | repair → available | qty > repair |

`note` is optional for all actions.

### Stock Logs — `GET /items/:id/stock-logs` [A]
Returns full audit log for the item.

---

## Projects — `/projects`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /projects | [profile] | List projects where current user is a member. Query: `?search=`, `?page=`, `?limit=` (default 20, max 100). Response includes `leader_id`, `leader_name`, `member_count` per row + `pagination: { page, limit, total }` |
| GET | /projects/:id | [profile] | Detail (member or admin only). Includes leader info + member_count |
| POST | /projects | [profile] | Create. Body: `{ name, organization_type, description?, start_date, end_date }`. Creator auto-added as leader |
| PATCH | /projects/:id | leader or [A] | Update. Body: `{ name?, organization_type?, description?, start_date?, end_date? }` |
| DELETE | /projects/:id | leader or [A] | Delete. **Blocked only if any request is `in_lend` or `returned`**. pending/processing/ready_for_pickup tickets are auto-cancelled (stock restored). |
| GET | /projects/:id/members | [profile] | List members (includes user name, email, avatar, nickname) |
| POST | /projects/:id/members | leader or [A] | Add member. Body: `{ user_id }`. Always added as `member` role — use transfer to make someone leader |
| DELETE | /projects/:id/members/:userId | leader or [A] | Remove member. Leader leaving themselves → `leader_must_transfer_first` error. Admin removing a leader → body `{ new_leader_id }` required |
| PATCH | /projects/:id/transfer | leader or [A] | Transfer leadership. Body: `{ new_leader_id }`. Old leader → member, new person → leader |

---

## Borrow Requests — `/requests`

**All 4 fields are required at creation** — `POST /requests` is NOT a "create empty draft" call.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /requests | [profile] | List. User: own only. Query: `?status=`, `?project_id=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /requests/:id | [profile] | Detail + items + handler info (joined from processing_by) |
| POST | /requests | [profile] | Create draft. Body: `{ project_id, name }` — required. `requested_pickup_datetime` and `requested_return_datetime` are optional at creation (set via PATCH before submit) |
| POST | /requests/:id/items | [profile] | Add item to draft. Body: `{ item_id, quantity_requested }`. Returns `{ data, warnings }` |
| DELETE | /requests/:id/items/:itemId | [profile] | Remove item — **draft only** |
| PATCH | /requests/:id | [profile] | Edit draft: `{ name?, requested_pickup_datetime?, requested_return_datetime? }` — draft only |
| POST | /requests/:id/submit | [profile] | draft → pending. Requires at least 1 item + both dates set. Validates dates against slots and project range. Notifies all admins |
| PATCH | /requests/:id/process | [A] | pending → processing. Body: `{ confirmed_pickup_datetime?, admin_note? }`. Auto-sets all `quantity_approved = quantity_requested` and reserves stock |
| PATCH | /requests/:id/items/:itemId | [A] | Adjust `quantity_approved` per item — **processing only**. Body: `{ quantity_approved }`. Updates stock delta accordingly |
| PATCH | /requests/:id/assign | [A] | Assign/change handler. Body: `{ user_id }`. Works in: processing, ready_for_pickup, in_lend. Target must be an admin account |
| PATCH | /requests/:id/ready | [A] | processing → ready_for_pickup. Sets `pickup_timeout_at` = now + 7 days. Notifies requester |
| PATCH | /requests/:id/pickup | owner or [A] | ready_for_pickup → in_lend. Optional body: `{ pickup_photo_r2_key? }` |
| PATCH | /requests/:id/cancel | owner or [A] | Cancel from draft/pending/processing/ready_for_pickup. Restores stock if was processing/ready |
| POST | /requests/:id/conditions | [profile] | Submit condition report (in_lend only). Replaces any existing. Body: `{ conditions: [{ borrow_request_item_id, condition_type: "missing"\|"broken", note? }] }`. Empty array = nothing wrong |
| GET | /requests/:id/conditions | [profile] | List conditions (joined with item name) |
| GET | /requests/:id/returns | [profile] | List return submissions |
| POST | /requests/:id/returns | [profile] | Submit return (in_lend only). Body: `{ photo_r2_key, note?, all_items_ok }`. Sets status → returned. Notifies admins |

---

## Returns — `/returns`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /returns | [A] | List all. Query: `?status=pending\|confirmed` |
| GET | /returns/:id | [profile] | Detail + conditions array |
| PATCH | /returns/:id/confirm | [A] | returned → completed. Body: `{ items: [{ item_id, quantity_returned, quantity_to_repair? }] }` required. Stock: returned→available, to_repair→repair, remainder (lost) deducted from total. Notifies requester |

---

## Storage Visits — `/visits`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /visits | [profile] | List. User: own project visits only. Query: `?status=`, `?date=`, `?project_id=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /visits/:id | [profile] | Visit detail |
| POST | /visits | [profile] | Create. Body: `{ project_id, visit_date, visit_time, num_people?, borrow_request_id? }`. Validates against slots, capacity, and per-project duplicate |
| PATCH | /visits/:id/confirm | [A] | pending → confirmed. Optional body: `{ admin_note? }`. Notifies requester |
| PATCH | /visits/:id/reject | [A] | pending → rejected. Optional body: `{ admin_note? }`. Notifies requester |
| PATCH | /visits/:id/complete | [A] | confirmed → completed |
| PATCH | /visits/:id/cancel | owner or [A] | Cancel from **pending or confirmed**. Optional body: `{ admin_note? }` |

---

## Deposits — `/deposits`

**Creation is a 2-step process**: create draft (no items), then add items one by one.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /deposits | [profile] | List. User: own only. Query: `?status=`, `?project_id=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /deposits/:id | [profile] | Detail + items array |
| POST | /deposits | [profile] | Create draft. Body: `{ project_id }` only |
| PATCH | /deposits/:id | [profile] | Edit draft dates. Body: `{ deposit_date?, withdraw_date? }` |
| POST | /deposits/:id/items | [profile] | Add item to draft. Body: `{ name, quantity?, description? }` |
| DELETE | /deposits/:id/items/:itemId | [profile] | Remove item from draft |
| POST | /deposits/:id/submit | [profile] | draft → pending. Requires at least 1 item |
| PATCH | /deposits/:id/approve | [A] | pending → approved. Optional body: `{ admin_note? }` |
| PATCH | /deposits/:id/reject | [A] | pending → rejected. Optional body: `{ admin_note? }` |
| PATCH | /deposits/:id/deposit | owner | approved → deposited. Body: `{ deposit_photo_r2_key }` (required, must be pre-uploaded) |
| PATCH | /deposits/:id/complete | owner | deposited → completed. Body: `{ withdrawal_photo_r2_key }` (required, user photographs pickup) |

---

## Storage Area Requests — `/storage-areas`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /storage-areas | [profile] | List. User: own only. Query: `?status=`, `?project_id=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /storage-areas/:id | [profile] | Detail |
| POST | /storage-areas | [profile] | Create draft. Body: `{ project_id }` only |
| PATCH | /storage-areas/:id | [profile] | Edit draft dates. Body: `{ start_date?, end_date? }` |
| POST | /storage-areas/:id/submit | [profile] | draft → pending |
| PATCH | /storage-areas/:id/approve | [A] | pending → approved. Optional body: `{ admin_note? }`. Cron activates on start_date |
| PATCH | /storage-areas/:id/reject | [A] | pending → rejected. Optional body: `{ admin_note? }` |
| PATCH | /storage-areas/:id/checkout | owner | in_use → completed. Body: `{ checkout_photo_r2_key }` (required) |

---

## Donations — `/donations`

**Creation is a 2-step process**: create draft (no items), then add items. Admin reviews items individually before approving the whole request.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /donations | [profile] | List. User: own only. Query: `?status=`, `?project_id=`, `?page=`, `?limit=` (default 20, max 100). Returns `{ data, pagination: { page, limit, total } }` |
| GET | /donations/:id | [profile] | Detail + items array |
| POST | /donations | [profile] | Create draft. Body: `{ project_id }` only |
| POST | /donations/:id/items | [profile] | Add item to draft. Body: `{ item_id?, proposed_name?, proposed_description?, proposed_category_code?, quantity_donated }`. Either `item_id` or `proposed_name` required |
| DELETE | /donations/:id/items/:itemId | [profile] | Remove item from draft |
| POST | /donations/:id/submit | [profile] | draft → pending. Requires at least 1 item |
| PATCH | /donations/:id/items/:itemId | [A] | Review one item — **pending request only**. Body: `{ item_status: "approved"\|"rejected", quantity_approved? }`. `quantity_approved` required when approving |
| PATCH | /donations/:id/approve | [A] | pending → approved. **Blocked until all items reviewed** (no item_status = 'pending'). Optional body: `{ admin_note? }` |
| PATCH | /donations/:id/reject | [A] | pending → rejected. Optional body: `{ admin_note? }` |
| PATCH | /donations/:id/donate | owner | approved → donated. Body: `{ donation_date, photo_r2_key }` — both required |
| PATCH | /donations/:id/complete | [A] | donated → completed |

---

## Notifications — `/notifications`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /notifications | [auth] | Paginated inbox. Query: `?page=&limit=` (max 50). Returns `{ notifications: [...], pagination: { page, limit, total, unread } }` |
| PATCH | /notifications/:id/read | [auth] | Mark one read |
| PATCH | /notifications/read-all | [auth] | Mark all read |
| POST | /notifications/broadcast | [A] | Send to all active users. Body: `{ title, body }` |

---

## Operational Slots — `/slots`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /slots | [auth] | List. Query: `?service_type=borrow\|visit` |
| POST | /slots | [A] | Create. Body: `{ service_type, day_of_week, time, capacity?, is_active? }` |
| PATCH | /slots/:id | [A] | Update. Body: `{ capacity?, is_active? }` |
| DELETE | /slots/:id | [A] | Delete |

`day_of_week` must be: `monday`, `wednesday`, or `friday` — no other values accepted.

---

## Thai Holidays — `/holidays`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /holidays | [auth] | List. Query: `?year=2026` |
| POST | /holidays | [A] | Add. Body: `{ date, name }` (date = YYYY-MM-DD) |
| DELETE | /holidays/:id | [A] | Remove |

---

## Calendar — `/calendar`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /calendar | [A] | Admin overview — upcoming borrows + visits |

---

## Status — `/status`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /status | [auth] | Summary counts. Admin sees all; user sees own |

---

## Upload — `/upload`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /upload/presign | [auth] | Get an R2 key. Returns `{ data: { r2Key, uploadPath } }` |
| PUT | /upload/photo/:key | [auth] | Upload image binary (max 10 MB, Content-Type: image/*) |
| GET | /upload/photo/:key | [auth] | Serve photo from R2 |
