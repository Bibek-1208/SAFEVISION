import socket
import hashlib

def md5(s):
    return hashlib.md5(s.encode('utf-8')).hexdigest()

def test_variant(uri_req, uri_digest, user, pwd, use_qop=True):
    s = socket.socket()
    s.settimeout(3.0)
    try:
        s.connect(('192.168.137.82', 4447))
        req1 = f'DESCRIBE {uri_req} RTSP/1.0\r\nCSeq: 1\r\n\r\n'
        s.sendall(req1.encode())
        res1 = s.recv(4096).decode('utf-8', errors='ignore')
        if 'nonce="' not in res1:
            print("No nonce in response:", res1)
            return False
        nonce = res1.split('nonce="')[1].split('"')[0]
        realm = res1.split('realm="')[1].split('"')[0]

        ha1 = md5(f'{user}:{realm}:{pwd}')
        ha2 = md5(f'DESCRIBE:{uri_digest}')
        if use_qop:
            nc = '00000001'
            cnonce = '0a4f113b'
            qop = 'auth'
            resp_val = md5(f'{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}')
            auth_hdr = (
                f'Digest username="{user}", realm="{realm}", nonce="{nonce}", '
                f'uri="{uri_digest}", response="{resp_val}", '
                f'qop={qop}, nc={nc}, cnonce="{cnonce}"'
            )
        else:
            resp_val = md5(f'{ha1}:{nonce}:{ha2}')
            auth_hdr = f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri_digest}", response="{resp_val}"'

        req2 = f'DESCRIBE {uri_req} RTSP/1.0\r\nCSeq: 2\r\nAuthorization: {auth_hdr}\r\n\r\n'
        s.sendall(req2.encode())
        res2 = s.recv(4096).decode('utf-8', errors='ignore')
        first_line = res2.splitlines()[0] if res2 else 'EMPTY'
        print(f"req='{uri_req}', digest='{uri_digest}', qop={use_qop}, user='{user}', pwd='{pwd}': {first_line}")
        if '200 OK' in first_line:
            print(">>> SUCCESS! <<<")
            print(res2[:300])
            return True
    except Exception as e:
        print(f"Error: {e}")
    finally:
        s.close()
    return False

if __name__ == '__main__':
    users = ['admin', 'user', 'bibek', 'safevision', 'root']
    passwords = ['admin', '123456', 'password', 'bibek', '1234', '12345', 'admin123', 'pass']
    full_url = 'rtsp://192.168.137.82:4447/h264.sdp'
    
    # First test admin with all password candidates across URI variants
    for pwd in passwords:
        for u in ['admin', 'user', 'bibek']:
            if test_variant(full_url, full_url, u, pwd, True):
                sys.exit(0)
            if test_variant(full_url, '/h264.sdp', u, pwd, True):
                sys.exit(0)
            if test_variant(full_url, full_url, u, pwd, False):
                sys.exit(0)
