import urllib.request
import json
import time

# 1. Start pipeline for configured cameras (which is CAM-01 only)
req_data = json.dumps({"mode": "independent"}).encode('utf-8')
req = urllib.request.Request('http://localhost:8000/pipeline/start', data=req_data, headers={'Content-Type': 'application/json'})

print("[TEST] Calling /pipeline/start...")
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        res = json.loads(resp.read())
        print("[PIPELINE_START]", res)
except Exception as e:
    print("[PIPELINE_START_ERROR]", e)

# 2. Wait 5 seconds and poll /pipeline/status
print("[TEST] Polling /pipeline/status for 5 seconds...")
for i in range(5):
    time.sleep(1)
    status_req = urllib.request.Request('http://localhost:8000/pipeline/status')
    try:
        with urllib.request.urlopen(status_req, timeout=3) as resp:
            st = json.loads(resp.read())
            print(f"[{i+1}s] total_processed={st.get('total_processed')}, total_received={st.get('total_received')}, aggregate_fps={st.get('aggregate_fps')}")
            for cid, cinfo in st.get('cameras', {}).items():
                print(f"    {cid}: status={cinfo.get('status')} fps={cinfo.get('fps')} latency={cinfo.get('latency_ms')}ms dropped={cinfo.get('dropped_frames')} candidates={cinfo.get('incident_candidates')}")
    except Exception as e:
        print(f"[{i+1}s] status error:", e)
