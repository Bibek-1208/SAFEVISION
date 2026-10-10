import urllib.request
import json
import cv2
import numpy as np

# 1. Login
req = urllib.request.Request('http://127.0.0.1:5005/api/auth/login', 
                             data=json.dumps({'email': 'admin@test.local', 'password': 'Test@1234'}).encode(), 
                             headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
token = json.loads(res.read())['token']
print('Auth token obtained successfully.')

# 2. Get cameras
req = urllib.request.Request('http://127.0.0.1:5005/api/cameras', headers={'Authorization': f'Bearer {token}'})
cams = json.loads(urllib.request.urlopen(req).read())
cameras = cams.get('cameras', cams)
print(f'Total cameras found: {len(cameras)}')

for c in cameras:
    cid = c.get('code') or c.get('id') or c.get('_id')
    name = c.get('name')
    print(f"\nTesting camera: {cid} ({name})")
    
    # Test snapshot / live-feed
    url = f"http://127.0.0.1:5005/api/cameras/{cid}/snapshot"
    try:
        snap_req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        snap_res = urllib.request.urlopen(snap_req, timeout=5)
        content_type = snap_res.headers.get('Content-Type')
        data = snap_res.read()
        print(f"Snapshot status: {snap_res.status}, Content-Type: {content_type}, bytes: {len(data)}")
        
        # Decode JPEG
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            print(f"Successfully decoded JPEG: shape={img.shape}")
        else:
            print("Failed to decode JPEG bytes!")
    except Exception as e:
        print(f"Failed to fetch snapshot for {cid}: {e}")
