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
                if (result.status !== 0) {
                    throw new Error(`ffmpeg exited with status ${result.status}`);
                }
                // fs.unlinkSync(fullPath); // Disable auto-delete for safety
            } catch (e) {
                console.error(`Failed on ${fullPath}: ${e.message}`);
            }
        }
    }
}

processDir(path.resolve('src/assets/animal_ears'));
