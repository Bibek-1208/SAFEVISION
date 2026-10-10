import requests
import json
import sys
import time

BASE_URL = "http://localhost:5005/api"

def run_tests():
    print("=" * 60)
    print("SAFEVISION PHASE 3 ACCEPTANCE TESTING")
    print("=" * 60)

    # 1. Login as Admin
    print("\n[Step 1] Logging in as Admin (admin@safevision.ai)...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@safevision.ai",
        "password": "Password123!"
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    admin_token = login_res.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("-> Admin login successful.")

    # 2. Login as Viewer/Operator to verify RBAC
    print("\n[Step 2] Logging in as Supervisor / Operator...")
    user_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "supervisor@safevision.ai",
        "password": "Password123!"
    })
    assert user_res.status_code == 200, f"Supervisor login failed: {user_res.text}"
    user_token = user_res.json()["token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}
    print("-> Supervisor login successful.")

    # 3. List existing sites
    print("\n[Step 3] Fetching existing sites (GET /api/sites)...")
    sites_res = requests.get(f"{BASE_URL}/sites", headers=admin_headers)
    assert sites_res.status_code == 200, f"GET /sites failed: {sites_res.text}"
    sites_data = sites_res.json()
    sites = sites_data.get("sites", [])
    print(f"-> Found {len(sites)} site(s).")
    for s in sites:
        print(f"   * [{s.get('code')}] {s.get('name')} | Zones: {s.get('zoneCount', 0)}, Cameras: {s.get('cameraCount', 0)}")
    
    # Verify baseline plant exists
    rsp_site = next((s for s in sites if s.get("code") == "RSP-ZB-01" or s.get("id") == "site-rsp-1"), None)
    assert rsp_site is not None, "Baseline site (RSP-ZB-01) not found in GET /api/sites"
    assert rsp_site.get("zoneCount", 0) > 0, f"Expected zones > 0 for baseline site, got {rsp_site.get('zoneCount')}"
    print(f"-> Baseline plant verified with {rsp_site.get('zoneCount')} zones and {rsp_site.get('cameraCount')} cameras.")

    # 4. Fetch current active site
    print("\n[Step 4] Fetching active site (GET /api/sites/current)...")
    curr_res = requests.get(f"{BASE_URL}/sites/current", headers=admin_headers)
    assert curr_res.status_code == 200, f"GET /sites/current failed: {curr_res.text}"
    curr_data = curr_res.json()
    active_site = curr_data.get("site")
    assert active_site is not None, "No active site returned"
    print(f"-> Active site: {active_site.get('name')} ({active_site.get('code')}) | Dynamic zoneCount={curr_data.get('zoneCount')}")

    # 5. Test RBAC: Non-admin trying to create site
    print("\n[Step 5] Testing RBAC on Site Creation (Supervisor -> POST /api/sites)...")
    rbac_res = requests.post(f"{BASE_URL}/sites", headers=user_headers, json={
        "name": "Unauthorized Site",
        "code": "UNAUTH-01",
        "location": "Restricted Area"
    })
    print(f"-> Response code: {rbac_res.status_code}")
    assert rbac_res.status_code == 403, f"Expected 403 Forbidden for non-admin, got {rbac_res.status_code}"
    print("-> RBAC check PASS: Supervisor correctly rejected from creating site.")

    # 6. Test Validation: Missing fields
    print("\n[Step 6] Testing Validation on Site Creation (Admin missing location)...")
    val_res = requests.post(f"{BASE_URL}/sites", headers=admin_headers, json={
        "name": "Invalid Site",
        "code": "INV-01"
    })
    assert val_res.status_code == 400, f"Expected 400 Bad Request, got {val_res.status_code}"
    print("-> Validation check PASS: Missing required field rejected.")

    # 7. Test Duplicate Site Code
    print("\n[Step 7] Testing Duplicate Site Code Prevention...")
    dup_res = requests.post(f"{BASE_URL}/sites", headers=admin_headers, json={
        "companyName": "Steel Authority",
        "name": "Duplicate RSP",
        "code": "RSP-ZB-01",
        "location": "Rourkela Sector 4"
    })
    assert dup_res.status_code == 409, f"Expected 409 Conflict for duplicate site code, got {dup_res.status_code}"
    print("-> Duplicate code prevention PASS: RSP-ZB-01 correctly rejected.")

    # Clean up any leftover test sites from previous runs
    for s in sites_res.json().get("sites", []):
        if s.get("code") == "SITE-P3-TEST" or s.get("code", "").startswith("SITE-P3-"):
            requests.delete(f"{BASE_URL}/sites/{s.get('id') or s.get('siteId')}", headers=admin_headers)

    # 8. Create New Site (Rule 3)
    test_site_code = f"SITE-P3-{int(time.time())}"
    print(f"\n[Step 8] Creating Real Site: 'Bhilai Advanced Works' ({test_site_code})...")
    create_res = requests.post(f"{BASE_URL}/sites", headers=admin_headers, json={
        "companyName": "SafeVision Industrial Infrastructure",
        "name": "Bhilai Advanced Works",
        "code": test_site_code,
        "location": "Bhilai Industrial Zone C, Chhattisgarh",
        "industry": "Steel Manufacturing & Heavy Fabrication",
        "timezone": "Asia/Kolkata",
        "status": "ACTIVE"
    })
    assert create_res.status_code == 201, f"Create site failed ({create_res.status_code}): {create_res.text}"
    created_site = create_res.json().get("site")
    created_id = created_site.get("id") or created_site.get("siteId")
    print(f"-> Created Site ID: {created_id}")
    print(f"   Name: {created_site.get('name')}")
    print(f"   Code: {created_site.get('code')}")
    print(f"   Company: {created_site.get('companyName')}")
    print(f"   Initial Zones: {created_site.get('zoneCount', 0)}, Initial Cameras: {created_site.get('cameraCount', 0)}")
    assert created_site.get("zoneCount", 0) == 0, "New site must have 0 zones"
    assert created_site.get("cameraCount", 0) == 0, "New site must have 0 cameras"

    # 9. Verify new site appears in GET /api/sites
    print("\n[Step 9] Verifying new site in GET /api/sites...")
    sites_after_res = requests.get(f"{BASE_URL}/sites", headers=admin_headers)
    found_site = next((s for s in sites_after_res.json().get("sites", []) if s.get("code") == test_site_code), None)
    assert found_site is not None, "Newly created site not present in /api/sites list"
    print("-> Site listing PASS: New site found with verified persistence.")

    # 10. Verify site context switching (Rule 5 & 6)
    print(f"\n[Step 10] Testing active site context with ?siteId={created_id}...")
    ctx_res = requests.get(f"{BASE_URL}/sites/current?siteId={created_id}", headers=admin_headers)
    assert ctx_res.status_code == 200
    ctx_site = ctx_res.json().get("site")
    assert ctx_site.get("code") == test_site_code, f"Expected {test_site_code}, got {ctx_site.get('code')}"
    print(f"-> Context switch PASS: Active site is {ctx_site.get('name')}, zoneCount={ctx_res.json().get('zoneCount')}")

    # 11. Edit Site (Rule 4)
    print(f"\n[Step 11] Editing Site ({created_id}) with updated details...")
    updated_name = "Bhilai Advanced Rolling Mill (Expanded)"
    updated_tz = "Asia/Kolkata"
    edit_res = requests.patch(f"{BASE_URL}/sites/{created_id}", headers=admin_headers, json={
        "name": updated_name,
        "companyName": "SafeVision Global Steel Enterprise",
        "industry": "Specialty Rolled Steels",
        "timezone": updated_tz,
        "location": "Bhilai Sector 12 Industrial Campus"
    })
    assert edit_res.status_code == 200, f"Edit site failed ({edit_res.status_code}): {edit_res.text}"
    edited_site = edit_res.json().get("site")
    assert edited_site.get("name") == updated_name, f"Expected name {updated_name}, got {edited_site.get('name')}"
    print(f"-> Edit site PASS: Name updated to '{edited_site.get('name')}'.")

    # Verify persistence by fetching fresh from GET /api/sites/:id
    fresh_res = requests.get(f"{BASE_URL}/sites/{created_id}", headers=admin_headers)
    assert fresh_res.status_code == 200
    fresh_site = fresh_res.json().get("site")
    assert fresh_site.get("name") == updated_name
    assert fresh_site.get("companyName") == "SafeVision Global Steel Enterprise"
    print(f"-> Edit persistence PASS: Fresh GET verified persisted MongoDB data.")

    # 12. Protection Check: Baseline primary site cannot be deleted
    print("\n[Step 12] Verifying primary baseline plant (site-rsp-1) deletion protection...")
    del_baseline_res = requests.delete(f"{BASE_URL}/sites/site-rsp-1", headers=admin_headers)
    assert del_baseline_res.status_code in (400, 403), f"Expected 400 or 403 when attempting to delete baseline site, got {del_baseline_res.status_code}"
    print(f"-> Protection check PASS: {del_baseline_res.json().get('error')}")

    # 13. Delete Temporary Test Site
    print(f"\n[Step 13] Deleting temporary test site ({created_id})...")
    del_test_res = requests.delete(f"{BASE_URL}/sites/{created_id}", headers=admin_headers)
    assert del_test_res.status_code == 200, f"Failed to delete test site: {del_test_res.text}"
    print(f"-> Delete test site PASS: {del_test_res.json().get('message')}")

    # 14. Verify deletion from list
    sites_final_res = requests.get(f"{BASE_URL}/sites", headers=admin_headers)
    final_sites = sites_final_res.json().get("sites", [])
    assert not any(s.get("code") == test_site_code for s in final_sites), "Deleted site still present!"
    print("-> Deletion confirmation PASS: Temporary test site cleaned up.")

    # 15. Verify baseline plant, cameras, and zones are completely intact
    print("\n[Step 15] Verifying baseline cameras and zones preservation...")
    cams_res = requests.get(f"{BASE_URL}/cameras", headers=admin_headers)
    cams = cams_res.json().get("cameras", [])
    zones_res = requests.get(f"{BASE_URL}/zones", headers=admin_headers)
    zones = zones_res.json().get("zones", [])
    print(f"-> Cameras count: {len(cams)} (Preserved: {len(cams) >= 2})")
    print(f"-> Zones count: {len(zones)} (Preserved: {len(zones) >= 6})")
    assert len(cams) >= 2, "Cameras were lost!"
    assert len(zones) >= 6, "Zones were lost!"

    # 16. Regression: Phase 2 Global Search
    print("\n[Step 16] Checking Phase 2 Regression: Global Search...")
    search_res = requests.get(f"{BASE_URL}/search?q=zone", headers=admin_headers)
    assert search_res.status_code == 200, f"Search failed: {search_res.text}"
    s_data = search_res.json()
    print(f"-> Global Search PASS: Total matches={s_data.get('total', 0)}, query='{s_data.get('query')}'")

    # 17. Regression: Phase 2 Dynamic Shift
    print("\n[Step 17] Checking Phase 2 Regression: Dynamic Shift...")
    shift_res = requests.get(f"{BASE_URL}/shifts", headers=admin_headers)
    assert shift_res.status_code == 200, f"Shifts API failed: {shift_res.text}"
    shifts_json = shift_res.json()
    active_shift_data = shifts_json.get("activeShift")
    print(f"-> Dynamic Shift PASS: Active={active_shift_data.get('name') if active_shift_data else 'None'}, Shifts count={len(shifts_json.get('shifts', []))}")

    # 18. Regression: Phase 2 AI Pipeline Status
    print("\n[Step 18] Checking Phase 2 Regression: AI Health Status...")
    ai_res = requests.get(f"{BASE_URL}/health/ai")
    assert ai_res.status_code == 200, f"AI Health check failed: {ai_res.text}"
    ai_json = ai_res.json()
    print(f"-> AI Health PASS: Status={ai_json.get('status')}, ModelStatus={ai_json.get('modelStatus')}, Latency={ai_json.get('latencyMs')}ms")

    print("\n" + "=" * 60)
    print("ALL 18 PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\nTEST FAILED: {e}", file=sys.stderr)
        sys.exit(1)
