import json
from pymongo import MongoClient

client = MongoClient("mongodb://127.0.0.1:27017")
db = client["safevision"]
cameras = list(db["cameras"].find({}, {"_id": 0}))

print(f"Total cameras in MongoDB 'cameras' collection: {len(cameras)}")
for cam in cameras:
    raw_url = cam.get("streamUrl", "")
    sanitized_url = raw_url
    if "@" in raw_url:
        protocol, rest = raw_url.split("://", 1)
        creds, host_part = rest.split("@", 1)
        sanitized_url = f"{protocol}://***:***@{host_part}"
    
    print({
        "cameraId": cam.get("cameraId") or cam.get("id"),
        "code": cam.get("code"),
        "name": cam.get("name"),
        "zone": cam.get("zone"),
        "enabled": cam.get("enabled"),
        "protocol": cam.get("protocol"),
        "sourceType": cam.get("sourceType"),
        "streamUrl_sanitized": sanitized_url,
        "has_credentials": "@" in raw_url,
        "status": cam.get("status"),
        "fps": cam.get("fps"),
        "resolution": cam.get("resolution")
    })
