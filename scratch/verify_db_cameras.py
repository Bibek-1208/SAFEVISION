import json
import re
from pymongo import MongoClient

client = MongoClient('mongodb://127.0.0.1:27017/safevision?replicaSet=rs0', directConnection=True)
db = client['safevision']
col = db['cameras']

cameras = list(col.find({}))
print(f"Total cameras in MongoDB after cleanup: {len(cameras)}")

def mask_url(url):
    if not url:
        return ''
    return re.sub(r'(://[^:]+:)([^@]+)(@)', r'\1****\3', url)

for c in cameras:
    print(json.dumps({
        '_id': str(c.get('_id')),
        'cameraId': c.get('cameraId'),
        'code': c.get('code'),
        'name': c.get('name'),
        'streamType': c.get('streamType') or c.get('protocol') or c.get('sourceType'),
        'streamUrl': mask_url(c.get('streamUrl', '')),
        'enabled': c.get('enabled'),
        'status': c.get('status')
    }, indent=2))

stale_found = [c for c in cameras if c.get('code') in ['TRY', 'VHJV', 'CAM1']]
cam4_records = [c for c in cameras if c.get('code') == 'CAM-4']

assert len(stale_found) == 0, f"ERROR: Stale records still found: {stale_found}"
assert len(cameras) == 1, f"ERROR: Expected exactly 1 camera, found {len(cameras)}"
assert len(cam4_records) == 1, f"ERROR: Expected exactly 1 CAM-4 record, found {len(cam4_records)}"
print("\n[PASS] STEP 5 DATABASE VERIFICATION: Only CAM-4 remains. 0 stale cameras. 0 duplicates.")
