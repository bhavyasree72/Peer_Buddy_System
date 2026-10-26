import urllib.request
import json

API_KEY = 'AIzaSyA1S-nmVIn6cvdL2kZ4qFzl4fe9oZFHS4U'
url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}'

accounts = [
    ('admin.test@gmail.com', 'AdminTest@123'),
    ('admin.test@gmail.com', 'SecurePassword@123'),
    ('test.student@gmail.com', 'SecurePassword@123'),
    ('test.mentor@gmail.com', 'SecurePassword@123'),
    ('test.faculty@gmail.com', 'SecurePassword@123')
]

for email, pwd in accounts:
    body = json.dumps({'email': email, 'password': pwd, 'returnSecureToken': True}).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"{email} ({pwd}) -> SUCCESS (uid: {data.get('localId')}, emailVerified: {data.get('emailVerified')})")
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode('utf-8'))
        print(f"{email} ({pwd}) -> Error: {err.get('error', {}).get('message')}")
    except Exception as e:
        print(f"{email} -> Error: {e}")
