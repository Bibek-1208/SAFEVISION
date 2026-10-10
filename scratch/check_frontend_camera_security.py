import urllib.request
import json

# Login as admin to get token
login_data = json.dumps({"email": "admin@test.local", "password": "Password123!"}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:5005/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as resp:
        auth_res = json.loads(resp.read())
        token = auth_res['token']
except Exception:
    # Try alternative password
    login_data = json.dumps({"email": "admin@test.local", "password": "Test@1234"}).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:5005/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        auth_res = json.loads(resp.read())
        token = auth_res['token']

cam_req = urllib.request.Request('http://127.0.0.1:5005/api/cameras', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(cam_req) as resp:
    data = json.loads(resp.read())
    cam1 = [c for c in data['cameras'] if c['code'] == 'CAM-01'][0]
    print("CAM-01 for Frontend Client:")
    print("  code:", cam1['code'])
    print("  name:", cam1['name'])
    print("  status:", cam1['status'])
    print("  streamUrl (must NOT contain rtsp:// or credentials):", cam1['streamUrl'])
    assert "rtsp://" not in cam1['streamUrl'], "SECURITY VIOLATION: rtsp:// leaked to frontend!"
    assert "@" not in cam1['streamUrl'], "SECURITY VIOLATION: credentials leaked to frontend!"
    print("  [SECURITY CHECK PASSED] No raw RTSP or credentials exposed to frontend!")
