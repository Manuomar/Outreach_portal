import requests
import json
from config_manager import ConfigManager

cfg = ConfigManager.get_instance().bolna()
headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
agent_id = cfg["agent_id"]
cat_id = "f56d4592-0769-4329-ba03-178d2398dfb3"
base = cfg["base_url"]

dispositions = [
    {
        "name": "IT Head Phone",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "What is the contact or phone number of the IT Head or technical person mentioned by the prospect? Return digits only.",
        "is_subjective": True,
        "is_objective": False,
    },
    {
        "name": "Meeting Agreed",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "Did the prospect agree to a call or demo with the IT Head or technical team?",
        "is_subjective": False,
        "is_objective": True,
        "options": ["Yes", "No", "Not discussed"],
    },
    {
        "name": "Meeting Date",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "What date or day phrase was mentioned for the call with the IT Head (e.g. kal, tomorrow, specific date)?",
        "is_subjective": True,
        "is_objective": False,
    },
    {
        "name": "Meeting Time",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "What time was mentioned for the call with the IT Head (e.g. 5:00 PM, 17:00, shaam 5 baje)?",
        "is_subjective": True,
        "is_objective": False,
    },
    {
        "name": "Interest Status",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "What is the prospect's interest level regarding ITI CCIMS?",
        "is_subjective": False,
        "is_objective": True,
        "options": ["interested", "maybe", "callback_requested", "not_interested"],
    },
    {
        "name": "Call Summary",
        "agent_id": agent_id,
        "category_id": cat_id,
        "question": "Provide a 1-2 sentence summary of the key discussion points.",
        "is_subjective": True,
        "is_objective": False,
    },
]

for d in dispositions:
    r = requests.post(f"{base}/dispositions/", headers=headers, json=d)
    print(f"Created '{d['name']}': status {r.status_code}")
    if not r.ok:
        print("  Error:", r.text)
