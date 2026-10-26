import urllib.request
import json

API_KEY = 'AIzaSyA1S-nmVIn6cvdL2kZ4qFzl4fe9oZFHS4U'
signin_url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}'
lookup_url = f'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={API_KEY}'

for email in ['test.mentor@gmail.com', 'test.faculty@gmail.com']:
    req = urllib.request.Request(signin_url, data=json.dumps({'email': email, 'password': 'SecurePassword@123', 'returnSecureToken': True}).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        id_token = json.loads(resp.read().decode('utf-8'))['idToken']
    lookup_req = urllib.request.Request(lookup_url, data=json.dumps({'idToken': id_token}).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(lookup_req) as resp:
        user_info = json.loads(resp.read().decode('utf-8'))['users'][0]
        print(f"{email} -> emailVerified: {user_info.get('emailVerified')}")
