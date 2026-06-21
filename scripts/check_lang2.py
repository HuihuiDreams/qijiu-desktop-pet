import os
import re

adr_dir = 'docs/decisions'
files = [f for f in os.listdir(adr_dir) if f.startswith('ADR-') and f.endswith('.md')]

for filename in files:
    filepath = os.path.join(adr_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove headers
    text = re.sub(r'#+ .*', '', content)
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    english_chars = len(re.findall(r'[a-zA-Z]', text))
    
    # Let's see the ratio
    if chinese_chars == 0:
        ratio = 0
    else:
        ratio = english_chars / chinese_chars
        
    if ratio > 2.0 and english_chars > 50:
        print(f"{filename} (En: {english_chars}, Zh: {chinese_chars})")
