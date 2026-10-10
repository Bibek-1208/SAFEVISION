import os
import subprocess
import time
import cv2
import re
# Load server/.env with standard file reading
env_path = r"c:\Users\bibek\Desktop\SAFEVISION\server\.env"
config = {}
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip().strip("'\"")

raw_url = config.get("CAM_01_RTSP_URL", "rtsp://192.168.137.82:4447/h264.sdp")
user = config.get("CCTV_RTSP_USER", "")
pwd = config.get("CCTV_RTSP_PASS", "")

if user and "@" not in raw_url:
    pass_part = f":{pwd}" if pwd else ""
    target_url = raw_url.replace("://", f"://{user}{pass_part}@")
else:
    target_url = raw_url

def sanitize(s: str) -> str:
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", s)

print(f"[TEST] Target stream: {sanitize(target_url)}")

# 1. FFprobe stream probing
t0 = time.perf_counter()
cmd = [
    "ffprobe",
    "-rtsp_transport", "tcp",
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,r_frame_rate,avg_frame_rate",
    "-of", "json",
    target_url
]

try:
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=8.0)
    probe_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    if res.returncode == 0:
        print(f"[FFPROBE_SUCCESS] Connection latency: {probe_latency_ms} ms")
        print(f"[FFPROBE_DATA] {res.stdout.strip()}")
    else:
        print(f"[FFPROBE_ERROR] returncode={res.returncode}")
        print(f"[FFPROBE_STDERR] {sanitize(res.stderr.strip())}")
except Exception as e:
    print(f"[FFPROBE_EXCEPTION] {e}")

# 2. OpenCV Frame Decoding and Real FPS Measurement
print("[TEST] Opening OpenCV VideoCapture with low-latency FFMPEG options...")
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;3000000|fflags;nobuffer|flags;low_delay"
t_open_start = time.perf_counter()
cap = cv2.VideoCapture(target_url, cv2.CAP_FFMPEG)
open_latency_ms = round((time.perf_counter() - t_open_start) * 1000, 2)

if not cap.isOpened():
    print(f"[OPENCV_ERROR] Failed to open stream via cv2.VideoCapture (latency: {open_latency_ms} ms)")
else:
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"[OPENCV_SUCCESS] Stream opened in {open_latency_ms} ms! Resolution: {w}x{h}, Source FPS: {source_fps}")
    
    # Read 30 real frames and measure decode FPS & frame timestamps
    frames_read = 0
    t_first_frame = None
    t_start_loop = time.perf_counter()
    timestamps = []
    
    for i in range(30):
        t_before_read = time.perf_counter()
        ret, frame = cap.read()
        t_after_read = time.perf_counter()
        if not ret or frame is None:
            print(f"[FRAME_ERROR] Frame {i} read failed")
            break
        if t_first_frame is None:
            t_first_frame = t_after_read
            first_frame_latency_ms = round((t_first_frame - t_start_loop) * 1000, 2)
            print(f"[FIRST_FRAME] First frame decoded in {first_frame_latency_ms} ms. Frame shape: {frame.shape}")
        
        frames_read += 1
        timestamps.append(round((t_after_read - t_start_loop) * 1000, 2))
    
    total_time = time.perf_counter() - t_start_loop
    received_fps = round(frames_read / total_time, 2) if total_time > 0 else 0
    print(f"[DECODE_SUMMARY] Read {frames_read} real frames in {total_time:.2f}s -> Decoded FPS: {received_fps}")
    print(f"[TIMESTAMPS_SAMPLE_MS] {timestamps[:10]} ... {timestamps[-3:]}")
    
    # Save one test frame snapshot to artifacts/scratch directory for visual proof
    snapshot_path = r"c:\Users\bibek\Desktop\SAFEVISION\scratch\real_cctv_frame_sample.jpg"
    cv2.imwrite(snapshot_path, frame)
    print(f"[SNAPSHOT_SAVED] Real CCTV frame saved to {snapshot_path} ({os.path.getsize(snapshot_path)} bytes)")
    cap.release()

print("=== VERIFICATION COMPLETE ===")
