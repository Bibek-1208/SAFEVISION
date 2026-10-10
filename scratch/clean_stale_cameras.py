from bson import ObjectId
from pymongo import MongoClient

client = MongoClient('mongodb://127.0.0.1:27017/safevision?replicaSet=rs0', directConnection=True)
db = client['safevision']
col = db['cameras']

targets = [
    {'code': 'TRY', '_id': '6abeb7cb191767da699e9974', 'cameraId': 'cam-1790883787843'},
    {'code': 'VHJV', '_id': '6abebbdd191767da699e9cd8', 'cameraId': 'cam-1790884829989'},
    {'code': 'CAM1', '_id': '6abf42704efcc075b825a98a', 'cameraId': 'cam-1790919280199'},
]

total_deleted = 0
print('=== EXECUTING PRECISE STALE CAMERA DELETION (STEP 4) ===')
for target in targets:
    obj_id = ObjectId(target['_id'])
    doc = col.find_one({'_id': obj_id, 'code': target['code'], 'cameraId': target['cameraId']})
    if not doc:
        print(f"ERROR: Target not found: {target}")
        continue
    if doc.get('code') == 'CAM-4' or doc.get('cameraId') == 'cam-1790935140413':
        raise Exception('CRITICAL ABORT: Refusing to touch CAM-4!')
    
    res = col.delete_one({'_id': obj_id, 'code': target['code'], 'cameraId': target['cameraId']})
    if res.deleted_count == 1:
        total_deleted += 1
        print(f"DELETED: code={target['code']} | _id={target['_id']} | cameraId={target['cameraId']} | deletedCount=1")
    else:
        print(f"FAILED to delete: {target}")

print(f"TOTAL DELETED: {total_deleted}/3")
