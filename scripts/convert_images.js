const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (file.toLowerCase().endsWith('.png')) {
            const outPath = fullPath.replace(/\.png$/i, '.webp');
            console.log(`Converting ${fullPath} to ${outPath}`);
            try {
                const result = spawnSync('ffmpeg', [
                    '-v', 'error',
                    '-i', fullPath,
                    '-vf', 'scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=black@0',
                    '-y', outPath,
                ], { stdio: 'inherit' });
                if (result.error || result.status !== 0) {
                    const pyScript = `
from PIL import Image
with Image.open(${JSON.stringify(fullPath)}) as img:
    img = img.convert("RGBA")
    img.thumbnail((256, 256), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    x = (256 - img.width) // 2
    y = (256 - img.height) // 2
    canvas.paste(img, (x, y), img)
    canvas.save(${JSON.stringify(outPath)}, "WEBP")
`;
                    const pyResult = spawnSync('python3', ['-c', pyScript], { stdio: 'inherit' });
                    if (pyResult.error || pyResult.status !== 0) {
                        throw new Error(`Both ffmpeg and python PIL fallback failed`);
                    }
                }
                // fs.unlinkSync(fullPath); // Disable auto-delete for safety
            } catch (e) {
                console.error(`Failed on ${fullPath}: ${e.message}`);
            }
        }
    }
}

const skinDirs = ['src/assets/animal_ears', 'src/assets/school_au'];
for (const dir of skinDirs) {
    const absDir = path.resolve(dir);
    if (fs.existsSync(absDir)) processDir(absDir);
}
