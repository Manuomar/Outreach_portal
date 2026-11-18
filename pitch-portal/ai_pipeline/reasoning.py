"""
reasoning.py
Call ke baad transcript aur Bolna extractions ko analyse karta hai:
  - Bolna extractions (dispositions/extracted_data) ko directly use karta hai
  - Custom reasoning / local regex parsing ko abhi user ke kehne par comment kar diya hai (DELETE NAHI KIYA HAI)
"""
import json
import logging
import re
import sys
from datetime import date, datetime, time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from config_manager import ConfigManager
from hindi_datetime import parse_datetime, validate_future

log = logging.getLogger("Reasoning")

INTEREST_VALUES = ["interested", "maybe", "callback_requested", "not_interested", "not_reachable", "unknown"]

DEV_NUMS = str.maketrans("०१२३४५६७८९", "0123456789")

WORD_TO_DIGIT = {
    # English single digits
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "oh": "0", "o": "0",
    # Hindi Devanagari single digits
    "शून्य": "0", "सुन्य": "0", "सिफर": "0",
    "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5", "पाँच": "5",
    "छह": "6", "छः": "6", "छे": "6", "सात": "7", "आठ": "8", "नौ": "9",
    # Hindi Latin transliteration
    "shunya": "0", "sunya": "0", "sifar": "0",
    "ek": "1", "do": "2", "teen": "3", "tin": "3", "char": "4", "chaar": "4",
    "panch": "5", "paanch": "5", "chhe": "6", "che": "6", "chheh": "6",
    "saat": "7", "sat": "7", "aath": "8", "ath": "8", "nau": "9",
    # Tens (English)
    "ten": "10", "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50",
    "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90",
    # Tens (Hindi)
    "दस": "10", "बीस": "20", "तीस": "30", "चालीस": "40", "पचास": "50",
    "साठ": "60", "सत्तर": "70", "अस्सी": "80", "नब्बे": "90",
}

NAME_NOISE_WORDS = {
    "ji", "jee", "sahab", "saheb", "saab", "sir", "madam", "maam", "ma'am", "ma", "am",
    "जी", "साहब", "साहिब", "साब", "सर", "मैडम", "मैम",
    "naam", "hai", "ka", "ki", "ke", "unka", "unki", "inke", "mera", "meri", "mere",
    "नाम", "है", "का", "की", "के", "उनका", "उनकी", "इनका", "मेरा", "मेरी", "मेरे",
    "it", "head", "आईटी", "हेड", "shubh", "शुभ", "hain", "हैं", "theek", "ठीक",
    "ha", "haan", "haa", "हाँ", "हा", "yes", "yeah", "yep", "ok", "okay",
    "sahi", "सही", "nahi", "नहीं", "nahin",
    "rahega", "rahenge", "hoga", "hogi", "hoge", "रहेगा", "रहेंगे", "होगा", "होगी", "होंगे",
    "bhi", "भी", "to", "तो", "aur", "और",
}

SYSTEM = """You analyse outbound B2B sales-call transcripts for the product "ITI CCIMS"
(AI voice survey + call-center platform for ITIs, skill missions, directorates).
The agent is AJAY (male). The caller side may speak Hindi, Hinglish, or UP/Bihar dialects
(Awadhi, Bhojpuri, Braj, Bundeli). Transcript may be Devanagari or Roman.

Return ONLY one JSON object with exactly these keys:
{
 "who_answered": "self" | "gatekeeper" | "relative" | "wrong_person" | "no_answer" | "unknown",
 "contact_role": string|null,
 "interest_status": "interested" | "maybe" | "callback_requested" | "not_interested" | "not_reachable" | "unknown",
 "interest_reason": short Hindi/English reason grounded in what was said,
 "it_head_call_agreed": true | false | null,
 "it_head_name": string|null,
 "it_head_phone": string|null (digits only, 10-digit if given),
 "it_head_call_text": exact phrase said about when (e.g. "kal subah 11 baje") or null,
 "it_head_call_date": "YYYY-MM-DD"|null,
 "it_head_call_time": "HH:MM" 24h|null,
 "dialect_detected": "Standard Hindi"|"Awadhi"|"Bhojpuri"|"Braj"|"Bundeli"|"Haryanvi"|"English"|"Other"|null,
 "organization_type": string|null,
 "volume_hint": string|null (e.g. "approx 2000 students/year"),
 "objections": [strings],
 "summary": 2-3 line summary in Hinglish,
 "next_action": one short line (e.g. "IT head ko Friday 11:00 par call/demo")
}
"""


def normalize_key(k: str) -> str:
    """Normalizes string by stripping whitespace, underscores, dashes, and lowercasing."""
    return re.sub(r"[\s_\-]+", "", (k or "").lower())


def match_hint(hints, aliases):
    """Matches any alias in hints (exact or normalized)."""
    if not hints:
        return None
    for a in aliases:
        if a in hints and hints[a] not in (None, "", "null", "None"):
            return str(hints[a]).strip()
    norm_hints = {normalize_key(k): v for k, v in hints.items()}
    for a in aliases:
        na = normalize_key(a)
        if na in norm_hints and norm_hints[na] not in (None, "", "null", "None"):
            return str(norm_hints[na]).strip()
    return None


def parse_turns(transcript: str):
    """Splits transcript into [(speaker, text)] turns."""
    parts = re.split(r"(?m)^\s*(assistant|user)\s*:\s*", transcript or "")
    turns = []
    for i in range(1, len(parts) - 1, 2):
        spk = "agent" if parts[i] == "assistant" else "prospect"
        txt = re.sub(r"\s+", " ", parts[i + 1]).strip()
        if txt:
            turns.append((spk, txt))
    return turns


def words_to_digits(text: str) -> str:
    """Converts number words (English/Hindi) and Devanagari numerals into plain digits."""
    t = (text or "").translate(DEV_NUMS)
    t = re.sub(r"\bdouble\s+(\w+)\b", r"\1 \1", t, flags=re.I)
    t = re.sub(r"\btriple\s+(\w+)\b", r"\1 \1 \1", t, flags=re.I)

    sorted_words = sorted(WORD_TO_DIGIT.keys(), key=len, reverse=True)
    pattern = r"(?<![\w\u0900-\u097F])(" + "|".join(re.escape(w) for w in sorted_words) + r")(?![\w\u0900-\u097F])"

    def repl(m):
        w = m.group(1).lower()
        return WORD_TO_DIGIT.get(w, m.group(1))

    return re.sub(pattern, repl, t, flags=re.IGNORECASE)


def extract_phone_single(text: str) -> str | None:
    """Extracts a phone number from single utterance."""
    if not text:
        return None
    converted = words_to_digits(text)
    digits = re.sub(r"\D", "", converted)
    if not digits:
        return None
    if len(digits) == 12 and digits.startswith("91"):
        return digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        return digits[1:]
    m = re.search(r"(\d{10})", digits)
    if m:
        return m.group(1)
    if len(digits) >= 10:
        m_mob = re.search(r"([6-9]\d{9})", digits)
        if m_mob:
            return m_mob.group(1)
        return digits[:10]
    # Keep shorter phone numbers (e.g. 5-9 digits test/local numbers) instead of discarding
    if len(digits) >= 5:
        return digits
    return None


def clean_name(raw: str) -> str | None:
    """Strips honorifics and noise words, keeping valid name."""
    if not raw:
        return None
    s = re.sub(r"[^\w\s\u0900-\u097F]", " ", raw).strip()
    words = [w for w in s.split() if w.lower() not in NAME_NOISE_WORDS]
    if not words or len(words) > 3:
        return None
    cleaned = " ".join(words)
    if 2 <= len(cleaned) <= 40 and not any(ch.isdigit() for ch in cleaned):
        return cleaned
    return None


def extract_phone_from_turns(turns) -> str | None:
    for i in range(len(turns) - 1):
        spk_a, text_a = turns[i]
        spk_p, text_p = turns[i + 1]
        if spk_a == "agent" and spk_p == "prospect":
            if any(k in text_a.lower() for k in ["number", "नंबर", "phone", "फोन", "संपर्क", "contact"]):
                p = extract_phone_single(text_p)
                if p:
                    return p
    for spk, text in turns:
        if spk == "prospect":
            p = extract_phone_single(text)
            if p:
                return p
    for spk, text in turns:
        if spk == "agent":
            p = extract_phone_single(text)
            if p:
                return p
    return None

def extract_name(turns) -> str | None:
    for spk, text in turns:
        if spk != "prospect":
            continue
        t = text.strip()
        m = re.search(r"([A-Za-z\u0900-\u097F]{2,20}(?:\s+[A-Za-z\u0900-\u097F]{2,20})?)\s*(?:नाम\s*है|naam\s*hai)", t, re.I)
        if m:
            c = clean_name(m.group(1))
            if c:
                return c
        m2 = re.search(r"(?:नाम|naam|name)\s*(?:hai|है|is)?\s*([A-Za-z\u0900-\u097F]{2,20}(?:\s+[A-Za-z\u0900-\u097F]{2,20})?)", t, re.I)
        if m2:
            c = clean_name(m2.group(1))
            if c:
                return c
    for spk, text in turns:
        if spk == "agent":
            m = re.search(r"([A-Za-z\u0900-\u097F]{2,20})\s*(?:जी|ji)\s*(?:का|की|के|से|ko|se)", text)
            if m:
                c = clean_name(m.group(1))
                if c and c.lower() not in ("sir", "सर", "bhai", "brother", "aap", "आप", "ajay", "अजय"):
                    return c
    for i in range(len(turns) - 1):
        spk_a, text_a = turns[i]
        spk_p, text_p = turns[i + 1]
        if spk_a == "agent" and spk_p == "prospect":
            if any(k in text_a.lower() for k in ["naam", "नाम", "शुभ नाम", "it head ka naam"]):
                c = clean_name(text_p)
                if c:
                    return c
    return None


def _use_api_extractions(hints, transcript, now):
    """
    1. Primary: Directly maps values returned by the Bolna API extractions.
    2. Fallback: Uses clean regex fallback on transcript ONLY if API didn't provide a field.
    """
    # 1. Direct fields from Bolna API
    bolna_name = match_hint(hints, ["it_head_name", "it head name", "it head naam", "head name", "name", "naam"])
    bolna_phone = match_hint(hints, ["it_head_phone", "it head phone", "it head number", "phone", "number", "contact", "contact number", "mobile"])
    bolna_agreed = match_hint(hints, ["it_head_call_agreed", "meeting agreed", "call agreed", "demo agreed", "agreed"])
    bolna_date = match_hint(hints, ["it_head_call_date", "meeting date", "call date", "date", "tarikh", "it_head_call_date_text"])
    bolna_time = match_hint(hints, ["it_head_call_time", "meeting time", "call time", "time", "samay"])
    bolna_interest = match_hint(hints, ["interest_status", "interest level", "interest"])
    bolna_summary = match_hint(hints, ["call_summary", "call summary", "summary"])

    # Clean/format name & phone directly from API
    it_head_name = (clean_name(bolna_name) or bolna_name.strip()) if bolna_name else None
    it_head_phone = None
    if bolna_phone:
        p_clean = extract_phone_single(bolna_phone)
        it_head_phone = p_clean or re.sub(r"\D", "", str(bolna_phone)) or str(bolna_phone).strip() or None

    # =========================================================================
    # [REGEX FALLBACK COMMENTED OUT AS PER USER REQUEST - ONLY USE PURE BOLNA API]
    # DO NOT DELETE - KEEP FOR FUTURE RE-ACTIVATION IF NEEDED
    # =========================================================================
    # turns = parse_turns(transcript)
    # if not it_head_name:
    #     it_head_name = extract_name(turns)
    # if not it_head_phone:
    #     it_head_phone = extract_phone_from_turns(turns)

    # Date / Time parsing from API values ONLY
    d, tm = None, None
    raw_date_time = f"{bolna_date or ''} {bolna_time or ''}".strip() or None
    if raw_date_time:
        p_dt = parse_datetime(raw_date_time, now)
        d, tm = p_dt.get("date"), p_dt.get("time")

    # =========================================================================
    # [TRANSCRIPT DATE/TIME FALLBACK COMMENTED OUT AS PER USER REQUEST]
    # DO NOT DELETE - KEEP FOR FUTURE RE-ACTIVATION IF NEEDED
    # =========================================================================
    # if not d or not tm:
    #     cand_text = None
    #     for spk, ut in turns:
    #         if spk == "prospect":
    #             if any(k in ut.lower() for k in ["baje", "बजे", "kal", "कल", "parso", "परसों", "somvar", "सोमवार", "mangalvar", "मंगलवार", "budhvar", "बुधवार", "guruvar", "गुरुवार", "shukravar", "शुक्रवार", "shanivar", "शनिवार", "ravivar", "रविवार", "tarikh", "तारीख"]):
    #                 cand_text = f"user:  {ut}"
    #                 break
    #     if not cand_text:
    #         for line in (transcript or "").splitlines():
    #             if ("baje" in line.lower() or "बजे" in line) and line.lower().lstrip().startswith(("user", "candidate")):
    #                 cand_text = line
    #                 break
    #     if cand_text:
    #         raw_date_time = raw_date_time or cand_text
    #         p_trans = parse_datetime(cand_text, now)
    #         d = d or p_trans.get("date")
    #         tm = tm or p_trans.get("time")

    # Agreement from API ONLY (no assumptions or auto-inference)
    agreed = None
    if bolna_agreed is not None:
        agreed = True if str(bolna_agreed).lower() in ("yes", "true", "haan", "1") else (
            False if str(bolna_agreed).lower() in ("no", "false", "nahi", "0") else None
        )
    # [DO NOT AUTO-INFER AGREED IF NOT RETURNED BY API]
    # if agreed is None and (it_head_name or it_head_phone or d or tm):
    #     agreed = True

    # Interest status from API ONLY (no auto-inference)
    status = "unknown"
    if bolna_interest:
        bi = bolna_interest.lower().strip()
        if bi in INTEREST_VALUES:
            status = bi
        elif "interest" in bi or "haan" in bi or "yes" in bi:
            status = "interested"
        elif "callback" in bi or "later" in bi:
            status = "callback_requested"
        elif "not" in bi or "nahi" in bi:
            status = "not_interested"

    # Explicit callback requested override from dispositions
    is_callback = match_hint(hints, ["callback_requested", "callback"])
    callback_tm = match_hint(hints, ["callback_time", "callback_preferred_time"])
    if is_callback and str(is_callback).lower() in ("yes", "true", "haan", "1"):
        status = "callback_requested"
    elif callback_tm and status == "unknown":
        status = "callback_requested"

    # Identity / Who Answered check (including wrong number)
    raw_who = match_hint(hints, ["who_answered", "identity"])
    is_wrong_num = match_hint(hints, ["is_wrong_number", "wrong_number"])
    if (is_wrong_num and str(is_wrong_num).lower() in ("yes", "true", "1", "haan")) or (raw_who and "wrong" in raw_who.lower()):
        who_answered = "wrong_person"
        if status in ("unknown", "maybe"):
            status = "not_interested"
    elif raw_who:
        who_answered = raw_who
    else:
        who_answered = "self"

    # Reason for interest or disinterest
    interest_reason = match_hint(hints, ["not_interested_reason", "interest_reason", "reason", "interest_or_objection_reason"])

    # Next action formulation
    next_act = match_hint(hints, ["recommended_next_action", "next_action", "action"])
    if not next_act and callback_tm:
        next_act = f"Callback requested: {callback_tm}"

    summary = bolna_summary

    return {
        "who_answered": who_answered,
        "contact_role": match_hint(hints, ["contact_role", "role"]),
        "interest_status": status,
        "interest_reason": interest_reason,
        "it_head_call_agreed": agreed,
        "it_head_name": it_head_name,
        "it_head_phone": it_head_phone,
        "it_head_call_text": raw_date_time,
        "it_head_call_date": d,
        "it_head_call_time": tm,
        "dialect_detected": match_hint(hints, ["dialect_detected", "dialect"]) or "Standard Hindi",
        "organization_type": match_hint(hints, ["organization_type", "org_type"]),
        "volume_hint": match_hint(hints, ["volume_hint", "volume"]),
        "objections": [],
        "summary": summary,
        "next_action": next_act,
    }


def _clean_date(v):
    if not v:
        return None
    if isinstance(v, (date, datetime)):
        return v.date() if isinstance(v, datetime) else v
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _clean_time(v):
    if not v:
        return None
    if isinstance(v, time):
        return v
    m = re.match(r"^(\d{1,2}):(\d{2})", str(v))
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 60:
        return time(int(m.group(1)), int(m.group(2)))
    return None


def analyze(transcript, hints, now):
    """
    Directly returns data extracted by the Bolna API.
    Self reasoning / LLM generation is commented out per user request.
    """
    # =========================================================================
    # GEMINI REASONING (COMMENTED OUT - DO NOT DELETE)
    # =========================================================================
    # res = _gemini(transcript, hints, now) if (transcript or "").strip() else None

    # Directly use Bolna API extractions (with clean regex fallback if API missed a field)
    res = _use_api_extractions(hints, transcript, now)

    d = _clean_date(res.get("it_head_call_date"))
    tm = _clean_time(res.get("it_head_call_time"))
    d = validate_future(d, now)

    res["it_head_call_date"], res["it_head_call_time"] = d, tm
    res["_source"] = "bolna_api"
    return res
