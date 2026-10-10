import requests
import json

SERVER_URL = "http://localhost:5005"

def get_auth_token():
    res = requests.post(f"{SERVER_URL}/api/auth/login", json={"email": "admin@safevision.ai", "password": "Password123!"}, timeout=5)
    return res.json().get("token")

def main():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("=== EXECUTING TEST 31: CONTROLLED CLEANUP OF TEMPORARY PHONE CCTV ===")

    # 1. Delete CAM-01
    del_res = requests.delete(f"{SERVER_URL}/api/cameras/CAM-01", headers=headers, timeout=5)
    print("Delete CAM-01 status:", del_res.status_code, del_res.json())

    # 2. Check cameras list
    get_res = requests.get(f"{SERVER_URL}/api/cameras", headers=headers, timeout=5)
    cams = get_res.json().get("cameras", [])
    print(f"Total cameras in system: {len(cams)}")
    assert len(cams) == 0, f"Expected 0 cameras, found {len(cams)}"
    print("[PASS] System reports 0 cameras configured! Frontend will render empty state.")

    # 3. Test that permanent camera management capability still works
    print("\n=== VERIFYING PERMANENT CAMERA MANAGEMENT FEATURE REMAINS ACTIVE ===")
    test_cam = {
        "name": "New Plant Camera",
        "code": "CAM-01",
        "zone": "General Area",
        "protocol": "RTSP",
        "streamUrl": "rtsp://10.0.0.50:554/live",
        "resolution": "1920x1080",
        "fps": 25
    }
    create_res = requests.post(f"{SERVER_URL}/api/cameras", headers=headers, json=test_cam, timeout=5)
    print("Attach IP Camera test status:", create_res.status_code)
    assert create_res.status_code == 201, "Attach camera failed"

    # Clean up test cam
    del2_res = requests.delete(f"{SERVER_URL}/api/cameras/CAM-01", headers=headers, timeout=5)
    print("Cleanup test cam status:", del2_res.status_code)

    # Final check
    final_res = requests.get(f"{SERVER_URL}/api/cameras", headers=headers, timeout=5)
    final_cams = final_res.json().get("cameras", [])
    print(f"\nFinal authoritative cameras count in MongoDB: {len(final_cams)}")
    assert len(final_cams) == 0, "Final count should be 0"
    print("[PASS] TEST 31 VERIFIED: 0 cameras configured, camera management feature intact!")

if __name__ == "__main__":
    main()
