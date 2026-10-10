import urllib.request
import json
import re

req = urllib.request.Request('http://127.0.0.1:5005/api/cameras/pipeline-config')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
    print('Total configured cameras:', data['total'])
    for c in data['cameras']:
        url = c.get('streamUrl', '')
        masked = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', url)
        print(f"{c['cameraId']}: {c['name']} -> {masked}")
