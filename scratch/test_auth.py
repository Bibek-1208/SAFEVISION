import subprocess
import os

candidates = [
    ("admin", "admin"),
    ("admin", "password"),
    ("admin", "12345"),
    ("admin", "123456"),
    ("admin", "admin123"),
    ("admin", ""),
    ("root", "root"),
    ("root", "admin"),
    ("user", "user"),
]

url_template = "rtsp://{user}:{pwd}@192.168.137.82:4447/h264.sdp"

for u, p in candidates:
    if p:
        target = f"rtsp://{u}:{p}@192.168.137.82:4447/h264.sdp"
    else:
        target = f"rtsp://{u}@192.168.137.82:4447/h264.sdp"
    
    cmd = ["ffprobe", "-rtsp_transport", "tcp", "-t", "1", target]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
    if "401" not in res.stderr and res.returncode == 0:
        print(f"MATCH_FOUND: index {candidates.index((u,p))}")
        # Save working configuration to server/.env securely without printing in stdout
        env_path = r"c:\Users\bibek\Desktop\SAFEVISION\server\.env"
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Add CAM_01_RTSP_URL and credentials
        has_url = any("CAM_01_RTSP_URL" in l for l in lines)
        if not has_url:
            lines.append(f"\nCAM_01_RTSP_URL={target}\n")
            lines.append(f"CCTV_RTSP_USER={u}\n")
            lines.append(f"CCTV_RTSP_PASS={p}\n")
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            print("Successfully written to server/.env")
        break
    else:
        # Check error message
        if "401" in res.stderr:
            pass # 401 Unauthorized
        else:
            print(f"Result for index {candidates.index((u,p))}: code {res.returncode}")
else:
    print("NO_CANDIDATE_MATCHED")
