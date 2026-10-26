import json
import os
import urllib.request
import urllib.parse
import sys

def get_auth_token():
    config_path = os.path.expanduser('~/.config/configstore/firebase-tools.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data['tokens']['access_token']

def to_firestore_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [to_firestore_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: to_firestore_value(val) for k, val in v.items() if not k.startswith('_')}}}
    return {"stringValue": str(v)}

def to_firestore_doc(data_dict):
    fields = {}
    for k, v in data_dict.items():
        if k.startswith('_'):
            continue
        fields[k] = to_firestore_value(v)
    return {"fields": fields}

def upload_document(token, project_id, collection, doc_id, doc_data):
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/{collection}/{urllib.parse.quote(doc_id, safe='')}"
    payload = json.dumps(to_firestore_doc(doc_data)).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }, method='PATCH')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"Error uploading {collection}/{doc_id}: HTTP {e.code} - {err_msg[:200]}")
        return False
    except Exception as e:
        print(f"Exception uploading {collection}/{doc_id}: {e}")
        return False

def main():
    token = get_auth_token()
    project_id = 'seproject-feefe'
    cache_path = os.path.abspath('server/src/database/firestore_local_cache.json')
    
    with open(cache_path, 'r', encoding='utf-8') as f:
        cache = json.load(f)

    # Core collections to sync in priority order
    collections_to_sync = [
        'schools',
        'programs',
        'skills',
        'interests',
        'settings',
        'users',
        'student_profiles',
        'staff_profiles',
        'connections',
        'buddy_requests',
        'messages',
        'study_sessions',
        'session_attendance',
        'reviews',
        'resources',
        'resource_allocations',
        'notifications',
        'user_skills',
        'user_interests',
        'availability'
    ]

    total_uploaded = 0
    total_failed = 0

    for col in collections_to_sync:
        docs = cache.get(col, {})
        print(f"Syncing collection '{col}' ({len(docs)} documents)...")
        success_count = 0
        for doc_id, doc_data in docs.items():
            if upload_document(token, project_id, col, doc_id, doc_data):
                success_count += 1
                total_uploaded += 1
            else:
                total_failed += 1
        print(f"  -> '{col}': {success_count}/{len(docs)} uploaded successfully.")

    print(f"\nSync complete! Total uploaded: {total_uploaded}, Failed: {total_failed}")

if __name__ == '__main__':
    main()
