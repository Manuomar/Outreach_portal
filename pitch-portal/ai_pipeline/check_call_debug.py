import json
import sys
from bolna_call_cli import _cfg_for_call, _exec_id, _headers
import requests

for call_id in [132, 131, 128]:
    cfg = _cfg_for_call(call_id)
    row = _exec_id(call_id)
    exec_id = row["bolna_execution_id"] if row else None
    if not exec_id:
        continue
    url = f"{cfg['base_url']}/executions/{exec_id}"
    r = requests.get(url, headers=_headers(cfg), timeout=15)
    print(f"=== CALL {call_id} (Exec: {exec_id}, HTTP {r.status_code}) ===")
    if r.ok:
        data = r.json()
        print("Status:", data.get("status"))
        print("Transcript:", data.get("transcript"))
        print("Messages:")
        for m in data.get("messages", []):
            print(f"  [{m.get('role')}]: {m.get('content')}")
        print("Extracted Data:", json.dumps(data.get("extracted_data"), ensure_ascii=False))
        if "telephony_data" in data:
            print("Duration:", data["telephony_data"].get("duration"))
    else:
        print("Err:", r.text[:300])
