import os
import glob
import sys
sys.path.append(os.path.join(os.getcwd(), 'tools'))
from trim_sprites import trim_and_normalize, PADDING, BG_THRESHOLD

def process_group(glob_pattern):
    paths = sorted(glob.glob(glob_pattern))
    if paths:
        print(f"Processing group {glob_pattern}")
        trim_and_normalize(paths, PADDING, BG_THRESHOLD)

# Group by character/direction to unify canvases for animations, but separate them so they maximize screen space
groups = [
    "src/assets/animal_ears/left*.png",
    "src/assets/animal_ears/right*.png",
    "src/assets/animal_ears/shenjiu/walk_left*.png",
    "src/assets/animal_ears/shenjiu/walk_right*.png",
    "src/assets/animal_ears/yueqi/walk_left*.png",
    "src/assets/animal_ears/yueqi/walk_right*.png",
    "src/assets/animal_ears/QiJiu Desktop (updated)/SQQ/walk_left*.png",
    "src/assets/animal_ears/QiJiu Desktop (updated)/SQQ/walk_right*.png",
    "src/assets/animal_ears/QiJiu Desktop (updated)/SQQ/left*.png",
    "src/assets/animal_ears/QiJiu Desktop (updated)/SQQ/right*.png",
    "src/assets/school_au/left*.png",
    "src/assets/school_au/right*.png",
    "src/assets/school_au/shenjiu/walk_left*.png",
    "src/assets/school_au/shenjiu/walk_right*.png",
    "src/assets/school_au/yueqi/walk_left*.png",
    "src/assets/school_au/yueqi/walk_right*.png",
]

for g in groups:
    process_group(g)

# Process all other independent files individually
handled = set()
for g in groups:
    for p in glob.glob(g):
        handled.add(os.path.abspath(p))

all_pngs = glob.glob("src/assets/animal_ears/**/*.png", recursive=True) + glob.glob("src/assets/school_au/**/*.png", recursive=True)
for p in all_pngs:
    abs_p = os.path.abspath(p)
    if abs_p not in handled:
        print(f"Processing individual file {p}")
        trim_and_normalize([p], PADDING, BG_THRESHOLD)
