import json

with open("users.json") as f:
    fb_users = json.load(f)["users"]
with open("server/src/database/firestore_local_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

for u in fb_users:
    uid = u["localId"]
    email = u["email"]
    print(f"=== FB USER {email} (UID: {uid}) ===")
    in_users = uid in cache.get("users", {})
    in_sp = uid in cache.get("student_profiles", {})
    in_stp = uid in cache.get("staff_profiles", {})
    print(f"  By UID: users={in_users}, student_profiles={in_sp}, staff_profiles={in_stp}")
    found = [(k, v.get("role")) for k, v in cache.get("users", {}).items() if v.get("email") == email]
    print(f"  By Email in users: {found}")
    for k, r in found:
        print(f"    found key {k}: in sp={k in cache.get('student_profiles', {})}, in stp={k in cache.get('staff_profiles', {})}")
