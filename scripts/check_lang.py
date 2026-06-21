import os
import re

adr_dir = 'docs/decisions'
files = [f for f in os.listdir(adr_dir) if f.startswith('ADR-') and f.endswith('.md')]

english_adrs = []
for filename in files:
    filepath = os.path.join(adr_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove headers
    text = re.sub(r'#+ .*', '', content)
    # Count chinese characters
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    # Count alphabet characters
    english_chars = len(re.findall(r'[a-zA-Z]', text))
    
    # If very few chinese characters but many english characters, it's likely English content
    if chinese_chars < 50 and english_chars > 200:
        english_adrs.append(filename)

print("ADRs with mostly English content:")
for adr in english_adrs:
    print(adr)
