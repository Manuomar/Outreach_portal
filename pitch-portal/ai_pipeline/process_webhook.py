"""CI4 /api/bolna/webhook isko background me chalata hai:  python process_webhook.py <payload.json>"""
import json
import logging
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from webhook_processor import process_payload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if __name__ == "__main__":
    p = Path(sys.argv[1])
    data = json.loads(p.read_text(encoding="utf-8"))
    print(json.dumps(process_payload(data), default=str))
    try:
        p.unlink()
    except OSError:
        pass
