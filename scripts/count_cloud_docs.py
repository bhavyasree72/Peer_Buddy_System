import json, os, urllib.request

p = os.path.expanduser('~/.config/configstore/firebase-tools.json')
with open(p) as f:
    token = json.load(f)['tokens']['access_token']

for col in ['schools', 'programs', 'users', 'student_profiles', 'staff_profiles', 'skills']:
    url = f'https://firestore.googleapis.com/v1/projects/seproject-feefe/databases/(default)/documents/{col}?pageSize=100'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"{col}: {len(data.get('documents', []))} docs")
    except Exception as e:
        print(f"{col}: error {e}")
