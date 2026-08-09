import os
import re
import sys

adr_dir = "/Users/huihui/Documents/qijiu-desktop-pet/docs/decisions"
adrs = sorted([f for f in os.listdir(adr_dir) if f.startswith("ADR-") and f.endswith(".md")])

expected_headers = ["Status", "Date", "Context", "Decision", "Alternatives Considered", "Consequences"]

issues = []

for adr in adrs:
    path = os.path.join(adr_dir, adr)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    headers = re.findall(r'^##\s+(.*)', content, re.MULTILINE)
    headers_clean = [h.strip() for h in headers]
    
    missing = [h for h in expected_headers if not any(h.lower() in existing.lower() for existing in headers_clean)]
    
    if missing:
        issues.append(f"{adr} missing: {missing}")
    
    status_match = re.search(r'^##\s+Status.*?\n(.*?)(?=\n##)', content, re.DOTALL | re.IGNORECASE)
    if status_match:
        status_val = status_match.group(1).strip()
        if status_val not in ["Accepted", "Superseded", "Deprecated"]:
            issues.append(f"{adr} status format wrong: {repr(status_val[:30])}")
    else:
        issues.append(f"{adr} missing Status value block")

for i in issues:
    print(i)
