import requests

BACKEND_URL = 'http://127.0.0.1:5005'
login_res = requests.post(f'{BACKEND_URL}/api/auth/login', json={'email': 'admin@safevision.ai', 'password': 'Password123!'}, timeout=5)
token = login_res.json().get('token')
headers = {'Authorization': f'Bearer {token}'}

resp = requests.get(f'{BACKEND_URL}/api/cameras', headers=headers, timeout=5)
data = resp.json()
cams = data.get('cameras', [])
print(f"Total cameras returned to frontend: {len(cams)}")
for c in cams:
    print(f"  Camera: code={c.get('code')}, id={c.get('id') or c.get('cameraId')}, name={c.get('name')}, status={c.get('status')}, streamUrl={c.get('streamUrl')}")

codes = [c.get('code') for c in cams]
assert codes == ['CAM-4'], f"Expected only ['CAM-4'], got {codes}"
print("[PASS] Only CAM-4 is returned to the frontend!")
