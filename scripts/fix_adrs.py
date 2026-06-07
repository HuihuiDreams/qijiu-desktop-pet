import os
import re
import json

adr_dir = 'docs/decisions'
files = [f for f in os.listdir(adr_dir) if f.startswith('ADR-') and f.endswith('.md')]

heading_map = [
    (re.compile(r'^##\s*(?:状态|Status|状态\s*\(Status\)|Status\s*\(状态\))\s*$', re.IGNORECASE | re.MULTILINE), '## Status'),
    (re.compile(r'^##\s*(?:日期|Date|日期\s*\(Date\)|Date\s*\(日期\))\s*$', re.IGNORECASE | re.MULTILINE), '## Date'),
    (re.compile(r'^##\s*(?:背景|Context|背景\s*\(Context\)|Context\s*\(背景\))\s*$', re.IGNORECASE | re.MULTILINE), '## Context'),
    (re.compile(r'^##\s*(?:决策|Decision|决策\s*\(Decision\)|Decision\s*\(决策\))\s*$', re.IGNORECASE | re.MULTILINE), '## Decision'),
    (re.compile(r'^##\s*(?:替代方案|其他方案|备选方案|Alternatives|Alternatives Considered|替代方案考虑|替代方案\s*\(Alternatives Considered\)|Alternatives Considered\s*\(替代方案\))\s*$', re.IGNORECASE | re.MULTILINE), '## Alternatives Considered'),
    (re.compile(r'^##\s*(?:影响|后果|Consequences|影响\s*\(Consequences\)|Consequences\s*\(影响\))\s*$', re.IGNORECASE | re.MULTILINE), '## Consequences'),
]

required_headers = [
    '## Status',
    '## Date',
    '## Context',
    '## Decision',
    '## Alternatives Considered',
    '## Consequences'
]

missing_report = []

for filename in files:
    filepath = os.path.join(adr_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original_content = content
    
    for pattern, repl in heading_map:
        content = pattern.sub(repl, content)
        
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated headers in {filename}")
        
    missing = []
    for req in required_headers:
        if not re.search(f'^{req}\\s*$', content, re.IGNORECASE | re.MULTILINE):
            missing.append(req)
            
    if missing:
        missing_report.append({"file": filename, "missing": missing})

print("\nMissing Sections Report:")
print(json.dumps(missing_report, indent=2))
