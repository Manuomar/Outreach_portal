"""
bolna_webhook.py  - LOCAL dev ke liye Flask webhook (production me CI4 /api/bolna/webhook use hota hai).
Run:  python bolna_webhook.py        (port 5000;  set BOLNA_WEBHOOK_PORT=5001 to change)
Phir:  cloudflared tunnel --url http://127.0.0.1:5000
Bolna dashboard me webhook:  https://<tunnel>.trycloudflare.com/bolna/webhook
"""
import json
import logging
import os

from flask import Flask, request

from config_manager import ConfigManager
from webhook_processor import process_payload, flatten_extracted

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
app = Flask(__name__)


def _secret_ok():
    secret = ConfigManager.get_instance().bolna().get("webhook_secret", "")
    return (not secret) or request.headers.get("X-Webhook-Secret", "") == secret


@app.route("/", methods=["GET"])
def home():
    return "Ajay webhook zinda hai", 200


@app.route("/bolna/webhook", methods=["POST", "GET"])
def webhook():
    if request.method == "GET":
        return "Webhook route zinda hai (POST se data aata hai)", 200
    if not _secret_ok():
        return {"ok": False, "error": "bad secret"}, 403
    data = request.get_json(silent=True) or {}
    print("BOLNA PAYLOAD:", json.dumps({"id": data.get("id"), "status": data.get("status"),
          "keys": list(flatten_extracted(data.get("extracted_data")).keys())}, ensure_ascii=False))
    return process_payload(data), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("BOLNA_WEBHOOK_PORT", "5000")))
