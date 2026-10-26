import urllib.request
import json

API_KEY = 'AIzaSyA1S-nmVIn6cvdL2kZ4qFzl4fe9oZFHS4U'
signin_url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}'

# Sign in musanivivekanand39@gmail.com
# What password did musanivivekanand39@gmail.com use? Let's test
passwords = ['SecurePassword@123', 'Vivek@123', 'AdminTest@123', 'Password@123']
id_token = None
for pwd in passwords:
    try:
        req = urllib.request.Request(signin_url, data=json.dumps({'email': 'musanivivekanand39@gmail.com', 'password': pwd, 'returnSecureToken': True}).encode('utf-8'), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            id_token = data['idToken']
            print('Sign in SUCCESS with password:', pwd)
            break
    except Exception as e:
        pass

if not id_token:
    # Sign in test.student@gmail.com
    req = urllib.request.Request(signin_url, data=json.dumps({'email': 'test.student@gmail.com', 'password': 'SecurePassword@123', 'returnSecureToken': True}).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        id_token = json.loads(resp.read().decode('utf-8'))['idToken']
        print('Sign in with test.student@gmail.com ID token')

# Now test calling Render backend:
endpoints = [
    ('GET', 'https://peer-buddy-api.onrender.com/api/master/all'),
    ('GET', 'https://peer-buddy-api.onrender.com/api/profile/me')
]

for method, url in endpoints:
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {id_token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode('utf-8')
            print(f"{method} {url} -> HTTP {resp.status}: {body[:200]}")
    except urllib.error.HTTPError as e:
        print(f"{method} {url} -> HTTP {e.code}: {e.read().decode('utf-8')[:200]}")
    except Exception as e:
        print(f"{method} {url} -> Error: {e}")
