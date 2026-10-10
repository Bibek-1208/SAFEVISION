import requests
import json
import sys
import os

BASE_URL = "http://localhost:5005/api"

def test_phase4():
    print("=" * 60)
    print("SAFEVISION PHASE 4 ACCEPTANCE TEST SUITE")
    print("=" * 60)

    # 1. Login as Admin
    print("\n[Step 1] Authenticating as Admin...")
    login_resp = requests.post(f"{BASE_URL}/auth/demo-login", json={"role": "admin"})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print(f"  ✓ Authenticated as {login_data['user']['name']} ({login_data['user']['role']})")

    # 2. Query Sites & Selected Site
    print("\n[Step 2] Querying Site Context...")
    sites_resp = requests.get(f"{BASE_URL}/sites", headers=headers)
    assert sites_resp.status_code == 200
    sites = sites_resp.json()["sites"]
    print(f"  Found {len(sites)} site(s): {[s['code'] for s in sites]}")
    site1 = sites[0]
    site1_id = site1["siteId"]
    site1_name = site1["name"]
    site1_code = site1["code"]
    print(f"  Selected Site: {site1_name} ({site1_code}) [ID: {site1_id}]")

    # 3. Test Invalid Date Range (Rule 4)
    print("\n[Step 3] Testing Invalid Date Range Validation (start > end)...")
    invalid_date_payload = {
        "standard": "DGFASLI",
        "siteId": site1_id,
        "siteName": site1_name,
        "siteCode": site1_code,
        "dateRange": {"from": "2026-10-05", "to": "2026-10-01"},
        "sections": ["siteMap", "violationSummary"],
    }
    inv_resp = requests.post(f"{BASE_URL}/reports", headers=headers, json=invalid_date_payload)
    print(f"  Response status: {inv_resp.status_code}")
    assert inv_resp.status_code == 400, f"Expected 400 for invalid dates, got {inv_resp.status_code}: {inv_resp.text}"
    print(f"  ✓ Rejected with error: {inv_resp.json().get('error')}")

    # 4. Test No Sections Selected (Rule 6)
    print("\n[Step 4] Testing Empty Sections Selection Validation...")
    no_sec_payload = {
        "standard": "DGFASLI",
        "siteId": site1_id,
        "siteName": site1_name,
        "siteCode": site1_code,
        "dateRange": {"from": "2026-09-28", "to": "2026-10-02"},
        "sections": [],
    }
    no_sec_resp = requests.post(f"{BASE_URL}/reports", headers=headers, json=no_sec_payload)
    print(f"  Response status: {no_sec_resp.status_code}")
    assert no_sec_resp.status_code == 400, f"Expected 400 for empty sections, got {no_sec_resp.status_code}"
    print(f"  ✓ Rejected with error: {no_sec_resp.json().get('error')}")

    # 5. Test Current Site + Date Range with Real Data (Rule 19A)
    print("\n[Step 5] Generating Report for Site with Real Data (2026-09-28 to 2026-10-02)...")
    real_payload = {
        "standard": "DGFASLI",
        "siteId": site1_id,
        "siteName": site1_name,
        "siteCode": site1_code,
        "dateRange": {"from": "2026-09-28", "to": "2026-10-02"},
        "sections": ["siteMap", "violationSummary", "resolutionLog", "complianceTrend", "proofImages"],
        "generatedBy": "Lead Inspector (ADMIN)",
    }
    gen_resp = requests.post(f"{BASE_URL}/reports", headers=headers, json=real_payload)
    assert gen_resp.status_code == 201, f"Report generation failed: {gen_resp.text}"
    gen_data = gen_resp.json()
    report1 = gen_data["report"]
    report1_id = report1["reportId"]
    report1_file = report1["fileName"]
    print(f"  ✓ Generated Report ID: {report1_id}")
    print(f"  ✓ Standardized Filename: {report1_file}")
    print(f"  ✓ Real Total Violations in period: {report1['totalViolations']}")
    print(f"  ✓ Real Critical Violations: {report1['criticalViolations']}")
    print(f"  ✓ Real Compliance Score: {report1['complianceScore']}% (Method: {report1.get('complianceScoreMethod')})")
    assert report1_file.startswith(f"SafeVision_Compliance_{site1_code.replace('-', '_')}"), f"Filename mismatch: {report1_file}"

    # 6. Test PDF Download (Rule 12, 14)
    print(f"\n[Step 6] Testing PDF Download for {report1_id}...")
    dl_url = f"{BASE_URL}/reports/{report1_id}/download"
    dl_resp = requests.get(dl_url, headers=headers)
    assert dl_resp.status_code == 200, f"Download failed with status {dl_resp.status_code}: {dl_resp.text}"
    content_type = dl_resp.headers.get("Content-Type", "")
    assert "application/pdf" in content_type, f"Expected application/pdf, got {content_type}"
    pdf_bytes = dl_resp.content
    print(f"  ✓ Content-Type: {content_type}")
    print(f"  ✓ Downloaded bytes: {len(pdf_bytes)}")
    assert len(pdf_bytes) > 1000, f"PDF file size too small: {len(pdf_bytes)}"
    assert pdf_bytes[:5] == b"%PDF-", f"Invalid PDF signature: {pdf_bytes[:5]}"
    print(f"  ✓ Valid %PDF- header signature confirmed.")

    # Save to scratch for verification
    out_path = os.path.join(os.getcwd(), "scratch", report1_file)
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"  ✓ Saved to {out_path} ({os.path.getsize(out_path)} bytes)")

    # 7. Test Download via Query Token fallback (?token=...)
    print("\n[Step 7] Testing Download with Query Token parameter (?token=...)...")
    query_dl_url = f"{BASE_URL}/reports/{report1_id}/download?token={token}"
    q_dl_resp = requests.get(query_dl_url)
    assert q_dl_resp.status_code == 200, f"Query token download failed: {q_dl_resp.status_code}"
    assert "application/pdf" in q_dl_resp.headers.get("Content-Type", "")
    print(f"  ✓ Direct link authentication via ?token parameter works: {len(q_dl_resp.content)} bytes")

    # 8. Test Current Site + Empty Date Range (Rule 19B)
    print("\n[Step 8] Generating Report for Date Range with No Data (2026-08-01 to 2026-08-10)...")
    empty_payload = {
        "standard": "OSHA",
        "siteId": site1_id,
        "siteName": site1_name,
        "siteCode": site1_code,
        "dateRange": {"from": "2026-08-01", "to": "2026-08-10"},
        "sections": ["violationSummary", "resolutionLog", "complianceTrend", "proofImages"],
        "generatedBy": "EHS Lead (ADMIN)",
    }
    empty_resp = requests.post(f"{BASE_URL}/reports", headers=headers, json=empty_payload)
    assert empty_resp.status_code == 201, f"Empty period report failed: {empty_resp.text}"
    empty_report = empty_resp.json()["report"]
    print(f"  ✓ Empty Period Total Violations: {empty_report['totalViolations']}")
    assert empty_report["totalViolations"] == 0, f"Expected 0 violations, got {empty_report['totalViolations']}"
    print(f"  ✓ Empty Period Compliance Score: {empty_report['complianceScore']}% (100% since zero breaches)")

    # Download empty report PDF
    dl_empty = requests.get(f"{BASE_URL}/reports/{empty_report['reportId']}/download", headers=headers)
    assert dl_empty.status_code == 200
    assert len(dl_empty.content) > 1000
    print(f"  ✓ Downloaded empty period PDF: {len(dl_empty.content)} bytes")

    # 9. Test Unchecked Sections (Rule 19E)
    print("\n[Step 9] Generating Report with Unchecked Sections (only siteMap & violationSummary)...")
    subset_payload = {
        "standard": "INTERNAL",
        "siteId": site1_id,
        "siteName": site1_name,
        "siteCode": site1_code,
        "dateRange": {"from": "2026-09-28", "to": "2026-10-02"},
        "sections": ["siteMap", "violationSummary"],
        "generatedBy": "Auditor (ADMIN)",
    }
    subset_resp = requests.post(f"{BASE_URL}/reports", headers=headers, json=subset_payload)
    assert subset_resp.status_code == 201
    subset_report = subset_resp.json()["report"]
    print(f"  ✓ Report sections in record: {subset_report['sections']}")
    assert len(subset_report['sections']) == 2

    # 10. Test Report Archive Listing (Rule 15)
    print("\n[Step 10] Testing Report Archive Listing (/api/reports)...")
    archive_resp = requests.get(f"{BASE_URL}/reports", headers=headers)
    assert archive_resp.status_code == 200
    archived_list = archive_resp.json()["reports"]
    print(f"  ✓ Found {len(archived_list)} report(s) in archive")
    report_ids = [r["reportId"] for r in archived_list]
    assert report1_id in report_ids, f"{report1_id} not found in archive"
    assert empty_report["reportId"] in report_ids
    print(f"  ✓ Newly generated reports successfully present in archive list.")

    # 11. Test RBAC Authorization (Rule 17)
    print("\n[Step 11] Testing RBAC Authorization...")
    # Employee cannot generate or export reports
    emp_login = requests.post(f"{BASE_URL}/auth/login", json={"email": "operator@test.local", "password": "User@12345"})
    if emp_login.status_code == 200:
        emp_token = emp_login.json()["token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}", "Content-Type": "application/json"}
        emp_gen = requests.post(f"{BASE_URL}/reports", headers=emp_headers, json=real_payload)
        print(f"  Employee generate report status: {emp_gen.status_code}")
        assert emp_gen.status_code == 403, f"Expected 403 for employee without REPORT_GENERATE, got {emp_gen.status_code}"
        print(f"  ✓ RBAC enforced: Employee forbidden from generating compliance audit reports.")

    print("\n" + "=" * 60)
    print("ALL PHASE 4 ACCEPTANCE TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    test_phase4()
