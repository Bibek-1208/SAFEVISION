import socketio
import requests
import time

token_resp = requests.post('http://127.0.0.1:5005/api/auth/login', json={'email': 'admin@safevision.ai', 'password': 'Password123!'})
token = token_resp.json().get('token')

sio = socketio.Client()
events = []

@sio.on('connect')
def on_connect():
    print('[Socket.IO] Authenticated connection established!')

@sio.on('camera:telemetry')
def on_telemetry(data):
    if data.get('cameraId') == 'CAM1':
        st = data.get('status')
        fps = data.get('fps')
        sfps = data.get('sourceFps')
        lat = data.get('latencyMs')
        age = data.get('frameAgeMs')
        pf = data.get('processedFrames')
        print(f'[Socket.IO] camera:telemetry: status={st}, fps={fps} (source={sfps}), latency={lat}ms, frameAge={age}ms, frames={pf}')
        events.append(('telemetry', data))

@sio.on('camera:detections')
def on_detections(data):
    if data.get('cameraId') == 'CAM1':
        dets = data.get('detections', [])
        print(f'[Socket.IO] camera:detections: count={len(dets)}')
        for d in dets:
            print(f'   Track: {d.get("trackId")} | Class: {d.get("className")} | Conf: {d.get("confidence")}')
        events.append(('detections', data))

sio.connect('http://127.0.0.1:5005', auth={'token': token}, transports=['websocket', 'polling'])
time.sleep(5)
sio.disconnect()
print(f'Captured {len(events)} real-time events from Socket.IO.')
