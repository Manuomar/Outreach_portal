"""
webhook_processor.py
Bolna ka execution/webhook payload -> MySQL (pitch_calls, pitch_call_turns, pitch_call_answers, pitch_leads).
Teen jagah se use hota hai:  bolna_webhook.py (Flask), process_webhook.py (CI4 webhook), bolna_call_cli.py sync.
"""
import json
import logging
import re
import sys
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from config_manager import ConfigManager
from db import get_db_connection
import reasoning

log = logging.getLogger("Processor")

STATUS_MAP = {
    "completed": "completed", "call-disconnected": "completed", "call_disconnected": "completed",
    "call-ended": "completed", "call_ended": "completed", "ended": "completed", "stopped": "completed",
    "hangup": "completed", "finished": "completed", "done": "completed", "success": "completed",
    "busy": "busy", "no-answer": "no_answer", "no_answer": "no_answer",
    "failed": "failed", "canceled": "failed", "cancelled": "failed", "error": "failed",
    "in-progress": "in_progress", "in_progress": "in_progress",
    "initiated": "ringing", "queued": "ringing", "ringing": "ringing", "scheduled": "ringing",
}
FINAL = {"completed", "busy", "no_answer", "failed"}


def find_value(obj, names):
    if isinstance(obj, dict):
        for n in names:
            if n in obj and obj[n] not in (None, ""):
                return obj[n]
        for v in obj.values():
            r = find_value(v, names)
            if r not in (None, ""):
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_value(v, names)
            if r not in (None, ""):
                return r
    return None


def flatten_extracted(ed):
    out = {}

    def walk(key, val):
        if isinstance(val, dict) and ("subjective" in val or "objective" in val):
            v = val.get("objective")
            out[key] = (v if v not in (None, "") else val.get("subjective"), val.get("confidence"))
        elif isinstance(val, dict):
            for k, v in val.items():
                walk(k, v)
        else:
            out[key] = (val, None)

    if isinstance(ed, str):
        try:
            ed = json.loads(ed)
        except ValueError:
            return {}
    if isinstance(ed, dict):
        for k, v in ed.items():
            walk(k, v)
    return out


def parse_turns(transcript):
    parts = re.split(r"(?m)^\s*(assistant|user)\s*:\s*", transcript or "")
    turns = []
    for i in range(1, len(parts) - 1, 2):
        spk = "agent" if parts[i] == "assistant" else "prospect"
        txt = re.sub(r"\s+", " ", parts[i + 1]).strip()
        if txt:
            turns.append((spk, txt))
    return turns


def now_ist():
    off = ConfigManager.get_instance().tz_offset_minutes()
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(minutes=off))).replace(tzinfo=None)


def _norm_phone(p):
    if not p:
        return None
    d = re.sub(r"\D", "", str(p))
    return d[-10:] if len(d) >= 10 else (d or None)


def process_payload(data):
    """returns dict(ok, saved, call_id, ...)"""
    exec_id = data.get("id") or data.get("execution_id")
    call_id = find_value(data, ["live_call_id", "call_id_ref"])

    conn = get_db_connection()
    try:
        with conn.cursor() as c:
            if not call_id and exec_id:
                c.execute("SELECT id FROM pitch_calls WHERE bolna_execution_id=%s ORDER BY id DESC LIMIT 1", (exec_id,))
                row = c.fetchone()
                call_id = row["id"] if row else None
            if not call_id:
                log.info("Matching call row nahi mili (exec=%s)", exec_id)
                return {"ok": True, "saved": False}
            call_id = int(call_id)

            raw = str(data.get("status") or "completed").lower()
            status = STATUS_MAP.get(raw, raw.replace("-", "_"))
            if status not in ("queued", "ringing", "in_progress") and status not in FINAL:
                status = "completed" if any(x in raw for x in ("end", "stop", "comp", "done", "hang", "disc", "fin")) else "failed"

            transcript = data.get("transcript") or ""
            if not isinstance(transcript, str):
                transcript = json.dumps(transcript, ensure_ascii=False)
            try:
                duration = int(float(find_value(data, ["conversation_duration", "duration"]) or 0))
            except (TypeError, ValueError):
                duration = 0
            recording = find_value(data, ["recording_url"])

            # Parse conversation turns early to detect whether the prospect actually spoke/picked up
            turns = parse_turns(transcript)
            has_prospect_turn = any(s == "prospect" for s, _ in turns)

            telephony_raw = str(find_value(data, ["telephony_status", "call_status", "sip_status", "disconnect_reason", "error_message"]) or "").lower()
            is_explicit_no_answer = any(x in raw or x in telephony_raw for x in ("no-answer", "no_answer", "not_answered", "unanswered", "ring_timeout", "no answer", "unreachable"))

            # Determine whether call was picked up or unanswered
            if is_explicit_no_answer:
                status = "no_answer"
            elif status == "completed" and (duration == 0 or not has_prospect_turn) and duration < 8:
                # Call disconnected before prospect ever spoke or picked up
                status = "no_answer"
            elif status == "completed" and duration < 10:
                # Call was connected briefly (<10s) but disconnected early / user busy
                status = "busy"

            # Bolna extractions (extracted_data, custom_extractions, etc.)
            fields = {}
            for src_key in ["extracted_data", "custom_extractions", "agent_extraction", "node_extracted_data"]:
                src_val = data.get(src_key)
                if src_val:
                    fields.update(flatten_extracted(src_val))
            hints = {k: v for k, (v, _) in fields.items() if v not in (None, "") and str(v).lower() != "null"}

            sets, params = ["call_status=%s"], [status]
            if status in FINAL:
                sets.append("end_time=COALESCE(end_time, NOW())")
            if duration > 0:
                sets.append("duration_sec=GREATEST(IFNULL(duration_sec,0), %s)"); params.append(duration)
            if recording:
                sets.append("recording_url=%s"); params.append(recording)
            if transcript.strip():
                sets.append("transcript=%s"); params.append(transcript)

            analysis, turns, rows = {}, [], []
            if status in FINAL:
                analysis = reasoning.analyze(transcript, hints, now_ist())
                if status in ("busy", "no_answer", "failed") and not transcript.strip():
                    analysis["interest_status"] = "not_reachable"
                    analysis["who_answered"] = "no_answer" if status == "no_answer" else "unknown"
                elif status == "no_answer":
                    analysis["interest_status"] = "not_reachable"
                    analysis["who_answered"] = "no_answer"
                agreed = analysis.get("it_head_call_agreed")
                sets += ["interest_status=%s", "interest_reason=%s", "who_answered=%s", "it_head_call_agreed=%s",
                         "it_head_name=%s", "it_head_phone=%s", "it_head_call_date=%s", "it_head_call_time=%s",
                         "it_head_call_raw=%s", "dialect_detected=%s", "summary=%s", "next_action=%s", "analysis_json=%s"]
                params += [analysis.get("interest_status"), analysis.get("interest_reason"), analysis.get("who_answered"),
                           None if agreed is None else int(bool(agreed)), analysis.get("it_head_name"),
                           _norm_phone(analysis.get("it_head_phone")), analysis.get("it_head_call_date"),
                           analysis.get("it_head_call_time"), analysis.get("it_head_call_text"),
                           analysis.get("dialect_detected"), analysis.get("summary"), analysis.get("next_action"),
                           json.dumps(analysis, ensure_ascii=False, default=str)]
            params.append(call_id)
            c.execute(f"UPDATE pitch_calls SET {', '.join(sets)} WHERE id=%s", tuple(params))

            turns = parse_turns(transcript)
            if turns:
                c.execute("DELETE FROM pitch_call_turns WHERE call_id=%s", (call_id,))
                c.executemany("INSERT INTO pitch_call_turns (call_id, idx, speaker, text) VALUES (%s,%s,%s,%s)",
                              [(call_id, i, s, t) for i, (s, t) in enumerate(turns)])

            # Detect and track Call Transfer / Redirection
            is_trans = False
            for act in (data.get("actions") or data.get("tools_called") or []):
                if isinstance(act, dict) and "transfer" in (act.get("name") or act.get("key") or ""):
                    is_trans = True
                    break
            if not is_trans and transcript:
                if re.search(r"(कॉल ट्रांसफर|लाइन पर बने रहिए|transfer_call|transfer kar raha)", transcript, re.I):
                    is_trans = True
            if is_trans:
                try:
                    c.execute("""
                        SELECT pa.call_transfer_config 
                        FROM pitch_calls pc 
                        LEFT JOIN pitch_agents pa ON (pc.agent_id = pa.id OR pc.bolna_agent_id = pa.bolna_agent_id) 
                        WHERE pc.id = %s LIMIT 1
                    """, (call_id,))
                    ag_row = c.fetchone()
                    trans_num = None
                    if ag_row and ag_row.get("call_transfer_config"):
                        try:
                            tc = json.loads(ag_row["call_transfer_config"])
                            trans_num = tc.get("transfer_number") or tc.get("phone_number")
                        except Exception:
                            pass
                    c.execute("UPDATE pitch_calls SET call_transferred=1, transferred_to_number=COALESCE(%s, transferred_to_number) WHERE id=%s", (trans_num, call_id))
                except Exception:
                    pass

            # Save ONLY the fields extracted by the Bolna API
            if fields:
                c.execute("DELETE FROM pitch_call_answers WHERE call_id=%s", (call_id,))
                obsolete_keys = {'student_volume', 'college_count', 'current_verification_method'}
                rows = []
                for k, (v, conf) in fields.items():
                    if k in obsolete_keys:
                        continue
                    if v not in (None, "", [], "null", "None"):
                        try:
                            conf = float(conf) if conf is not None else 1.0
                        except (TypeError, ValueError):
                            conf = 1.0
                        rows.append((call_id, k, str(v), conf))
                if rows:
                    c.executemany(
                        """INSERT INTO pitch_call_answers (call_id, question_key, response_value, confidence_score)
                           VALUES (%s,%s,%s,%s)
                           ON DUPLICATE KEY UPDATE response_value=VALUES(response_value), confidence_score=VALUES(confidence_score)""",
                        rows)

            # =========================================================================
            # [CUSTOM REASONING ANSWERS INJECTION - COMMENTED OUT AS PER USER REQUEST]
            # DO NOT DELETE - KEEP FOR FUTURE RE-ACTIVATION IF NEEDED
            # =========================================================================
            # if analysis:
            #     answers = {
            #         "interest_status": analysis.get("interest_status"),
            #         "it_head_call_agreed": analysis.get("it_head_call_agreed"),
            #         "it_head_name": analysis.get("it_head_name"),
            #         "it_head_phone": analysis.get("it_head_phone"),
            #         "it_head_call_date": analysis.get("it_head_call_date"),
            #         "it_head_call_time": analysis.get("it_head_call_time"),
            #         "contact_role": analysis.get("contact_role"),
            #         "organization_type": analysis.get("organization_type"),
            #         "volume_hint": analysis.get("volume_hint"),
            #         "objections": ", ".join(analysis.get("objections") or []),
            #     }
            #     for k, v in {**hints, **{a: b for a, b in answers.items()}}.items():
            #         if v not in (None, "", []):
            #             conf = fields.get(k, (None, None))[1]
            #             conf = float(conf) if conf is not None else 1.0
            #             rows.append((call_id, k, str(v), conf))
            #     if rows:
            #         c.executemany(
            #             """INSERT INTO pitch_call_answers (call_id, question_key, response_value, confidence_score)
            #                VALUES (%s,%s,%s,%s)
            #                ON DUPLICATE KEY UPDATE response_value=VALUES(response_value), confidence_score=VALUES(confidence_score)""",
            #             rows)

                # lead ka status update
                lead_status = {"interested": "interested", "not_interested": "not_interested",
                               "callback_requested": "callback", "maybe": "contacted"}.get(analysis.get("interest_status"), "contacted")
                if analysis.get("it_head_call_agreed") and analysis.get("it_head_call_date"):
                    lead_status = "meeting_scheduled"
                if analysis.get("interest_status") == "not_reachable":
                    lead_status = "new"
                c.execute("UPDATE pitch_leads l JOIN pitch_calls pc ON pc.lead_id=l.id SET l.lead_status=%s WHERE pc.id=%s",
                          (lead_status, call_id))
        conn.commit()
        log.info("pitch_calls #%s: status=%s turns=%s interest=%s src=%s", call_id, status, len(turns),
                 analysis.get("interest_status"), analysis.get("_source"))
        return {"ok": True, "saved": True, "call_id": call_id, "status": status,
                "interest_status": analysis.get("interest_status")}
    except Exception as e:
        conn.rollback()
        log.exception("DB save error")
        return {"ok": False, "error": str(e)}
    finally:
        conn.close()
