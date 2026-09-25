"""Turn readme-gif.mjs's frames into the README's GIF.

    uvx --with pillow python tools/capture/make-gif.py .capture/readme docs/readme-demo.gif

Each frame shows until the next one arrived, with gaps capped (the screencast
sends nothing while the app sits still) except where the script asked to hold.
Scaled down and palette-reduced to keep the file small enough for a README.
"""
import json
import sys
from pathlib import Path

from PIL import Image

GAP_CAP_MS = 130
MIN_MS = 40
WIDTH = 880


def main(src: str, dest: str) -> None:
    timing = json.loads((Path(src) / 'timing.json').read_text())
    frames, holds = timing['frames'], timing['holds']
    durations = []
    for i, frame in enumerate(frames):
        end = frames[i + 1]['at'] if i + 1 < len(frames) else frame['at'] + 2500
        shown = min(end - frame['at'], GAP_CAP_MS)
        shown += sum(h['ms'] for h in holds if frame['at'] <= h['at'] < end)
        durations.append(max(MIN_MS, shown))

    images = []
    for frame in frames:
        image = Image.open(frame['file']).convert('RGB')
        height = round(image.height * WIDTH / image.width)
        images.append(image.resize((WIDTH, height), Image.LANCZOS))

    # One palette for the whole film, so colors don't shimmer between frames.
    palette = images[len(images) // 2].quantize(colors=96, method=Image.MEDIANCUT)
    quantized = [image.quantize(palette=palette, dither=Image.NONE) for image in images]
    quantized[0].save(dest, save_all=True, append_images=quantized[1:], duration=durations,
                      loop=0, optimize=True, disposal=1)
    size = Path(dest).stat().st_size
    print(f'{len(frames)} frames, {sum(durations) / 1000:.1f}s, {size / 1e6:.2f} MB -> {dest}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
