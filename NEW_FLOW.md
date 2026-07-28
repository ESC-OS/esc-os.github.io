# Faculty Storage API — New Flow Design

---

## Table of Contents
1. [Registration & Account Setup](#1-registration--account-setup)
2. [Project Creation](#2-project-creation)
3. [Project Dashboard](#3-project-dashboard)
4. [Borrow-Return Service](#4-borrow-return-service)
5. [Storage Visit Reservation](#5-storage-visit-reservation)
6. [Temporary Deposit](#6-temporary-deposit)
7. [Request for Storage Area](#7-request-for-storage-area)
8. [Donate Stuff](#8-donate-stuff)
9. [Admin Dashboard](#9-admin-dashboard)
10. [Policies](#10-policies)
11. [Project Behavior History](#11-project-behavior-history)
12. [Remaining Open Questions](#12-remaining-open-questions)

---

## 1. Registration & Account Setup

### Flow
1. User clicks "Sign in with Google"
2. Google OAuth 2.0 callback → account created in DB with `role = 'user'`, `is_profile_complete = false`
3. User is redirected to profile setup page
4. User fills out personal information + accepts PDPA
5. On submit → `is_profile_complete = true`, `pdpa_accepted = <current timestamp>`
6. User can now access the service

### Access Gate Rules
- `is_profile_complete = false` → **blocked from all endpoints** except the profile setup endpoint
- `pdpa_accepted IS NULL` → **cannot submit** the profile form (required checkbox)
- Profile setup endpoint must bypass the `is_profile_complete` middleware check
- JWT is issued before profile is complete — gate is enforced at **middleware level**, not auth level
- Profile is **editable after setup** via a PATCH endpoint

### Profile Fields (new columns on `users` table)
| Field               | Type    | Required | Notes |
|---------------------|---------|----------|-------|
| nickname            | TEXT    | yes      | |
| year                | INTEGER | yes      | 1–6 |
| department          | TEXT    | yes      | fixed dropdown — 18 Chula Engineering departments (see list below) |
| study_group         | TEXT    | yes      | A–T excluding I and O |
| phone_number        | TEXT    | yes      | |
| line_id             | TEXT    | yes      | |
| instagram           | TEXT    | no       | optional |
| pdpa_accepted       | TEXT    | yes      | timestamp — NULL = not accepted, datetime = accepted at |
| is_profile_complete | INTEGER | —        | 0/1 — set to 1 on successful form submit |

`study_group` CHECK constraint: `IN ('A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T')`

### Department Values (fixed list — 18 departments)
| Thai | English |
|------|---------|
| ภาควิชาวิศวกรรมคอมพิวเตอร์ | Computer Engineering |
| ภาควิชาวิศวกรรมนิวเคลียร์ | Nuclear Engineering |
| ภาควิชาวิศวกรรมเคมี | Chemical Engineering |
| ภาควิชาวิศวกรรมเครื่องกล | Mechanical Engineering |
| ภาควิชาวิศวกรรมไฟฟ้า | Electrical Engineering |
| ภาควิชาวิศวกรรมโยธา | Civil Engineering |
| ภาควิชาวิศวกรรมโลหการ | Metallurgical Engineering |
| ภาควิชาวิศวกรรมสำรวจ | Survey Engineering |
| ภาควิชาวิศวกรรมสิ่งแวดล้อมและความยั่งยืน | Environmental and Sustainable Engineering |
| ภาควิชาวิศวกรรมเหมืองแร่และปิโตรเลียม | Mining and Petroleum Engineering |
| ภาควิชาวิศวกรรมแหล่งน้ำ | Water Resources Engineering |
| ภาควิชาวิศวกรรมอุตสาหการ | Industrial Engineering |
| วิศวกรรมอากาศยาน | Aerospace Engineering (AERO) |
| วิศวกรรมนาโน | Nano Engineering (NANO) |
| วิศวกรรมสารสนเทศและการสื่อสาร | Information & Communication Engineering (ICE) |
| วิศวกรรมการออกแบบและการผลิตยานยนต์ | Automotive Design and Manufacturing Engineering (ADME) |
| วิศวกรรมหุ่นยนต์และปัญญาประดิษฐ์ | Robotics and Artificial Intelligence Engineering |
| วิศวกรรมทั่วไป | General Engineering |

### Role Assignment
- OAuth registration always assigns `user` role
- `admin` role is promoted manually by an existing admin after account creation

### DB Impact
- New migration: add profile fields + `is_profile_complete` to `users` table
- **Wipe entire DB** before launching (not just users — borrow_requests, projects, notifications, etc. all FK-reference users)

---

## 2. Project Creation

### Flow
1. User arrives at main dashboard
2. Creates a project — auto-assigned as `leader`
3. Project is immediately active (no approval step)
4. Members can be added after creation

### Fields
| Field             | Type | Required | Notes |
|-------------------|------|----------|-------|
| name              | TEXT | yes      | |
| organization_type | TEXT | yes      | fixed dropdown — CHECK constraint at DB level |
| description       | TEXT | no       | optional |
| start_date        | TEXT | yes      | |
| end_date          | TEXT | yes      | must be after start_date |

### Organization Type Values
`ESC: พัฒนาองค์กร` · `ESC: การเงิน` · `ESC: เลขานุการ` · `ESC: เทคโนโลยี` · `ESC: ประชาสัมพันธ์และการตลาด` · `ESC: วิชาการ` · `ESC: กิจการภายใน` · `ESC: กิจการภายนอก` · `ESC: นิสิตสัมพันธ์` · `ESC: CSR` · `ESC: Sustain` · `ESC: OS` · `ชมรม` · `โครงการ` · `ภาค` · `Group`

### DB Impact
- Drop `purpose TEXT NOT NULL` → replace with `organization_type TEXT NOT NULL` (with CHECK constraint)

---

## 3. Project Dashboard

### Available Actions
| Action | Notes |
|--------|-------|
| Create borrow ticket | starts borrow-return flow |
| Reserve a storage visit | book physical visit to storage |
| Create temporary deposit | deposit own items |
| Request storage area | reserve a storage space |
| Donate stuff | donate items to inventory |
| Edit project detail | leader or admin only |
| Delete project | blocked if **any service ticket in the project is still active/ongoing** |
| Add member | leader or admin only |
| Transfer manager | leader or admin only |
| Leave project | members only — leader cannot leave without transferring first |

### Transfer Manager
- Old leader → becomes `member`
- Target member → promoted to `leader`
- Triggered by: **leader or admin**
- Borrow tickets stay linked to original requester (no reassignment)
- **Admin can also forcefully remove any member**, including the leader
  - If removing the leader: admin must designate a replacement leader in the same request

### Leave Project
- Members can leave freely
- **Leader cannot leave** — must transfer leadership first, then leave as a member
- Borrow tickets the user created remain in the system after they leave

### DB Design — Leadership
- Keep `projects.owner_id` as original creator (audit trail only)
- `project_members.role = 'leader'` is the **source of truth** for who currently manages the project
- All permission checks must use `project_members.role`, not `projects.owner_id`

### Ticket View — 4 Tabs
| Tab | Statuses shown | Notes |
|-----|----------------|-------|
| Draft | `draft`, `pending` | |
| Prepare | `processing`, `ready_for_pickup` | |
| Borrow | `in_lend` | overdue tickets show here too — overdue is a visual flag, not a separate status |
| Returned | `returned`, `completed` | |

- `cancelled` and `rejected` tickets are **hidden** from all tabs

---

## 4. Borrow-Return Service

### Step 1 — Create Ticket (Draft)
| Field | Required | Notes |
|-------|----------|-------|
| ticket name | yes | |
| project | yes | must be a project the user is a member of |

### Step 2 — Browse Items (Shopping Cart)
- User browses inventory and adds items to the ticket
- Can add quantity beyond available stock → **warning shown, but allowed**
- Can remove items freely
- Status: `draft`

### Step 3 — Confirm & Submit
- User hits confirm → fills in **pickup date** and **return date**
- Pickup date must be on an operational slot (Mon / Wed / Fri at 12:30 or 16:30) unless admin changes it
- Both dates must fall within the **project's start/end dates** (applies to all services linked to a project)
- Return must be after pickup
- Return date more than **7 calendar days** after pickup → **warning shown** (not blocked — admin decides at processing)
- On submit → status immediately becomes **`pending`** (admin notified)

### Editing & Cancellation Rules
| Status | User can edit? | User can cancel? |
|--------|---------------|-----------------|
| `draft` | yes — all fields | yes (delete ticket) |
| `pending` | no | yes → **reverts to `draft`** |
| `processing`+ | no | no — must contact admin |

- Admin can cancel tickets that have been **submitted** (`pending` or beyond) — not drafts
- If admin cancels a ticket in `processing` or `ready_for_pickup` → **stock is restored** (quantity_approved returned to available)

### Admin Processing Flow
1. Admin sees new ticket notification (status: `pending`)
2. Admin hits **Process** → status: `processing`
3. Admin reviews each item:
   - Can **reject** individual items (set quantity_approved = 0)
   - Can **reduce quantity** to match available stock
4. Admin reviews pickup date — can change if needed
5. Admin hits **Confirm** → status: `ready_for_pickup` (user notified)
   - If **all items were rejected** → ticket **auto-cancelled** instead
6. 7-day pickup window starts — if user doesn't pick up → **auto-cancelled** by cron

### Pickup
- User or admin hits **Pick Up** + takes a photo
- Photo stored in R2 (`pickup_photo_r2_key`) — reference only, no admin confirmation needed
- Status → `in_lend` immediately

### Pre-Return Condition Report (required before return)
- User selects items from the ticket that are **missing** or **broken** (like a cart)
- If nothing wrong → user ticks **"nothing is missing/broken"**
- Informational only — does not affect the flow
- Admin uses this for backstage follow-up

### Return
- User hits **Return** + takes a photo
- Status → `returned` (admin notified)
- Admin confirms → stock restored → status: `completed`
- **No in-app return rejection** — issues handled outside the app

### Overdue
- Not a separate status — just a **flag + notification** sent to the user when return date passes while still `in_lend`
- Flow continues normally (user still submits return the same way)

### Status Flow Summary
```
draft → pending → processing → ready_for_pickup → in_lend → returned → completed
         ↑           ↓               ↓
      (cancel   (all rejected    (7-day timeout
      → draft)   → cancelled)     → cancelled)
```
- `overdue` is a flag on `in_lend`, not a separate status step

### DB Changes from Current System
| Change | Details |
|--------|---------|
| `is_prepared` flag | **removed** (ticking step merged into confirm) |
| `PATCH /requests/:id/ready` | **removed** (merged into confirm step) |
| `PATCH /requests/:id/items/:itemId/tick` | **removed** |
| `PATCH /returns/:id/reject` | **removed** (no in-app return rejection) |
| `return_submissions.status` | remove `rejected` value — only `pending` and `confirmed` |
| `pickup_photo_r2_key` | **new field** on `borrow_requests` |
| New table: `return_item_conditions` | `id`, `return_submission_id` FK, `borrow_request_item_id` FK, `condition_type` CHECK IN ('missing','broken'), `note` TEXT nullable, `created_at` |
| `all_items_ok` flag | **new field** on `return_submissions` (true when user ticks "nothing is missing") |
| `overdue` status value | **removed** from `borrow_requests` status CHECK constraint |
| `is_overdue` flag | **new field** on `borrow_requests` — `INTEGER DEFAULT 0`, set to 1 by cron when return date passes while `in_lend` |

---

## 5. Storage Visit Reservation

### Purpose
- Users book a physical visit to storage to inspect items before borrowing
- **Required (by policy)** if a borrow ticket has >50 distinct item types — not a hard block, but admin sees a flag

### Two Modes
| Mode | Linked to |
|------|-----------|
| Standalone | Project only |
| Ticket-linked | Project + specific borrow ticket (when >50 item types) |

### The 50-Item Policy
- Threshold: >50 **distinct item types** in a ticket (not total quantity)
- No confirmed visit → admin sees a warning flag when processing that ticket
- Admin can reject the ticket based on this — policy decision, not automatic

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| project | yes | parent project |
| borrow ticket | no | only if ticket-linked mode |
| date | yes | must be an available operational slot |
| time | yes | 16:30 only (or admin-overridden time) |
| number of people | yes | used for 5-person capacity check |

### Booking Flow
1. User picks from available operational slots (Mon / Wed / Fri at 16:30)
2. Reservation submitted → admin reviews
3. Admin sees **current confirmed headcount for that slot** (e.g. "3/5 people confirmed")
4. Admin approves or rejects — admin enforces the 5-person cap

### Capacity Rule
- Max **5 people total** per time slot across all projects
- Multiple projects can share a slot as long as combined headcount ≤ 5
- No hard block at submission — admin decides at approval

### Status Flow
| Status | Triggered by | Notes |
|--------|-------------|-------|
| `pending` | user submits | |
| `confirmed` | admin approves | |
| `rejected` | admin rejects | user can rebook on a different slot |
| `completed` | admin marks after visit | confirms user actually attended |
| `cancelled` | admin marks after visit | user was a no-show → **project behavior incident logged** |

- User can have **multiple active visit reservations** per project

### DB Impact
- New table: `storage_visits` (id, project_id, borrow_request_id nullable, requester_id, visit_date, visit_time, num_people, status, ...)

---

## 6. Temporary Deposit

### Purpose
Users temporarily deposit their own items into the storage facility under a project name.

### Rules
- Must be tied to a **project**
- Both deposit and withdraw dates must fall within the **project's start/end dates**
- Maximum **7 Thai working days** (Mon–Fri, excluding Thai public holidays)
- Withdraw date must be within 7 working days of deposit date

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| project | yes | parent project |
| stuff list | yes | multiple items — see structure below |
| deposit date | yes | |
| withdraw date + time | yes | max 7 Thai working days from deposit date |

**Stuff list per item:** `name` (required) · `quantity` (required) · `description` (optional)

### Status Flow
| Status | Triggered by | Notes |
|--------|-------------|-------|
| `draft` | user creates | editable, not yet submitted |
| `pending` | user submits | |
| `approved` | admin approves | admin's only action — done after this |
| `rejected` | admin rejects | **permanently rejected** — no revert to draft |
| `deposited` | user brings items + takes photo | reference only, no admin confirm |
| `completed` | user collects items + takes photo | reference only, no admin confirm |

### Notifications
- 1 day before `withdraw_date` → **notify user** to collect items
- If user doesn't withdraw → handled outside the app

### DB Impact
- New table: `deposit_requests` (id, project_id, requester_id, deposit_date, withdraw_date, status, deposit_photo_r2_key, withdrawal_photo_r2_key, ...)
- New table: `deposit_request_items` (id, deposit_request_id, name, quantity, description nullable)
- Cron: notify user 1 day before `withdraw_date`
- Uses `thai_holidays` table for working day calculation

---

## 7. Request for Storage Area

### Purpose
User requests a dedicated physical storage space for their project (no item list — just the space).

### Rules
- Must be tied to a **project**
- Both start and end dates must fall within the **project's start/end dates**
- Maximum **30 calendar days**
- End date must be within 30 days of start date

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| project | yes | parent project |
| start date | yes | |
| end date | yes | max 30 calendar days from start |

### Status Flow
| Status | Triggered by | Notes |
|--------|-------------|-------|
| `draft` | user creates | editable, not yet submitted |
| `pending` | user submits | |
| `approved` | admin approves | admin's only action |
| `rejected` | admin rejects | **permanently rejected** — no revert to draft |
| `in_use` | cron job on start date | auto-transitions from `approved` |
| `completed` | user check-out + takes photo | photo proves area was cleaned, no admin confirm |

### Notifications
- 1 day before `end_date` → notify user to vacate and clean the area

### DB Impact
- New table: `storage_area_requests` (id, project_id, requester_id, start_date, end_date, status, checkout_photo_r2_key, ...)
- Cron: auto-move `approved` → `in_use` on start date
- Cron: notify user 1 day before end date

---

## 8. Donate Stuff

### Purpose
Projects donate leftover items to the faculty storage inventory when they no longer need them.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| project | yes | parent project |
| item list | yes | multiple items — see structure below |
| date of donation | yes | |

**Item list per entry:** `item` (select existing from inventory OR describe new) · `quantity`

### Admin Approval (Partial)
- Admin reviews each item individually:
  - **Approve or reject** per item
  - **Reduce quantity** per item
- Admin rechecks and adjusts the item matching (existing item or new item creation)
- If **all items rejected** → whole request moves to `rejected` status (permanently)

### Inventory Impact on Approval
- Existing item selected: `total_quantity += quantity_approved`, `available_quantity += quantity_approved`
- New item described: a new `items` record is **created** on approval (proposed items do not enter inventory until admin approves)

### Status Flow
| Status | Triggered by | Notes |
|--------|-------------|-------|
| `draft` | user creates | editable, not yet submitted |
| `pending` | user submits | |
| `approved` | admin approves (partial or full) | |
| `rejected` | admin rejects all items | **permanently rejected** — no revert to draft |
| `donated` | user drops off items + takes photo | reference only, no admin confirm |
| `completed` | auto after drop-off photo | |

### DB Impact
- New table: `donation_requests` (id, project_id, requester_id, donation_date, status, photo_r2_key, ...)
- New table: `donation_request_items` (id, donation_request_id, item_id FK nullable, proposed_item_name, proposed_item_category, quantity_donated, quantity_approved, item_status CHECK IN ('pending','approved','rejected'))
- On approval: update existing `items` records or create new ones

---

## 9. Admin Dashboard

### Overview Stats Panel
Top-of-dashboard summary cards:
- Pending requests waiting for action
- Overdue borrows (items not returned)
- Items low on stock
- Today's scheduled pickups

### Calendar
- Single view showing **all events** across all services
- Events: borrow pickups, borrow return dates, storage visits, deposit date ranges, storage area date ranges, donation dates
- **Backend** filters by date range (`GET /admin/calendar?from=&to=`) — returns events with a `type` field
- **Frontend** filters by event type (toggling — no extra API calls)

### All Requests
- Unified queue: borrow tickets, deposit, storage area, donation, visit reservations
- Shows `pending` for all service types + `processing` for **borrow tickets only** (other services have no processing step)
- Sorted: newest first
- Click → opens full project dashboard view (same endpoint, admin sees everything)

### All Returns
- Queue of **borrow ticket** returns pending admin confirmation only
- Other services (deposit, storage area, donation) handle photos as self-service — **admin** receives a notification when a photo is submitted but no action required in this queue
- Sorted: newest first
- Click → opens same project dashboard view

### All Visits
- Shows two groups:
  - **Pending** — visit reservations waiting for admin approval
  - **Confirmed** — upcoming confirmed visits where admin needs to mark attendance (`completed` or `cancelled`) after the visit date
- Sorted: newest first
- Click → opens same project dashboard view

### Storage Management
- View all inventory items
- Actions: add item, edit item, soft-delete item, adjust quantity
- Quantity actions: **add / remove / send to repair / restore from repair** (all with audit log)
- **Delete blocked** if item is in any active use — even admin cannot override

### User Management
- View all users
- **Ban** (`is_active = false`) or **Unban** (`is_active = true`) any user
- Change any user's role: `user` / `admin` only

### Overdue Tracker
- Dedicated list of all borrow tickets in `in_lend` status where `requested_return_datetime < now` — for easy admin follow-up

### Low Stock Alerts
- Items flagged when `available_quantity` falls below a configurable threshold
- Warnings shown when approving requests that would deplete stock

### Operational Slots Management
- Admin creates / edits available time slots for both **borrow pickup** and **storage visit** services
- Single shared table with `service_type` column — one admin interface for both
- DB: `operational_slots` (id, `service_type` CHECK IN ('borrow','visit'), `day_of_week` CHECK IN ('monday','wednesday','friday'), `time` TEXT, `capacity` INTEGER nullable — NULL = no limit, `is_active` INTEGER DEFAULT 1, created_at, updated_at)
- Default borrow slots: Mon/Wed/Fri at 12:30 and 16:30 (capacity NULL)
- Default visit slots: Mon/Wed/Fri at 16:30 only (capacity 5)

### Thai Holiday Management
- Admin adds / removes Thai public holidays
- Used by 7-working-day calculation in Temporary Deposit
- DB: new table `thai_holidays` (id, date, name)

### Export / Report
- Download CSV of requests, returns, user data, stock logs
- Filterable by date range and service type

### Broadcast Notification
- Admin sends in-app notification to all users or a filtered group (by role, department, year, etc.)
- Implemented as bulk insert into `notifications` table

---

## 10. Policies

### Borrow-Return Service
| Rule | Value |
|------|-------|
| Default pickup slots | Mon / Wed / Fri at **12:30** or **16:30** |
| Admin override | Any date/time allowed |
| Minimum lead time | Submit at least **3 Thai working days** before pickup |
| Max advance booking | Pickup must be within **30 calendar days** of submission date |
| Max borrow duration | **7 calendar days** — if exceeded, flagged → admin decides |

### Storage Visit Service
| Rule | Value |
|------|-------|
| Default operational days | Mon / Wed / Fri at **16:30 only** |
| Admin override | Any date/time allowed |
| Capacity per slot | Max **5 people total** across all projects |
| Cap enforcement | Admin enforces at approval — no hard block at submission |

### Other Services
Temporary deposit, storage area, and donation have **no additional policies** beyond their own date/duration rules.

---

## 11. Project Behavior History

### Purpose
A log of policy violations and incidents per project — admin reads this when reviewing requests to understand if the project has a history of not following rules. **No automated scoring or blocking** — purely informational for admin judgment.

### Incidents That Are Logged
| Incident | Triggered by |
|----------|-------------|
| Late return | Borrow ticket return date passed while still `in_lend` |
| Policy violation | Borrow ticket with >50 item types submitted without a confirmed visit |
| No-show visit | Confirmed storage visit marked `cancelled` by admin (user didn't attend) |

### How It Works
- Each incident is automatically recorded when it occurs
- Admin views the project's behavior history when processing any request
- Admin uses the history to make judgment calls (e.g. be stricter, reject outright, require extra documentation)
- No automated effects — admin decides what action to take

### DB Impact
- New table: `project_incidents` (id, project_id, type CHECK IN ('late_return','policy_violation','no_show_visit'), reference_id, reference_type, note, created_at)

---

## 12. Remaining Open Questions

These require answers before implementation:

### Registration
- [x] `year` range: **1–6**
- [x] `department`: **fixed dropdown** — 18 Chula Engineering faculty departments (see profile fields section)
- [x] PDPA withdrawal: user must **transfer leader role in all projects** they lead first → on withdrawal `pdpa_accepted` cleared → access blocked immediately → re-accepting PDPA restores access without redoing full profile setup
- [x] `pdpa_accepted`: store as **timestamp** (nullable) instead of 0/1 — `NULL` = not accepted, timestamp = accepted at that datetime

### Storage Visit
- [x] Admin marks attendance after visit: `completed` (attended) or `cancelled` (no-show → behavior incident)
- [x] If admin rejects, user can rebook on a different slot
- [x] User can have multiple active visit reservations per project

### Deposit & Storage Area
- [x] Deposit and storage area dates **must fall within the project's start/end dates**

### Staff Role
- [x] **Dropped** — only two roles: `user` and `admin`
- DB: remove `staff` from `role` CHECK constraint → `CHECK (role IN ('user', 'admin'))`
- All endpoints that previously allowed `staff` now require `admin`

### Operational Slots
- [x] **Shared `operational_slots` table** with `service_type` column — one admin interface for both borrow and visit
