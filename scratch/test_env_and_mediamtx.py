import os
import sys

env_vars = {}
with open('server/.env', 'r') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env_vars[k.strip()] = v.strip().strip('"').strip("'")

url = env_vars.get('CAM_01_RTSP_URL')
user = env_vars.get('CCTV_RTSP_USER')
pwd = env_vars.get('CCTV_RTSP_PASS')

print("Keys loaded successfully:", list(env_vars.keys()))
if url and user and pwd:
    # Build effective URL
    prefix, rest = url.split("://", 1)
    effective_url = f"{prefix}://{user}:{pwd}@{rest}"
    print(f"Effective URL format verified: {prefix}://{user}:****@{rest}")
else:
    print("Missing some RTSP config keys")
