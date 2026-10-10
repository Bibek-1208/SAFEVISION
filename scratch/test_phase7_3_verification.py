import os
import sys
import json
import requests

SERVER_URL = "http://localhost:5005"
AI_URL = "http://127.0.0.1:8000"

def get_auth_token():
    login_url = f"{SERVER_URL}/api/auth/login"
    res = requests.post(login_url, json={"email": "admin@safevision.ai", "password": "Password123!"})
    if res.status_code == 200:
        data = res.json()
        token = data.get("token") or (data.get("user") and data["user"].get("token"))
        return token
    print(f"Login failed: {res.status_code} {res.text}")
    return None

def main():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    print("=== 1. AI ENGINE STATUS ===")
    try:
        r = requests.get(f"{AI_URL}/health", timeout=3)
        print("AI /health:", r.status_code, r.json().get("model_name"), "Runtime:", r.json().get("runtimeState"))
    except Exception as e:
        print("AI health failed:", e)

    try:
        r = requests.get(f"{AI_URL}/pipeline/status", timeout=3)
        print("AI /pipeline/status:", r.status_code, r.text[:200])
    except Exception as e:
        print("AI pipeline/status failed:", e)

    print("\n=== 2. SERVER CAMERAS API ===")
    try:
        r = requests.get(f"{SERVER_URL}/api/cameras", headers=headers, timeout=3)
        cams = r.json().get("cameras", [])
        print(f"Total cameras in API: {len(cams)}")
        for c in cams:
            print(f" - {c.get('code')}: {c.get('name')} [{c.get('zone')}] status={c.get('status')} fps={c.get('fps')} streamUrl={c.get('streamUrl')}")
    except Exception as e:
        print("Cameras API failed:", e)

    print("\n=== 3. SNAPSHOT PROXY ENDPOINT ===")
    try:
        r = requests.get(f"{SERVER_URL}/api/cameras/CAM-01/snapshot", headers=headers, timeout=5)
        print(f"CAM-01 snapshot: status={r.status_code}, content-type={r.headers.get('content-type')}, bytes={len(r.content)}")
    except Exception as e:
        print("Snapshot failed:", e)

if __name__ == "__main__":
    main()
