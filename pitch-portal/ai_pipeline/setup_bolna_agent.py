"""
setup_bolna_agent.py - Bolna par agent "Ajay" ko configure aur update karta hai.
  python setup_bolna_agent.py --print      # sirf final prompt dikhao / prompts/final_prompt.txt me save
  python setup_bolna_agent.py --update     # existing agent_id par prompt + welcome message update karo (PUT /v2/agent/{id})
  python setup_bolna_agent.py --create     # naya agent banao (POST /v2/agent)
"""
import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import requests

from config_manager import ConfigManager

HERE = Path(__file__).resolve().parent


def build_prompt():
    prompt = (HERE / "prompts/ajay_system_prompt.md").read_text(encoding="utf-8")
    kb = (HERE / "knowledge_base/KNOWLEDGE_BASE.md").read_text(encoding="utf-8")
    company = ConfigManager.get_instance().agent().get("company_name", "Vdai Biosec")
    return prompt.replace("{{KNOWLEDGE_BASE}}", kb.replace("COMPANY_NAME_YAHAN", company))


def update_agent(prompt):
    cfg = ConfigManager.get_instance().bolna()
    agent_id = cfg.get("agent_id")
    if not agent_id:
        print("ERROR: Missing bolna.agent_id in config.json!")
        return

    headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
    # 1. Fetch current agent config
    r = requests.get(f"{cfg['base_url']}/agent/{agent_id}", headers=headers, timeout=20)
    if not r.ok:
        print(f"ERROR fetching agent ({r.status_code}): {r.text[:400]}")
        return

    data = r.json()
    welcome = (HERE / "prompts/welcome_message.txt").read_text(encoding="utf-8").strip()

    tasks = data.get("tasks", [])
    if tasks:
        tc = tasks[0].setdefault("task_config", {})
        tc["hangup_after_silence"] = 40
        tc["trigger_user_online_message_after"] = 15
        tc["number_of_words_for_interruption"] = 1
        if "tools_config" in tasks[0] and "synthesizer" in tasks[0]["tools_config"]:
            tasks[0]["tools_config"]["synthesizer"]["caching"] = False

    payload = {
        "agent_config": {
            "agent_name": "Ajay",
            "agent_welcome_message": welcome,
            "tasks": tasks
        },
        "agent_prompts": {
            "task_1": {"system_prompt": prompt}
        },
        "composition_by_language": {
            "hi": [{"type": "text", "text": prompt}]
        }
    }

    # 2. PUT /v2/agent/{id}
    r2 = requests.put(f"{cfg['base_url']}/v2/agent/{agent_id}", headers=headers, json=payload, timeout=30)
    if r2.ok:
        print(f"SUCCESS: Agent {agent_id} successfully updated on Bolna!")
        print(f"Status: {r2.json()}")
    else:
        print(f"ERROR updating agent ({r2.status_code}): {r2.text[:400]}")


def build_payload(prompt):
    a = ConfigManager.get_instance().agent()
    welcome = (HERE / "prompts/welcome_message.txt").read_text(encoding="utf-8").strip()
    return {
        "agent_config": {
            "agent_name": a.get("name", "Ajay"),
            "agent_welcome_message": welcome,
            "webhook_url": a.get("webhook_url") or None,
            "tasks": [{
                "task_type": "conversation",
                "toolchain": {"execution": "parallel", "pipelines": [["transcriber", "llm", "synthesizer"]]},
                "tools_config": {
                    "input": {"format": "wav", "provider": "vobiz"},
                    "output": {"format": "wav", "provider": "vobiz"},
                    "transcriber": {"provider": "deepgram", "model": "nova-3", "language": a.get("language", "hi"),
                                    "stream": True, "sampling_rate": 16000, "encoding": "linear16", "endpointing": 200},
                    "llm_agent": {"agent_type": "simple_llm_agent", "agent_flow_type": "streaming",
                                  "llm_config": {"provider": a.get("llm_provider", "anthropic"), "model": a.get("llm_model", "claude-sonnet-4-20250514"),
                                                 "max_tokens": 250, "temperature": 0.2}},
                    "synthesizer": {"provider": a.get("voice_provider", "elevenlabs"),
                                    "provider_config": {"voice": a.get("voice_name", ""), "voice_id": a.get("voice_id", ""),
                                                        "model": a.get("voice_model", "eleven_turbo_v2_5")},
                                    "stream": True, "buffer_size": 220, "audio_format": "wav"},
                },
                "task_config": {"hangup_after_silence": 40, "trigger_user_online_message_after": 15, "number_of_words_for_interruption": 1, "call_terminate": 300},
            }],
        },
        "agent_prompts": {"task_1": {"system_prompt": prompt}},
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true", help="Print and save final prompt")
    ap.add_argument("--update", action="store_true", help="Update existing agent on Bolna using agent_id from config.json")
    ap.add_argument("--create", action="store_true", help="Create new agent on Bolna")
    args = ap.parse_args()

    prompt = build_prompt()
    (HERE / "prompts/final_prompt.txt").write_text(prompt, encoding="utf-8")
    print(f"final prompt saved: prompts/final_prompt.txt  ({len(prompt)} chars)")

    if args.update:
        update_agent(prompt)
    elif args.create:
        cfg = ConfigManager.get_instance().bolna()
        r = requests.post(f"{cfg['base_url']}/v2/agent", json=build_payload(prompt),
                          headers={"Authorization": f"Bearer {cfg['api_key']}"}, timeout=40)
        print(r.status_code, r.text[:800])
        if r.status_code in (200, 201):
            print("\n>>> config.json me bolna.agent_id =", r.json().get("agent_id"))
