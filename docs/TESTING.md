# SafeVision AI — Automated Testing & Verification Guide

This guide details all automated test suites, execution commands, and expected verification logs.

---

## 1. Automated Test Suites Overview

| Suite | Script | Tests | Focus Area |
| :--- | :--- | :--- | :--- |
| **End-to-End Platform Acceptance** | `server/test_full_platform.js` | 30 Steps | Complete real-world pipeline across all 16 acceptance categories |
| **RBAC & SBAC Security Regression** | `tests/test_rbac_sbac.js` | 21 Checks | Server-authoritative role and zone isolation boundaries |
| **Frontend Production Build** | `client: npm run build` | 2,560 Modules | TypeScript type-checking & bundle optimization |

---

## 2. Running the 30-Step End-to-End Acceptance Suite

The primary automated acceptance script verifies every layer of the architecture without simulated data.

### Command
```bash
cd server
node test_full_platform.js
```

### Verification Checklist (All 30 Steps)
1. `GET /api/health`: System health calculation (`HEALTHY` vs `DEGRADED`).
2. `GET http://localhost:8000/health`: Python AI microservice probe.
3. `GET /api/health/database`: Database connectivity & record counts.
4. `GET /api/health/cameras`: Online vs offline camera counts.
5. `GET /api/health/realtime`: Socket.IO protocol & server uptime.
6. Admin authentication & JWT token generation.
7. Plant Manager authentication & site scoping.
8. Safety Officer authentication & permissions.
9. Supervisor authentication & zone assignment scoping.
10. Employee authentication & worker ID isolation.
11. RBAC Guard: Employee forbidden from accessing CCTV streams (HTTP 403).
12. SBAC Guard: Employee forbidden from accessing foreign worker incidents (HTTP 403).
13. RBAC Guard: Supervisor forbidden from resolving incidents (HTTP 403).
14. Supervisor permitted action: Acknowledge incident in assigned zone.
15. Safety Officer permitted action: Resolve incident and record resolver identity.
16. Admin user directory access (`/api/admin/users`).
17. Cryptographic SHA-256 hash chain verification (`/api/admin/audit-logs/verify`).
18. Self-profile update (`/api/auth/me/profile`) and employee sync.
19. Admin create operational shift (`POST /api/shifts`).
20. Admin toggle operational shift active state (`PATCH /api/shifts/:id/toggle`).
21. Admin register employee (`POST /api/employees`).
22. Supervisor scoped workforce query (only workers in authorized zones).
23. Statutory safety rules directory (`/api/safety-rules`).
24. Dynamic threshold tuning (`PATCH /api/safety-rules/:id`).
25. Camera refresh probe and stream URL password masking (`POST /api/cameras/refresh`).
26. RTSP/Camera TCP reachability probe (`POST /api/cameras/test-connection`).
27. Live optical detection pipeline (`POST /api/detection/frame`).
28. False positive feedback capture (`POST /api/incidents/:id/false-positive`).
29. Post-activity SHA-256 cryptographic chain re-verification (all new records signed).
30. Final architecture & data-truth compliance check.

---

## 3. Running the Enterprise RBAC & SBAC Suite

Validates that non-admin roles cannot escalate privileges or view cross-zone data.

### Command
```bash
node tests/test_rbac_sbac.js
```

### Expected Output
```
=====================================================
  SAFEVISION AI - ENTERPRISE RBAC & SBAC TEST SUITE  
=====================================================

--- 1. Testing Unauthenticated Access ---
[PASS] Unauthenticated GET /api/incidents returns 401 (got 401)

--- 2. Testing ADMIN (admin@test.local) ---
[PASS] Admin role resolved as ADMIN
[PASS] Admin received signed JWT token
[PASS] Admin can access GET /api/admin/users (200 OK)
[PASS] Admin can access GET /api/admin/audit-logs (200 OK)

--- 3. Testing PLANT_MANAGER (manager@test.local) ---
[PASS] Role resolved as PLANT_MANAGER
[PASS] Plant Manager blocked from GET /api/admin/users (403 Forbidden, got 403)
[PASS] Plant Manager can access GET /api/reports (200 OK)

--- 4. Testing SAFETY_OFFICER (officer@test.local) ---
[PASS] Role resolved as SAFETY_OFFICER
[PASS] Safety Officer blocked from GET /api/admin/users (403 Forbidden)
[PASS] Safety Officer can access GET /api/incidents (200 OK)

--- 5. Testing SUPERVISOR (supervisor@test.local) ---
[PASS] Role resolved as SUPERVISOR
[PASS] Supervisor scoped strictly to Zone A and Zone B
[PASS] Supervisor incidents list automatically filtered by backend to Zone A & B only
[PASS] Supervisor querying unauthorized Zone C returns 403 Forbidden (got 403)
[PASS] Supervisor attempting to resolve incident returns 403 Forbidden (got 403)

--- 6. Testing EMPLOYEE (employee@test.local) ---
[PASS] Role resolved as EMPLOYEE
[PASS] Employee attempting to view CCTV streams returns 403 Forbidden (got 403)
[PASS] Employee can successfully submit hazard report (201 Created)

--- 7. Verifying Audit Log Records ---
[PASS] Audit log captured security events (count: 11)
[PASS] Audit log recorded security access denials (count: 5)

=====================================================
  TEST RESULTS: 21 PASSED | 0 FAILED
=====================================================
```

---

## 4. Frontend Production Build Verification

Ensures strict TypeScript checking with zero type regressions:

### Command
```bash
cd client
npm run build
```

### Expected Output
```
> client@0.0.0 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 2560 modules transformed.
rendering chunks...
dist/index.html                     1.39 kB
dist/assets/index-DRzWX4uo.css     53.55 kB
dist/assets/index-DiEDVHv1.js   1,059.73 kB
✓ built in 2.5s - 3.0s
```

---

## 5. Failure Mode & Resilience Testing

SafeVision AI gracefully handles external infrastructure outages:

1. **MongoDB Outage**:
   - If MongoDB fails or is offline, the backend transitions to embedded in-memory mode without crashing. `/api/health/database` truthfully reports `mode: "IN_MEMORY_FALLBACK"`.
2. **AI Microservice Outage**:
   - If port 8000 is unreachable, frame detection gracefully reports `AI_SERVICE_OFFLINE`. `/api/health` indicates `DEGRADED`.
3. **Camera Stream Offline**:
   - Camera cards display `OFFLINE` with exact TCP failure error (e.g. `ECONNREFUSED` or `TIMEOUT_4000MS`), refusing to invent video.
