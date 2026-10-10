import subprocess
import sys
import shutil

print("=== CHECKING EXTERNAL DEPENDENCIES ===")

# 1. FFmpeg
ffmpeg_path = shutil.which("ffmpeg")
ffprobe_path = shutil.which("ffprobe")
print(f"FFmpeg: {ffmpeg_path}")
print(f"ffprobe: {ffprobe_path}")

# 2. MediaMTX
mediamtx_path = shutil.which("mediamtx") or shutil.which(".\\mediamtx.exe")
print(f"MediaMTX local: {shutil.which('mediamtx.exe')}")

# 3. Docker
docker_path = shutil.which("docker")
print(f"Docker: {docker_path}")

# 4. Python AI env (ai/.venv311)
python_ai = r"c:\Users\bibek\Desktop\SAFEVISION\ai\.venv311\Scripts\python.exe"
print(f"Python AI binary: {python_ai}")
res = subprocess.run([python_ai, "-c", "import torch; print('PyTorch:', torch.__version__, 'CUDA available:', torch.cuda.is_available(), 'Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"], capture_output=True, text=True)
print(res.stdout.strip() if res.stdout else res.stderr.strip())

# 5. Node.js
node_path = shutil.which("node")
npm_path = shutil.which("npm")
print(f"Node: {node_path}")
print(f"NPM: {npm_path}")

# 6. MongoDB check
# Tested via node script
print("=== DEPENDENCY CHECK COMPLETE ===")
