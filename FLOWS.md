# System Flows

---

## 1. Registration & Onboarding

```
Click "Sign in with Google"
        ↓
Google OAuth callback → account created (role: user)
        ↓
Redirect to Profile Setup page
        ↓
Fill in: nickname, year, department, study_group,
         phone_number, line_id, instagram (optional)
         + accept PDPA checkbox (required)
        ↓
Submit → access granted
```

**Access rules:**
- Profile not complete → blocked everywhere except profile setup page
- PDPA not accepted → cannot submit profile form
- Profile editable anytime after setup via PATCH
- PDPA withdrawal → must transfer leader in all projects first → access blocked until re-accepted

---

## 2. Project

### Create
```
Fill in: name, organization_type, description (optional), start_date, end_date
        ↓
Project created → creator auto-assigned as leader → immediately active
```

### Actions available in project dashboard
| Action | Who |
|--------|-----|
| Create borrow ticket | any member |
| Reserve a storage visit | any member |
| Create temporary deposit | any member |
| Request storage area | any member |
| Donate stuff | any member |
| Edit project detail | leader or admin |
| Delete project | leader or admin — blocked if any active ticket exists |
| Add member | leader or admin |
| Transfer manager | leader or admin |
| Leave project | members only (leader must transfer first) |

### Transfer Manager
```
Leader (or admin) selects a member to promote
        ↓
Old leader → becomes member
New person → becomes leader
```
- If admin force-removes a leader → must designate replacement in same action

### Leave Project
```
Member → leaves freely
Leader → must transfer first → then leave as member
```

---

## 3. Borrow-Return Service

### User Flow
```
Step 1: Create ticket
  Fill in: ticket name, project
        ↓
Step 2: Browse & add items (shopping cart)
  - Can add qty beyond available stock (warning shown)
  - Can remove items freely
  Status: draft
        ↓
Step 3: Confirm & submit
  Fill in: pickup date, return date
  Rules:
    - Pickup must be on Mon/Wed/Fri 12:30 or 16:30
    - Both dates within project start/end dates
    - Return after pickup
    - Return > 7 days after pickup → warning (not blocked)
        ↓
  Status: pending (admin notified)
```

### Edit & Cancel Rules
| Status | Can edit? | Can cancel? |
|--------|-----------|-------------|
| draft | yes — all fields | yes (delete) |
| pending | no | yes → reverts to draft |
| processing+ | no | no — contact admin |

- Admin can cancel any submitted ticket (pending or beyond)
- Admin cancel at processing/ready_for_pickup → stock restored

### Admin Flow
```
pending → admin hits Process → processing
        ↓
Admin reviews each item:
  - Reject item (qty = 0) or reduce quantity
Admin reviews pickup date:
  - Keep or change to any date/time
        ↓
Admin hits Confirm
  → If all items rejected → cancelled (stock not affected)
  → If any item approved → ready_for_pickup (user notified, stock reserved)
        ↓
7-day pickup window starts
  → Not picked up within 7 days → auto-cancelled (stock restored)
```

### Pickup
```
User or admin hits Pick Up + takes photo
        ↓
Status: in_lend (immediately, no admin confirmation needed)
```

### Overdue
```
Return date passes while in_lend
        ↓
is_overdue flag set to true + user notified
Flow continues normally (user still submits return the same way)
Incident logged in project behavior history
```

### Return
```
Step 1: Condition report (required)
  User selects items that are missing or broken
  OR ticks "nothing is missing/broken"
        ↓
Step 2: Hit Return + take photo
        ↓
Status: returned (admin notified)
        ↓
Admin confirms → stock restored → Status: completed
(No in-app rejection — issues handled outside the app)
```

### Full Status Flow
```
draft → pending → processing → ready_for_pickup → in_lend → returned → completed
  ↑        ↑           ↓               ↓
delete  cancel      all items      7-day timeout
        →draft      rejected        → cancelled
                   → cancelled
```

---

## 4. Storage Visit Reservation

### User Flow
```
Fill in: project, borrow ticket (optional), date, time, number of people
  - Date/time must be from available operational slots (Mon/Wed/Fri 16:30)
        ↓
Status: pending (admin reviews)
```

### Admin Flow
```
Admin sees reservation + current slot headcount (e.g. "3/5 confirmed")
        ↓
Approve → Status: confirmed
  OR
Reject → Status: rejected (user can rebook on a different slot)
        ↓
On visit date, admin checks if user attended:
  Attended → Status: completed
  No-show  → Status: cancelled → project behavior incident logged
```

### Status Flow
```
pending → confirmed → completed
    ↓          ↓
 rejected   cancelled (no-show)
(rebook ok)
```

### 50-Item Policy
- Ticket with >50 distinct item types → admin sees a warning flag when processing
- Admin can reject based on this (policy, not automatic)

### Capacity Rule
- Max 5 people per slot across all projects
- No hard block at submission — admin enforces at approval

---

## 5. Temporary Deposit

### User Flow
```
Fill in: project, stuff list (name + qty + description optional),
         deposit date, withdraw date
  Rules:
    - Both dates within project start/end dates
    - Max 7 Thai working days between deposit and withdraw
        ↓
Status: pending (admin reviews)
        ↓
Admin approves → Status: approved (admin done)
  OR
Admin rejects → Status: rejected (permanent)
        ↓
User brings items + takes photo → Status: deposited
        ↓
1 day before withdraw date → user notified
        ↓
User collects items + takes photo → Status: completed
(If not collected → handled outside the app)
```

### Status Flow
```
draft → pending → approved → deposited → completed
                    ↓
                 rejected (permanent)
```

---

## 6. Request for Storage Area

### User Flow
```
Fill in: project, start date, end date
  Rules:
    - Both dates within project start/end dates
    - Max 30 calendar days between start and end
        ↓
Status: pending (admin reviews)
        ↓
Admin approves → Status: approved (admin done)
  OR
Admin rejects → Status: rejected (permanent)
        ↓
On start date → cron auto-updates → Status: in_use
        ↓
1 day before end date → user notified to clean the area
        ↓
User checks out + takes photo (proves area cleaned) → Status: completed
```

### Status Flow
```
draft → pending → approved → in_use → completed
                    ↓          ↑
                 rejected    (cron on start date)
                 (permanent)
```

---

## 7. Donate Stuff

### User Flow
```
Fill in: project, item list (select existing OR describe new item + qty),
         date of donation
        ↓
Status: pending (admin reviews)
```

### Admin Flow
```
Admin reviews each item:
  - Approve/reject per item
  - Reduce quantity per item
  - Match to existing inventory item or create new item
        ↓
All items rejected → Status: rejected (permanent)
Some/all approved → Status: approved
  → Approved items added to inventory immediately
        ↓
User drops off items + takes photo → Status: donated → completed
```

### Status Flow
```
draft → pending → approved → donated → completed
                    ↓
                 rejected (all items rejected, permanent)
```

---

## 8. Project Behavior History

Automatically logged incidents per project — admin reads when reviewing requests:

| Incident | When logged |
|----------|------------|
| Late return | Return date passed while still in_lend |
| Policy violation | Ticket with >50 items submitted without confirmed visit |
| No-show visit | Confirmed visit marked cancelled by admin |

No automated blocking — admin uses this for judgment only.

---

## 9. Key Rules Summary

### Date Rules (all services linked to a project)
- All service dates must fall **within the project's start/end dates**

### Borrow-Return Policies
| Rule | Value |
|------|-------|
| Default pickup slots | Mon / Wed / Fri at 12:30 or 16:30 |
| Min lead time | 3 Thai working days before pickup |
| Max advance booking | 30 calendar days from submission |
| Max borrow duration | 7 calendar days (warning if exceeded, admin decides) |
| Pickup timeout | 7 days from ready_for_pickup → auto-cancelled |
| Overdue | Flag + notification when return date passes |

### Storage Visit Policies
| Rule | Value |
|------|-------|
| Default slots | Mon / Wed / Fri at 16:30 only |
| Capacity | Max 5 people per slot (admin enforces) |

### Temporary Deposit Rules
- Max 7 Thai working days

### Storage Area Rules
- Max 30 calendar days

### Roles
| Role | Can do |
|------|--------|
| user | create projects, use all services, manage own tickets |
| admin | everything + approve/reject all requests, manage users, manage inventory, manage system settings |
