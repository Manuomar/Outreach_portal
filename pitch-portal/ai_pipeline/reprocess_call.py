"""
reprocess_call.py - Syncs and re-processes call using Bolna API extractions.
Usage:
  python reprocess_call.py --call-id 7
  python reprocess_call.py --all
"""
import argparse
import logging
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from db import get_db_connection
import bolna_call_cli

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("Reprocessor")

def reprocess(call_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as c:
            c.execute("SELECT id, bolna_execution_id FROM pitch_calls WHERE id=%s", (call_id,))
            row = c.fetchone()
            if not row:
                log.error(f"Call #{call_id} not found")
                return False
            if row.get("bolna_execution_id"):
                log.info(f"Syncing Call #{call_id} from Bolna API (exec: {row['bolna_execution_id']})...")
                bolna_call_cli.sync(call_id)
                return True
            else:
                log.warning(f"Call #{call_id} has no bolna_execution_id")
                return False
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--call-id", type=int, help="Call ID to reprocess")
    parser.add_argument("--all", action="store_true", help="Reprocess all calls")
    args = parser.parse_args()

    if args.call_id:
        reprocess(args.call_id)
    elif args.all:
        conn = get_db_connection()
        try:
            with conn.cursor() as c:
                c.execute("SELECT id FROM pitch_calls WHERE bolna_execution_id IS NOT NULL")
                call_ids = [r["id"] for r in c.fetchall()]
            for cid in call_ids:
                reprocess(cid)
        finally:
            conn.close()
    else:
        print("Please provide --call-id <id> or --all")
