"""
config_manager.py
config.json + environment variables + (optional) CodeIgniter ../.env se settings padhta hai.
Priority: ENV > config.json > ../.env (sirf database ke liye).
"""
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("AJAY_CONFIG", HERE / "config.json"))


def _read_ci_env():
    """backend/.env (CodeIgniter) se database.default.* nikalo."""
    out = {}
    p = HERE.parent / ".env"
    if not p.exists():
        return out
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip("'\"")
    return out


class ConfigManager:
    _inst = None

    def __init__(self):
        self.config = {}
        if CONFIG_PATH.exists():
            self.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    @classmethod
    def get_instance(cls):
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    # ---- sections -------------------------------------------------------
    def section(self, name):
        return self.config.get(name, {}) or {}

    def bolna(self):
        c = dict(self.section("bolna"))
        c["api_key"] = os.environ.get("BOLNA_API_KEY") or c.get("api_key", "")
        c["agent_id"] = os.environ.get("BOLNA_AGENT_ID") or c.get("agent_id", "")
        c["base_url"] = (c.get("base_url") or "https://api.bolna.ai").rstrip("/")
        return c

    def gemini(self):
        c = dict(self.section("gemini"))
        env_keys = os.environ.get("GEMINI_API_KEYS", "")
        keys = [k.strip() for k in env_keys.split(",") if k.strip()] or c.get("api_keys", [])
        c["api_keys"] = [k for k in keys if k and not k.startswith("GEMINI_KEY")]
        c.setdefault("models", ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"])
        c.setdefault("temperature", 0.0)
        return c

    def database(self):
        c = dict(self.section("database"))
        ci = _read_ci_env()
        if not c:
            c = {
                "host": ci.get("database.default.hostname", "127.0.0.1"),
                "port": int(ci.get("database.default.port", 3306) or 3306),
                "database": ci.get("database.default.database", "ajay_pitch"),
                "user": ci.get("database.default.username", "root"),
                "password": ci.get("database.default.password", ""),
                "charset": "utf8mb4",
            }
        for env, key in (("DB_HOST", "host"), ("DB_PORT", "port"), ("DB_NAME", "database"),
                         ("DB_USER", "user"), ("DB_PASSWORD", "password")):
            if os.environ.get(env):
                c[key] = int(os.environ[env]) if key == "port" else os.environ[env]
        return c

    def agent(self):
        return self.section("agent")

    def tz_offset_minutes(self):
        return int(self.config.get("timezone_offset_minutes", 330))
