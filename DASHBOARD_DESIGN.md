# Operation Support — Full Page Design Spec

Design language: sidebar nav + topbar + footer (already built). Crimson primary (#7b1728).
All pages use `requireAuth()`. Forms use native `<select>` wrapped by custom CS component.
No emojis. Status always shown as colored `.badge`. Timestamps in Thai locale.

---

## Popup / Modal Forms Rule

Short forms (≤ 4 fields) open as a modal overlay on the parent list page — no separate page navigation needed. The HTML page still exists but only contains a redirect script.

| Form page | Approach | Fields |
|---|---|---|
| visit-form.html | **Modal on visits.html** | project, slot date, num_people, optional request |
| storage-area-form.html | **Modal on storage-areas.html** | project, start date, end date |
| project-form.html | Own page (5 fields + description) | name, org_type, description, start_date, end_date |
| deposit-form.html | Own page (item list) | project, dates, + item list |
| donation-form.html | Own page (item list) | project, date, + item list |
| new-request.html | Own page (multi-step + items) | multi-step flow |

---

## Global Patterns

### renderNavbar requirement
Every page that shows the sidebar **must** call `renderNavbar(user, unread)` from `../ui.js` after `requireAuth()` resolves. The `unread` count comes from `getNotifications(1, 1)` → `pagination.unread`. Pages without sidebar (login, auth-callback) do NOT call renderNavbar.

### Status badge colors (already in CSS)
| Status | Color meaning |
|---|---|
| draft / pending | amber — waiting |
| processing | blue — in progress |
| ready_for_pickup | green — user action needed |
| in_lend / in_use / deposited | blue — actively running |
| overdue | red — urgent |
| returned / approved / confirmed | purple / green — done by user, waiting admin |
| completed / donated | success green |
| rejected / cancelled | grey / red |

### Page header pattern
Every list page:
```
[Page Title]                          [Primary CTA button]
[subtitle / filter row]
```

### Detail page pattern
```
[← Back link]   [Page Title + status badge]   [action buttons]
[Info grid card]
[Section cards below]
```

### Empty state pattern
```
[centered illustration area]
[Thai message explaining the empty state]
[optional CTA button]
```

### Loading state pattern
Use `<div class="spinner">กำลังโหลด…</div>` while data fetches. For page-level loads this is acceptable; for inline list refreshes use the spinner inside the list container only.

### Search / filter debounce
All text search inputs debounce 300 ms before firing an API request (`clearTimeout` + `setTimeout`). Category/status selects fire immediately.

### Mobile layout rule
All list pages use single-column layout on screens ≤ 640 px. Detail pages stack their info grid to single column. Forms stack `.form-row` to single column (already handled by CSS media query at ≤ 480 px).

---

## 1. login.html

**Purpose:** Entry point. Google OAuth only.

**Layout:**
- Full-page centered card (no sidebar, no topbar)
- Logo (ESC_logo.png) centered, 80px
- Title: "Operation Support"
- Subtitle: "คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย"
- Google sign-in button (full-width, crimson)
- Error alert below button if `?error=` param present
- Footer note: "อนุญาตเฉพาะบัญชี @chula.ac.th และ @student.chula.ac.th"

**Interactions:**
- Button click → `GET /auth/google?from=<origin>`
- If already logged in → redirect to dashboard

---

## 2. profile.html

**Purpose:** First-time setup (is_profile_complete=0) AND edit existing profile.

**Layout:**
- Centered single card (max-width 560px) — no overflow
- Banner alert if first setup: "กรุณากรอกข้อมูลเพื่อเริ่มใช้งาน"
- Form fields in order:
  1. ชื่อเล่น (text)
  2. Row: ชั้นปี (select 1–6) | Group (select A–T)
  3. ภาควิชา (select, 18 options — searchable dropdown)
  4. เบอร์โทร (tel)
  5. Row: Line ID | Instagram (optional)
  6. PDPA checkbox with clickable link → modal with full PDPA text
- Submit button: "เริ่มใช้งาน" (setup) or "บันทึก" (edit)
- Cancel link to dashboard.html (edit mode only)

**Notes:**
- PDPA checkbox: disabled+checked once accepted (can't uncheck)
- On submit → `PATCH /users/me` → redirect to dashboard

---

## 3. dashboard.html ← Primary redesign target

**Purpose:** Account overview — what needs attention, active work, quick access.

**API calls (parallel):**
```
GET /requests, GET /projects, GET /notifications?limit=4,
GET /visits, GET /deposits, GET /storage-areas, GET /donations
```

**Layout (top to bottom):**

### 3a. Header row
```
[ยินดีต้อนรับ, {nickname}]   [{date in Thai}]   [+ สร้างคำขอยืม →]
```

### 3b. Action Required banner
Only renders if any item below exists. Title: "ต้องดำเนินการ" with count badge.

| Priority | Service | Condition | Label |
|---|---|---|---|
| 1 | Borrow | `ready_for_pickup` | ไปรับอุปกรณ์ |
| 2 | Borrow | `in_lend` + `is_overdue=true` | เกินกำหนดคืน |
| 3 | Deposit | `approved` | นำของมาฝาก |
| 3 | Donation | `approved` | นำของมามอบ |
| 4 | Deposit | `deposited` | มารับของคืน |
| 4 | Storage Area | `in_use` | เตรียมคืนพื้นที่ |
| 5 | Visit | `confirmed` | เตรียมเยี่ยมชม |

Each row: `[colored left border] [badge] [name] [project name] [date] [›]`
- Red border = priority 1–2, Amber = 3–4, Blue = 5
- Max 5 rows, "และอีก N รายการ" link if more

### 3c. Three-column grid

**Col 1 — โครงการของฉัน**
- Each project: name, org-type badge, date range, "Leader" pill if leader
- Max 3 projects, "ดูทั้งหมด →" link
- "+ สร้างโครงการ" button at bottom

**Col 2 — กำลังดำเนินการ**
- Borrow `in_lend`, Deposit `deposited`, Storage `in_use`, Visit `confirmed`
- Each row: service-type label | item name | status badge | key date | ›
- "ไม่มีรายการ" empty state
- Max 6 rows

**Col 3 — การแจ้งเตือน**
- Last 4 notifications (unread first)
- Click → mark read
- "ดูทั้งหมด →" link

### 3d. Quick Services row (footer strip)
Flat horizontal text links, separator dots:
`อุปกรณ์ · โครงการ · คำขอยืม · เยี่ยมชม · ฝากชั่วคราว · พื้นที่จัดเก็บ · บริจาค`

---

## 4. items.html

**Purpose:** Browse all available equipment.

**API:** `GET /items?search=&category_code=`

**Layout:**
- Page header: "อุปกรณ์" (no CTA for users — admin-only creation)
- Filter row: [search input] [category select]
- Item grid: `repeat(auto-fill, minmax(200px, 1fr))`
  - Each card: image (140px) or placeholder · name · category badge · available/total qty
  - Click → item-detail.html?id=
- Empty state: "ไม่พบอุปกรณ์ที่ค้นหา"

**Item card:**
```
[image / placeholder]
[name bold]
[category tag]
[available: N / total: N]  ← green if available>0, red if 0
```

---

## 5. item-detail.html

**Purpose:** View single item detail before adding to a request.

**API:** `GET /items/:id`

**Layout:**
- Back button → items.html
- Two-column card:
  - Left: image (300px max) or placeholder
  - Right: name (h1), category tag, description, stats row (total / available / in repair)
- Info table: location, unit, last updated
- Bottom CTA: "เพิ่มในคำขอยืม →" → new-request.html (or request-detail.html?id= if draft exists)

---

## 6. projects.html

**Purpose:** My projects list.

**API:** `GET /projects`

**Layout:**
- Header: "โครงการของฉัน" + "+ สร้างโครงการ" button
- List of project cards (vertical):
  - Name (bold) + org-type badge
  - Description (1 line truncated)
  - Date range · Member count
  - "Leader" pill if current user is leader
  - Entire row clickable → project-detail.html?id=
- Empty state: "ยังไม่มีโครงการ — กด 'สร้างโครงการ' เพื่อเริ่ม"

---

## 7. project-form.html

**Purpose:** Create new project (or edit existing via ?id=).

**API:** `POST /projects` or `PATCH /projects/:id`

**Layout:**
- Header: "สร้างโครงการ" or "แก้ไขโครงการ"
- Single card with form:
  1. ชื่อโครงการ (text, required)
  2. ประเภทองค์กร (select — 16 fixed values)
  3. คำอธิบาย (textarea, optional)
  4. Row: วันเริ่มต้น | วันสิ้นสุด (date inputs)
- Actions: [บันทึก (primary)] [ยกเลิก (secondary)]
- Date validation: end must be after start

---

## 8. project-detail.html

**Purpose:** Full project view — members, all service tickets grouped by type.

**API:** `GET /projects/:id`, `GET /projects/:id/members`, `GET /requests?project_id=`, `GET /visits?project_id=`, `GET /deposits?project_id=`, `GET /storage-areas?project_id=`, `GET /donations?project_id=`

**Layout:**

### Header area
```
[← โครงการ]
[Project name]  [org-type badge]  [active/completed indicator]
[date range] · [N สมาชิก]
```
Actions (top-right, conditional):
- Leader/Admin: [แก้ไขโครงการ] [+ เพิ่มสมาชิก] [ลบโครงการ]

### Quick action buttons row
```
[+ คำขอยืม]  [+ เยี่ยมชม]  [+ ฝากชั่วคราว]  [+ พื้นที่จัดเก็บ]  [+ บริจาค]
```
Routing rules (accounting for modal forms):
- **+ คำขอยืม** → `new-request.html?project_id=` (own page)
- **+ เยี่ยมชม** → `visits.html?project_id=` — visits.html detects the param and immediately opens the booking modal with the project pre-selected
- **+ ฝากชั่วคราว** → `deposit-form.html?project_id=` (own page, pre-selects project)
- **+ พื้นที่จัดเก็บ** → `storage-areas.html?project_id=` — detects param and opens modal with project pre-selected
- **+ บริจาค** → `donation-form.html?project_id=` (own page, pre-selects project)

### Members section
- Compact row per member: avatar initial | name | role badge (Leader/Member) | join date
- Leader/Admin see remove button per member, transfer manager button on leader row

### Ticket tabs (4 tabs — borrow requests only, per FLOWS.md)
| Tab | Statuses shown |
|---|---|
| ร่าง | draft, pending |
| เตรียม | processing, ready_for_pickup |
| ยืมอยู่ | in_lend |
| คืนแล้ว | returned, completed |
- cancelled/rejected hidden

### Other services (3 collapsible sections below tabs)
- Visits, Deposits, Storage Areas, Donations — each as a compact list with status badges

---

## 9. requests.html

**Purpose:** All my borrow requests with filter.

**API:** `GET /requests?status=`

**Layout:**
- Header: "คำขอยืม" + "+ สร้างคำขอ" button → `new-request.html`
- Filter row: status select
- List using `.svc-list` / `.svc-row` pattern:
  ```
  [#shortId]  [name]         [status badge]  [pickup date]  [›]
  (80px)      (flex-grow)                    (date right)
  ```
- Row click → `request-detail.html?id=`
- Empty state when filtered

**Status options:** ทุกสถานะ / ร่าง / รอดำเนินการ / กำลังดำเนินการ / พร้อมรับ / กำลังยืม / คืนแล้ว / เสร็จสิ้น / ถูกปฏิเสธ / ยกเลิก

---

## 10. new-request.html

**Purpose:** Create a new borrow request (draft + add items in one flow).

**Flow per FLOWS.md:** Name + Project → add items → set dates → submit

**API:** `POST /requests`, `GET /items`, `POST /requests/:id/items`, `PATCH /requests/:id`, `POST /requests/:id/submit`, `GET /slots?service_type=borrow`

**Layout (2 steps):**

### Step 1 — ข้อมูลคำขอ
- ชื่อคำขอ (text)
- โครงการ (select from user's projects)
- วันรับ — **slot-based date select** built from `GET /slots?service_type=borrow`:
  - Each active slot has `day_of_week` (1=Mon … 7=Sun) and `time` (HH:MM)
  - For each active slot, generate the next 4 occurrences from today (walk forward day by day, match weekday)
  - `<option value="${slot.id}::${dateISO}">{Thai day} {Thai date} เวลา {time}</option>`
  - On submit use the slot's date as `requested_pickup_datetime` = `${dateISO}T${time}:00`
- วันคืน (date input — must be after pickup date; note shown if gap >7 days)
- [ถัดไป →] button — calls `POST /requests` then moves to step 2

### Step 2 — เลือกอุปกรณ์
- Search/filter items at top
- Item list with [+ เพิ่ม] button per item; shows qty input when added
- Added items panel (right or bottom): shows current list with qty + remove
- Warning shown if qty > available stock
- [← แก้ไข] [ส่งคำขอ] buttons
- Submit → `POST /requests/:id/submit` → redirect to request-detail.html?id=

---

## 11. request-detail.html

**Purpose:** Full borrow request view with all actions based on status.

**API:** `GET /requests/:id`, `GET /requests/:id/returns`, `GET /requests/:id/conditions`

**Layout:**

### Header
```
[← คำขอยืม]
[#requestId]  [name]  [status badge + overdue warning if applicable]
```
Admin note (if set), assigned handler

### Info grid (2 columns)
- โครงการ · ผู้ขอ · วันรับ · วันคืน · วันส่งคืนจริง

### Items table
| ชื่ออุปกรณ์ | จำนวนขอ | จำนวนอนุมัติ | หน่วย |
- Admin view (processing): editable quantity_approved per row

### Action buttons (conditional by status + role)
| Status | User sees | Admin sees |
|---|---|---|
| draft | แก้ไข, ยกเลิก | — |
| pending | ยกเลิก (→ draft) | Process → |
| processing | — | Adjust items, Confirm → |
| ready_for_pickup | รับอุปกรณ์ (photo) | รับอุปกรณ์ (photo), ยกเลิก |
| in_lend | รายงานสภาพ, คืนอุปกรณ์ | — |
| returned | — | ยืนยันการคืน → |
| completed | — | — |

### Condition report section (in_lend only)
- Checkboxes per item: missing / broken / ok
- "ไม่มีรายการสูญหายหรือเสียหาย" checkbox
- Submit button

### Return section (returned status)
- Show return photo (if photo_r2_key set)
- Show condition notes
- Admin: confirm return form with qty per item

---

## 12. visits.html

**Purpose:** My storage visit reservations.

**API:** `GET /visits`

**Layout:**
- Header: "การเยี่ยมชม" + "+ จองเยี่ยมชม" button
- Filter: status select
- List rows:
  ```
  [date formatted]  [time]  [N คน]  [project name]  [status badge]  [›]
  ```
- Click → visit-detail.html?id=

---

## 13. visit-form.html → **MODAL** (opened from visits.html)

**Purpose:** Book a storage visit. Short form — opens as a modal overlay on visits.html, no separate page needed.

**API:** `GET /projects`, `GET /slots?service_type=visit`, `POST /visits`

**Modal trigger:** "+ จองเยี่ยมชม" button on visits.html calls `openVisitModal()`.

**Modal content:**
1. โครงการ (select — loaded from /projects)
2. วันเยี่ยมชม (select from available visit slots, Mon/Wed/Fri 16:30)
3. จำนวนคน (number input, 1–5)
4. คำขอยืมที่เกี่ยวข้อง (optional select — user's in_lend requests)

**Footer buttons:** [ส่งคำขอ] [ยกเลิก]
- On success → close modal, reload list, show toast "จองเยี่ยมชมสำเร็จ"

**Note:** visit-form.html/js still exists but only redirects to `visits.html`.

---

## 14. visit-detail.html

**Purpose:** Single visit detail.

**API:** `GET /visits/:id`

**Layout:**
- Header: visit date+time + status badge
- Info: โครงการ · ผู้จอง · จำนวนคน · คำขอยืมที่เชื่อม (if any)
- Admin note (if set)
- Actions:
  - pending: [ยกเลิก]
  - confirmed: [ยกเลิก] (user) — admin: mark complete/cancel

---

## 15. deposits.html

**Purpose:** My temporary deposit requests.

**API:** `GET /deposits`

**Layout:**
- Header: "ฝากชั่วคราว" + "+ ฝากของ" button
- Filter: status select
- List rows:
  ```
  [#shortId]  [project name]  [N รายการ]  [ฝาก: date]  [รับคืน: date]  [status badge]  [›]
  ```
- Click → deposit-detail.html?id=

---

## 16. deposit-form.html

**Purpose:** Create a temporary deposit request (draft → add items → submit).

**API:** `GET /projects`, `POST /deposits`, `PATCH /deposits/:id`, `POST /deposits/:id/items`, `DELETE /deposits/:id/items/:itemId`, `POST /deposits/:id/submit`

**Layout (single page, not stepped):**

### Left column — Form
1. โครงการ (select)
2. วันฝาก (date)
3. วันรับคืน (date — max 7 working days from deposit date)
   - Show hint "สูงสุด 7 วันทำการ (ไม่นับวันหยุด)"
   - **Do NOT calculate working days client-side** — just show the note; the API enforces the limit and will return an error if exceeded. No need to call `/holidays`.

### Right column — รายการของ
- Add item form: ชื่อสิ่งของ (text) · จำนวน · หมายเหตุ (optional) · [+ เพิ่ม]
- List of added items with remove button
- Item count shown

**Bottom:** [ส่งคำขอ] — requires project + dates + at least 1 item

---

## 17. deposit-detail.html

**Purpose:** Single deposit detail with all actions.

**API:** `GET /deposits/:id`

**Layout:**
- Header: #shortId + status badge + project name
- Info: วันฝาก · วันรับคืน · ผู้ฝาก
- Admin note (if set)
- Items table: ชื่อ · จำนวน · หมายเหตุ

**Actions (conditional):**
| Status | User sees | Admin sees |
|---|---|---|
| draft | แก้ไข, ยกเลิก, ส่งคำขอ | — |
| pending | — | อนุมัติ, ปฏิเสธ |
| approved | นำของมาฝาก (upload photo) | — |
| deposited | รับของคืน (upload photo) | — |
| completed/rejected | — | — |

---

## 18. storage-areas.html

**Purpose:** My storage area requests.

**API:** `GET /storage-areas`

**Layout:**
- Header: "พื้นที่จัดเก็บ" + "+ ขอพื้นที่" button
- Filter: status select
- List rows:
  ```
  [#shortId]  [project name]  [เริ่ม: date]  [สิ้นสุด: date]  [status badge]  [›]
  ```

---

## 19. storage-area-form.html → **MODAL** (opened from storage-areas.html)

**Purpose:** Request a storage area. Short form — opens as a modal on storage-areas.html.

**API:** `GET /projects`, `POST /storage-areas`, `PATCH /storage-areas/:id`, `POST /storage-areas/:id/submit`

**Modal trigger:** "+ ขอพื้นที่" button on storage-areas.html calls `openStorageModal()`.

**Modal content:**
1. โครงการ (select)
2. วันเริ่มใช้งาน (date input)
3. วันสิ้นสุด (date input — max 30 calendar days)
4. Live duration note: "N วัน (สูงสุด 30 วัน)" — updates as dates change

**Footer buttons:** [ส่งคำขอ] [ยกเลิก]
- On success → close modal, reload list, show toast

**Note:** storage-area-form.html/js redirects to `storage-areas.html`.

---

## 20. storage-area-detail.html

**Purpose:** Single storage area request detail.

**API:** `GET /storage-areas/:id`

**Layout:**
- Header: #shortId + status badge + project name
- Info: วันเริ่ม · วันสิ้นสุด · จำนวนวัน · ผู้ขอ
- Admin note (if set)
- Countdown to end date (when in_use)

**Actions:**
| Status | User | Admin |
|---|---|---|
| draft | แก้ไข, ส่งคำขอ | — |
| pending | — | อนุมัติ, ปฏิเสธ |
| approved | — (cron activates) | — |
| in_use | คืนพื้นที่ (upload checkout photo) | — |
| completed/rejected | — | — |

---

## 21. donations.html

**Purpose:** My donation requests.

**API:** `GET /donations`

**Layout:**
- Header: "การบริจาค" + "+ บริจาค" button
- Filter: status select
- List rows:
  ```
  [#shortId]  [project name]  [N รายการ]  [วันบริจาค]  [status badge]  [›]
  ```

---

## 22. donation-form.html

**Purpose:** Create a donation request (draft → add items → submit).

**API:** `GET /projects`, `GET /items`, `POST /donations`, `POST /donations/:id/items`, `DELETE /donations/:id/items/:itemId`, `POST /donations/:id/submit`

**Layout:**

### Project selector (top)
- โครงการ select + วันบริจาค date

### Add item panel
- **Two tab buttons** (not dropdown): [เลือกจากคลัง] [บรรยายใหม่]
  - Active tab has crimson background, inactive is outlined
  - **เลือกจากคลัง tab**: item select (load from `GET /items`) + qty input + [+ เพิ่ม]
  - **บรรยายใหม่ tab**: ชื่อสิ่งของ (text) + ประเภท (text for proposed_category_code) + qty + [+ เพิ่ม]
- Added items list with remove button
- Each item shows: name (or proposed) · qty · tag ("คลัง" or "ใหม่")

**Bottom:** [ส่งคำขอ] — requires project + date + ≥1 item

---

## 23. donation-detail.html

**Purpose:** Single donation detail with per-item admin review.

**API:** `GET /donations/:id`

**Layout:**
- Header: #shortId + status badge + project name
- Info: วันบริจาค · ผู้บริจาค

**Items table:**
| ชื่อ | ประเภท | จำนวนขอ | จำนวนอนุมัติ | สถานะรายการ |
- Admin (pending): approve/reject + quantity per row
- After all items reviewed: [อนุมัติทั้งหมด] or [ปฏิเสธทั้งหมด] button

**Actions:**
| Status | User | Admin |
|---|---|---|
| draft | แก้ไข, ส่งคำขอ | — |
| pending | — | Review items per row, then อนุมัติ/ปฏิเสธ |
| approved | นำของมามอบ (date + upload photo) | — |
| donated/completed/rejected | — | — |

---

## 24. notifications.html

**Purpose:** Full notification inbox.

**API:** `GET /notifications?page=&limit=20`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`

**Layout:**
- Header: "การแจ้งเตือน" + "อ่านทั้งหมด" button (if unread > 0)
- Unread count badge in header
- List (full width, vertical):
  - Unread: crimson left border + light background
  - Read: plain
  - Each item: title (bold) · body (2 lines max) · timestamp (right)
  - Click → mark read
- Pagination (page numbers) at bottom

---

## 25. admin-items.html

**Purpose:** Admin — full item inventory management.

**API:** `GET /items?low_stock=true`, `POST /items`, `PATCH /items/:id`, `DELETE /items/:id`

**Layout:**
- Header: "จัดการอุปกรณ์" + "+ เพิ่มอุปกรณ์" button
- Filter row: [search] [category select] [⚠ สต็อกต่ำ toggle]
- Table view (not card grid — admin needs more info):
  | รหัส | ชื่อ | หมวดหมู่ | ทั้งหมด | คงเหลือ | ซ่อม | ที่ตั้ง | Actions |
  - Actions: [จัดการสต็อก →] [แก้ไข] [ลบ]
  - Low stock row highlighted amber
  - Inactive item row dimmed
- Inline create/edit form in modal

---

## 26. admin-stock.html

**Purpose:** Admin — stock adjustment for a specific item.

**API:** `GET /items/:id`, `POST /items/:id/stock`, `GET /items/:id/stock-logs`

**Layout:**
- Header: item name + current stock summary
- Stock stats row: ทั้งหมด · คงเหลือ · กำลังยืม · ซ่อม
- Action cards (4):
  - เพิ่มสต็อก (add): qty + note
  - ตัดสต็อก (remove): qty + note
  - ส่งซ่อม (send_to_repair): qty + note
  - คืนจากซ่อม (restore_from_repair): qty + note
- Stock log table below: date · action · qty · note · by whom

---

## 27. admin-returns.html

**Purpose:** Admin — confirm returned borrow requests.

**API:** `GET /returns?status=pending`, `GET /returns/:id`, `PATCH /returns/:id/confirm`

**Layout:**
- Header: "ยืนยันการคืน" + count badge (number of pending)
- List of return submissions using `.svc-list` / `.svc-row`:
  - Request name · project · requester · return date · all_items_ok badge
  - Click → opens a **modal** (NOT inline expand, NOT navigation)

**Review modal (opened on row click):**
- Title: "ยืนยันการคืน — {request name}"
- Fetch `GET /returns/:id` for detailed item data
- Shows return photo (if photo_r2_key)
- Condition report summary (all_ok or per-item notes)
- Items table: ชื่ออุปกรณ์ | ขอ | คืน (qty_returned input) | ซ่อม (qty_to_repair input) | หมายเหตุ
- [ยืนยันการคืน (btn-success)] → `PATCH /returns/:id/confirm` with `{ items: [...] }` → close modal, remove row from list
- [ยกเลิก] → close modal

---

## 28. admin-calendar.html

**Purpose:** Admin — unified calendar of all scheduled events.

**API:** `GET /calendar` — exact response shape is unknown at spec time. Handle defensively:
- Try `event.date` first, then `event.calendar_date`, then `event.scheduled_date`
- Try `event.type` first, then `event.event_type`
- Try `event.title` or `event.name` for display label
- Try `event.request_id || event.visit_id || event.deposit_id || event.id` for navigation

**Layout:**
- Header: "ปฏิทิน" + month nav [← ชื่อเดือน →]
- Toggle chips (checkboxes styled as pills) for event types:
  - ยืม(รับ) = type `borrow_pickup`, blue
  - ยืม(คืน) = type `borrow_return`, pink
  - เยี่ยมชม = type `visit`, green
  - ฝากของ = type `deposit`, amber
  - พื้นที่ = type `storage_area`, purple
- Calendar grid — month view, Mon–Sun column headers
- Each day cell: date number + mini event chips (truncated name, color-coded)
- Click event chip → navigate to detail page based on type + id
- Month nav: client-side shift, no re-fetch (all events already loaded)
- If `GET /calendar` fails: show error alert, do not break the calendar shell

---

## 29. admin-slots.html

**Purpose:** Admin — manage operational time slots for borrow pickup and storage visits.

**API:** `GET /slots`, `POST /slots`, `PATCH /slots/:id`, `DELETE /slots/:id`

**Layout:**
- Header: "ช่วงเวลา"
- Two cards side by side (`.admin-grid` layout):
  - **ยืม (borrow)** — typically Mon/Wed/Fri, 12:30 and 16:30
  - **เยี่ยมชม (visit)** — Mon/Wed/Fri 16:30, capacity 5
- Each card: table of slots  
  `day_of_week · time · capacity · is_active (toggle switch) · [ลบ]`
- "+ เพิ่มช่วงเวลา" inline form at bottom of each card:  
  `day_of_week select · time input · capacity input · [บันทึก]`
- is_active toggle calls `PATCH /slots/:id` immediately on change

---

## 30. admin-holidays.html

**Purpose:** Admin — manage Thai public holidays (affects 7-working-day deposit calculation).

**API:** `GET /holidays?year=`, `POST /holidays`, `DELETE /holidays/:id`

**Layout:**
- Header: "วันหยุดราชการ" + year select
- List of holidays: date · name · delete button
- "+ เพิ่มวันหยุด" form at top: date input + name input + [บันทึก]
- Sorted by date ascending

---

## 31. admin-broadcast.html

**Purpose:** Admin — send in-app notification to all users.

**API:** `POST /notifications/broadcast` with `{ title, body }`

**Layout:**
- Header: "ส่งการแจ้งเตือน"
- Two-column card:
  - Left: form — หัวข้อ (text input, required) + เนื้อหา (textarea, required)
  - Right: live preview card showing "ตัวอย่าง" — renders as a `.notif-item.unread` preview that updates as user types
- [ส่งถึงผู้ใช้ทั้งหมด] button → `openModal()` confirm dialog → POST → success toast
- After success: clear form

---

## 32. admin-users.html

**Purpose:** Admin — view and manage all users.

**API:** `GET /users?role=`, `PATCH /users/:id/role`, `PATCH /users/:id/status`

**Layout:**
- Header: "ผู้ใช้งาน" + total count
- Filter: [role select: ทั้งหมด / user / admin] [search by name]
- Table:
  | Avatar | ชื่อ | อีเมล | ภาควิชา · ปี | บทบาท | สถานะ | Actions |
  - Role: inline select (user/admin) — changes on select
  - สถานะ: active/inactive toggle switch
  - Cannot deactivate self (row shows disabled state)
  - Inactive rows dimmed

---

## Navigation / Flow Map

```
login → dashboard (after OAuth)
      → profile (if is_profile_complete=0)

dashboard → projects → project-detail → new-request
                                      → visit-form
                                      → deposit-form
                                      → storage-area-form
                                      → donation-form
          → items → item-detail
          → requests → request-detail
          → visits → visit-detail
          → deposits → deposit-detail
          → storage-areas → storage-area-detail
          → donations → donation-detail
          → notifications
          → profile

Admin-only:
topbar (admin role) → admin-items → admin-stock
                   → admin-returns
                   → admin-calendar
                   → admin-slots
                   → admin-holidays
                   → admin-broadcast
                   → admin-users
```

---

## Shared Components

### Photo upload flow (upload then reference)
1. `POST /upload/presign` → get `{ r2Key, uploadPath }`
2. `PUT /upload/photo/:key` with binary image
3. Store `r2Key` in form, submit with request

Photo preview uses `GET /upload/photo/:key` as `<img src>`.

Used in: request pickup, request return, deposit deposit/withdraw, storage-area checkout, donation drop-off.

### Countdown component
For ready_for_pickup (7-day pickup window), in_use (end date), deposited (withdraw date):
- Shows "เหลือ N วัน N ชั่วโมง" or "หมดเวลา" if expired
- Rendered via existing `formatCountdown()` in ui.js

### Confirmation modal pattern
Destructive actions (cancel, delete, reject) always go through `openModal()` before firing API.
- Title: action name
- Body: "คุณแน่ใจหรือไม่ว่าต้องการ [action]?"
- Buttons: [ยืนยัน (danger)] [ยกเลิก]
