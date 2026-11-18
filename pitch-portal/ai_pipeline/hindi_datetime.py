"""
hindi_datetime.py
Hindi / Hinglish / Devanagari bole hue date-time ko real date + time me badalta hai.
Examples:  "kal subah 11 baje", "परसों दोपहर 2 बजे", "agle somvar shaam 4 baje",
           "15 tarikh ko saade teen baje", "20 November 11:30 am"
LLM reasoning (reasoning.py) pehle try hota hai; ye rule-based fallback + validator hai.
"""
import re
import sys
from datetime import date, datetime, time, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DEV = str.maketrans("०१२३४५६७८९", "0123456789")
L = r"[\w\u0900-\u097F]"          # letter-ish (Devanagari included)

NUMWORDS = {
    "ek": 1, "एक": 1, "do": 2, "दो": 2, "teen": 3, "तीन": 3, "char": 4, "chaar": 4, "चार": 4,
    "panch": 5, "paanch": 5, "पांच": 5, "पाँच": 5, "chhe": 6, "che": 6, "chah": 6, "छह": 6, "छः": 6,
    "saat": 7, "सात": 7, "aath": 8, "आठ": 8, "nau": 9, "नौ": 9, "das": 10, "दस": 10,
    "gyarah": 11, "ग्यारह": 11, "barah": 12, "बारह": 12,
}
NUM_ALT = "|".join(sorted(map(re.escape, NUMWORDS), key=len, reverse=True))

WEEKDAYS = {
    0: ["somvar", "somwar", "सोमवार", "monday"],
    1: ["mangalvar", "mangalwar", "मंगलवार", "tuesday"],
    2: ["budhvar", "budhwar", "बुधवार", "wednesday"],
    3: ["guruvar", "guruwar", "brihaspativar", "veervar", "बृहस्पतिवार", "गुरुवार", "वीरवार", "thursday"],
    4: ["shukravar", "shukrawar", "शुक्रवार", "friday"],
    5: ["shanivar", "shaniwar", "शनिवार", "saturday"],
    6: ["ravivar", "raviwar", "itwar", "इतवार", "रविवार", "sunday"],
}
MONTHS = {
    1: ["january", "jan", "janvari", "जनवरी"], 2: ["february", "feb", "farvari", "फरवरी"],
    3: ["march", "mar", "मार्च"], 4: ["april", "apr", "अप्रैल", "aprail"],
    5: ["may", "mai", "मई"], 6: ["june", "jun", "जून"], 7: ["july", "jul", "जुलाई", "julai"],
    8: ["august", "aug", "अगस्त", "agast"], 9: ["september", "sep", "sept", "सितंबर", "sitambar"],
    10: ["october", "oct", "अक्टूबर", "aktubar", "october"], 11: ["november", "nov", "नवंबर", "navambar"],
    12: ["december", "dec", "दिसंबर", "disambar"],
}


def _has(text, word):
    return re.search(rf"(?<!{L}){re.escape(word)}(?!{L})", text) is not None


def _norm(text):
    return (text or "").lower().translate(DEV)


def parse_time(text):
    t = _norm(text)
    if not t:
        return None, 0.0
    # saade / dedh / dhai
    m = re.search(rf"(?:saade|sade|साढ़े|साढे)\s*({NUM_ALT}|\d{{1,2}})", t)
    if m:
        h = NUMWORDS.get(m.group(1)) or int(m.group(1))
        return _apply_period(h, 30, t), 0.8
    if re.search(rf"(?<!{L})(dedh|डेढ़|डेढ)(?!{L})", t):
        return _apply_period(1, 30, t), 0.8
    if re.search(rf"(?<!{L})(dhai|dhaai|ढाई)(?!{L})", t):
        return _apply_period(2, 30, t), 0.8
    m = re.search(r"(\d{1,2})[:.](\d{2})", t)
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 60:
        return _apply_period(int(m.group(1)), int(m.group(2)), t), 0.95
    m = re.search(rf"(\d{{1,2}}|{NUM_ALT})\s*(?:baje|बजे|bje|am|pm|a\.m\.?|p\.m\.?)", t)
    if m:
        g = m.group(1)
        h = int(g) if g.isdigit() else NUMWORDS[g]
        if 0 <= h <= 24:
            return _apply_period(h, 0, t), 0.9
    return None, 0.0


def _apply_period(h, m, t):
    pm = bool(re.search(rf"\bpm\b|p\.m|शाम|shaam|sham|dopahar|दोपहर|raat|रात|evening|afternoon", t))
    am = bool(re.search(rf"\bam\b|a\.m|सुबह|subah|subha|morning|savere|सवेरे", t))
    if pm and h < 12:
        h += 12
    elif am and h == 12:
        h = 0
    elif not pm and not am:
        if 1 <= h <= 6:      # office hours: "2 baje" = dopahar
            h += 12
    if h == 24:
        h = 0
    return time(h % 24, m)


def parse_date(text, now):
    t = _norm(text)
    today = now.date()
    if not t:
        return None, 0.0
    # explicit dd/mm(/yyyy)
    m = re.search(r"(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)", t)
    if m and not re.search(r"\d[:.]\d", m.group(0)):
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else today.year
        y = y + 2000 if y < 100 else y
        try:
            dt = date(y, mo, d)
            if dt < today and not m.group(3):
                dt = date(y + 1, mo, d)
            return dt, 0.95
        except ValueError:
            pass
    # "15 november" / "15 नवंबर"
    for mo, names in MONTHS.items():
        for name in names:
            mm = re.search(rf"(\d{{1,2}})\s*(?:tarikh|तारीख|तारिख|th|st|nd|rd|ko)?\s*{re.escape(name)}(?!{L})", t)
            if mm:
                try:
                    dt = date(today.year, mo, int(mm.group(1)))
                    if dt < today:
                        dt = date(today.year + 1, mo, int(mm.group(1)))
                    return dt, 0.95
                except ValueError:
                    pass
    # "15 tarikh"
    m = re.search(r"(\d{1,2})\s*(?:tarikh|तारीख|तारिख)", t)
    if m:
        d = int(m.group(1))
        try:
            dt = date(today.year, today.month, d)
            if dt < today:
                nm = today.month % 12 + 1
                dt = date(today.year + (1 if nm == 1 else 0), nm, d)
            return dt, 0.85
        except ValueError:
            pass
    # relative words
    if _has(t, "narso") or _has(t, "नरसों"):
        return today + timedelta(days=3), 0.8
    if _has(t, "parso") or _has(t, "parson") or _has(t, "परसों") or _has(t, "परसो"):
        return today + timedelta(days=2), 0.85
    # weekday (agle/next ke saath ya akela)
    for wd, names in WEEKDAYS.items():
        if any(_has(t, n) for n in names):
            delta = (wd - today.weekday()) % 7
            nxt = bool(re.search(r"agle|agla|अगले|अगला|next", t))
            if delta == 0 or (nxt and delta < 7 and wd <= today.weekday()):
                delta = 7 if delta == 0 else delta
            return today + timedelta(days=delta), 0.85
    if _has(t, "kal") or _has(t, "कल") or _has(t, "tomorrow"):
        return today + timedelta(days=1), 0.85   # "kal" future context me = tomorrow
    if _has(t, "aaj") or _has(t, "आज") or _has(t, "today"):
        return today, 0.85
    if re.search(r"agle\s*hafte|अगले\s*हफ्ते|अगले\s*सप्ताह|next\s*week", t):
        return today + timedelta(days=(7 - today.weekday())), 0.5   # next Monday, low confidence
    return None, 0.0


def parse_datetime(text, now):
    """returns {"date": date|None, "time": time|None, "confidence": float}"""
    d, dc = parse_date(text, now)
    tm, tc = parse_time(text)
    conf = round(min(dc or 1, tc or 1) if (d and tm) else max(dc, tc) * 0.7, 2)
    return {"date": d, "time": tm, "confidence": conf}


def validate_future(d, now, max_days=120):
    if not d:
        return None
    today = now.date()
    return d if today <= d <= today + timedelta(days=max_days) else None


if __name__ == "__main__":
    base = datetime(2026, 10, 29, 12, 0)      # Thursday
    for s in ["kal subah 11 baje", "परसों दोपहर 2 बजे", "agle somvar shaam 4 baje",
              "15 tarikh ko saade teen baje", "20 November 11:30 am", "aaj shaam 5 baje",
              "शुक्रवार को सुबह दस बजे", "kal dopahar 12 baje", "3 baje"]:
        r = parse_datetime(s, base)
        print(f"{s!r:40} -> {r['date']} {r['time']} ({r['confidence']})")
