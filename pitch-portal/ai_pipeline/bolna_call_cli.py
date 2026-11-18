"""
bolna_call_cli.py  - CI4 backend isko shell se chalata hai, output hamesha ek JSON line.
  python bolna_call_cli.py start  --lead-id 5
  python bolna_call_cli.py sync   --call-id 12      (Bolna se status/transcript kheench ke DB update; webhook na ho tab bhi chalta hai)
  python bolna_call_cli.py hangup --call-id 12
"""
import argparse
import json
import logging
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import requests

from config_manager import ConfigManager
from db import get_db_connection
from webhook_processor import process_payload, FINAL, STATUS_MAP

logging.disable(logging.INFO)


def _cfg():
    return ConfigManager.get_instance().bolna()


def _cfg_for_agent(target_agent_id=None, conn=None):
    base_cfg = _cfg()
    if not target_agent_id:
        return base_cfg
    close_conn = False
    if conn is None:
        try:
            conn = get_db_connection()
            close_conn = True
        except Exception:
            return base_cfg
    try:
        with conn.cursor() as c:
            c.execute("""
                SELECT ba.api_key, ba.base_url
                FROM pitch_agents pa
                JOIN pitch_bolna_accounts ba ON pa.bolna_account_id = ba.id
                WHERE (pa.bolna_agent_id = %s OR pa.id = %s) AND ba.is_active = 1
                LIMIT 1
            """, (str(target_agent_id), int(target_agent_id) if str(target_agent_id).isdigit() else 0))
            row = c.fetchone()
            if row and row.get("api_key"):
                cfg = dict(base_cfg)
                cfg["api_key"] = row["api_key"]
                if row.get("base_url"):
                    cfg["base_url"] = row["base_url"].rstrip("/")
                return cfg
    except Exception:
        pass
    finally:
        if close_conn:
            try:
                conn.close()
            except Exception:
                pass
    return base_cfg


def _cfg_for_call(call_id):
    base_cfg = _cfg()
    try:
        conn = get_db_connection()
    except Exception:
        return base_cfg
    try:
        with conn.cursor() as c:
            c.execute("""
                SELECT ba.api_key, ba.base_url
                FROM pitch_calls pc
                LEFT JOIN pitch_agents pa ON (pc.agent_id = pa.id OR pc.bolna_agent_id = pa.bolna_agent_id)
                LEFT JOIN pitch_bolna_accounts ba ON pa.bolna_account_id = ba.id
                WHERE pc.id = %s AND ba.is_active = 1
                LIMIT 1
            """, (call_id,))
            row = c.fetchone()
            if row and row.get("api_key"):
                cfg = dict(base_cfg)
                cfg["api_key"] = row["api_key"]
                if row.get("base_url"):
                    cfg["base_url"] = row["base_url"].rstrip("/")
                return cfg
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return base_cfg


def _headers(cfg):
    return {"Authorization": f"Bearer {cfg['api_key']}"}


def _fmt_phone(p):
    p = str(p).strip().replace(" ", "").replace("-", "")
    if p.startswith("+"):
        return p
    if len(p) == 10:
        return "+91" + p
    return "+" + p.lstrip("0")


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, default=str))


def start(lead_id, agent_id=None, from_phone_number=None):
    default_cfg = _cfg()
    target_agent_id = agent_id or default_cfg.get("agent_id")
    cfg = _cfg_for_agent(target_agent_id)
    if not cfg["api_key"] or not target_agent_id:
        return out({"success": False, "error": "Missing bolna.api_key or bolna.agent_id in configuration"})
    conn = get_db_connection()
    try:
        with conn.cursor() as c:
            c.execute("SELECT * FROM pitch_leads WHERE id=%s", (lead_id,))
            lead = c.fetchone()
            if not lead:
                return out({"success": False, "error": "Lead record not found"})
            
            # Lookup pitch_agents ID and from_phone_number if exists
            agent_db_id = None
            agent_from_number = None
            try:
                c.execute("SELECT id, bolna_agent_id, from_phone_number FROM pitch_agents WHERE bolna_agent_id=%s OR id=%s LIMIT 1",
                          (str(target_agent_id), int(target_agent_id) if str(target_agent_id).isdigit() else 0))
                agent_row = c.fetchone()
                if agent_row:
                    agent_db_id = agent_row.get("id")
                    agent_from_number = agent_row.get("from_phone_number")
                    if not target_agent_id or str(target_agent_id).isdigit():
                        target_agent_id = agent_row.get("bolna_agent_id")
            except Exception:
                pass

            effective_from = from_phone_number or agent_from_number or cfg.get("from_phone_number")
            if effective_from:
                effective_from = str(effective_from).strip()

            c.execute("INSERT INTO pitch_calls (lead_id, agent_id, bolna_agent_id, from_phone_number, call_status) VALUES (%s,%s,%s,%s,'queued')",
                      (lead_id, agent_db_id, target_agent_id, effective_from or None))
            call_id = c.lastrowid
        conn.commit()

        payload = {
            "agent_id": target_agent_id,
            "recipient_phone_number": _fmt_phone(lead["phone"]),
            "user_data": {
                "contact_name": lead.get("contact_name") or "",
                "organization": lead.get("organization") or "",
                "designation": lead.get("designation") or "",
                "live_call_id": str(call_id),
                "lead_id": str(lead_id),
            },
        }
        if effective_from:
            payload["from_phone_number"] = _fmt_phone(effective_from)
        r = requests.post(f"{cfg['base_url']}/call", json=payload, headers=_headers(cfg), timeout=30)
        try:
            body = r.json()
        except ValueError:
            body = {"raw": r.text}
        exec_id = body.get("execution_id") or body.get("run_id") or body.get("id")
        with conn.cursor() as c:
            if r.ok and exec_id:
                c.execute("UPDATE pitch_calls SET call_status='ringing', bolna_execution_id=%s, started_at=NOW() WHERE id=%s",
                          (exec_id, call_id))
                ok = True
            else:
                c.execute("UPDATE pitch_calls SET call_status='failed', summary=%s WHERE id=%s",
                          (f"Bolna API {r.status_code}: {str(body)[:300]}", call_id))
                ok = False
        conn.commit()
        out({"success": ok, "call_id": call_id, "execution_id": exec_id,
             **({} if ok else {"error": f"Bolna API {r.status_code}: {body}"})})
    except Exception as e:
        out({"success": False, "error": str(e)})
    finally:
        conn.close()


def _exec_id(call_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as c:
            c.execute("SELECT bolna_execution_id, call_status FROM pitch_calls WHERE id=%s", (call_id,))
            return c.fetchone()
    finally:
        conn.close()


def sync(call_id):
    cfg = _cfg_for_call(call_id)
    row = _exec_id(call_id)
    if not row or not row["bolna_execution_id"]:
        return out({"success": False, "error": "Bolna execution ID not found"})
    if row.get("call_status") == "queued":
        # Call has been manually placed in queue to call again — do not overwrite with old completed execution
        return out({"success": True, "skipped": "Call is queued for re-dial"})
    try:
        r = requests.get(f"{cfg['base_url']}/executions/{row['bolna_execution_id']}", headers=_headers(cfg), timeout=15)
        if not r.ok:
            return out({"success": False, "error": f"Bolna {r.status_code}"})
        data = r.json()
        data.setdefault("id", row["bolna_execution_id"])
        data.setdefault("live_call_id", call_id)
        res = process_payload(data)
        out({"success": True, **res})
    except Exception as e:
        out({"success": False, "error": str(e)})


def hangup(call_id):
    cfg = _cfg_for_call(call_id)
    row = _exec_id(call_id)
    if not row or not row["bolna_execution_id"]:
        return out({"success": False, "error": "Bolna execution ID not found"})
    sid = row["bolna_execution_id"]
    details = {}
    try:
        r = requests.post(f"{cfg['base_url']}/call/{sid}/stop", headers=_headers(cfg), timeout=10)
        details["bolna_stop"] = {"status": r.status_code, "body": r.text[:200]}
    except Exception as e:
        details["bolna_stop_err"] = str(e)
    # Bolna /stop in-progress calls pe 400 de sakta hai -> Twilio se hard hangup (agar configured)
    try:
        tw = ConfigManager.get_instance().section("twilio")
        er = requests.get(f"{cfg['base_url']}/executions/{sid}", headers=_headers(cfg), timeout=10)
        pcid = ((er.json().get("telephony_data") or {}).get("provider_call_id")) if er.ok else None
        if tw.get("account_sid") and tw.get("auth_token") and pcid and str(pcid).startswith("CA"):
            from twilio.rest import Client
            Client(tw["account_sid"], tw["auth_token"]).calls(pcid).update(status="completed")
            details["twilio_dropped"] = pcid
    except Exception as e:
        details["twilio_err"] = str(e)
    conn = get_db_connection()
    try:
        with conn.cursor() as c:
            c.execute("""UPDATE pitch_calls SET call_status='busy', end_time=COALESCE(end_time,NOW())
                         WHERE id=%s AND call_status IN ('queued','ringing','in_progress')""", (call_id,))
        conn.commit()
    finally:
        conn.close()
    out({"success": True, "details": details})


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    start_p = sub.add_parser("start")
    start_p.add_argument("--lead-id", type=int, required=True)
    start_p.add_argument("--agent-id", type=str, default=None)
    start_p.add_argument("--from-phone-number", type=str, default=None)
    sub.add_parser("sync").add_argument("--call-id", type=int, required=True)
    sub.add_parser("hangup").add_argument("--call-id", type=int, required=True)
    a = p.parse_args()
    {"start": lambda: start(a.lead_id, a.agent_id, a.from_phone_number), "sync": lambda: sync(a.call_id), "hangup": lambda: hangup(a.call_id)}[a.cmd]()
