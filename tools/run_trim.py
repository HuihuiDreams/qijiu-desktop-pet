import os
import glob
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from trim_sprites import trim_and_normalize, PADDING, BG_THRESHOLD

def process_group(glob_pattern):
    paths = sorted(glob.glob(glob_pattern))
    if paths:
        print(f"Processing group {glob_pattern}")
        trim_and_normalize(paths, PADDING, BG_THRESHOLD)

def run_groups_and_remaining(groups, root_dirs):
    for g in groups:
        process_group(g)

    handled = set()
    for g in groups:
        for p in glob.glob(g):
            handled.add(os.path.abspath(p))

    all_pngs = []
    for root_dir in root_dirs:
        all_pngs.extend(glob.glob(f"{root_dir}/**/*.png", recursive=True))

    for p in all_pngs:
        abs_p = os.path.abspath(p)
        if abs_p not in handled:
            print(f"Processing individual file {p}")
            trim_and_normalize([p], PADDING, BG_THRESHOLD)

def process_skin_directory(skin_dir):
    skin_dir = skin_dir.rstrip('/\\')
    if not os.path.isdir(skin_dir):
        print(f"Error: Target skin directory does not exist: {skin_dir}", file=sys.stderr)
        sys.exit(1)

    skin_groups = [
        f"{skin_dir}/left*.png",
        f"{skin_dir}/right*.png",
        f"{skin_dir}/shenjiu/walk_left*.png",
        f"{skin_dir}/shenjiu/walk_right*.png",
        f"{skin_dir}/yueqi/walk_left*.png",
        f"{skin_dir}/yueqi/walk_right*.png",
    ]
    run_groups_and_remaining(skin_groups, [skin_dir])

target_dirs = sys.argv[1:]
if target_dirs:
    for d in target_dirs:
        process_skin_directory(d)
else:
    process_skin_directory("src/assets/default")
