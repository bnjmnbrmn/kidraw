/**
 * Record the running app as video.
 *
 * The page used to be a flip-book: a screenshot per keystroke, played back by
 * the reader's scroll. Scroll is a lumpy clock — the same gesture ran at a
 * different speed for every reader, and a tween that took four screenshots
 * looked like four screenshots. This records what the compositor actually
 * paints, so a zoom is a zoom.
 *
 * Chromium hands over a JPEG per painted frame (`Page.screencastFrame`), each
 * acknowledged before the next arrives, so nothing is captured while the app
 * sits still. Dead time between paints is capped rather than kept: the run
 * waits whole seconds for a layout to settle, and none of that is worth
 * watching. Where the reader *should* sit and look, the script says so with
 * `hold`.
 *
 * Playwright ships its own ffmpeg for recording video, and it is a very small
 * build: mjpeg in, VP8/WebM out. That is exactly this pipeline, so there is no
 * dependency to install.
 */
import {mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';

/**
 * Dead air between two painted frames, at most.
 *
 * Low enough to squeeze the waiting — the run sits still for whole seconds
 * while a layout settles — and well above the gap between frames of anything
 * actually moving, so a tween is never sped up by it.
 */
const GAP_CAP_MS = 130;

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const name of readdirSync(cache).filter(entry => entry.startsWith('ffmpeg-')).sort().reverse()) {
      const candidate = join(cache, name, 'ffmpeg-linux');
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'ffmpeg';
}

/** Width and height out of a JPEG's start-of-frame marker. */
export function jpegSize(buffer) {
  let at = 2;
  while (at + 9 < buffer.length) {
    if (buffer[at] !== 0xff) { at++; continue; }
    const marker = buffer[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7)};
    }
    at += 2 + buffer.readUInt16BE(at + 2);
  }
  return null;
}

/**
 * Start recording a page.
 *
 * `on()` and `off()` bracket the parts worth keeping; `take()` hands back what
 * has been recorded since the last one, as beats — a frame and how long it is
 * on screen — together with any breadcrumb changes, timed from the start of
 * the take.
 */
export async function startRecorder(page, {dir, quality = 85, viewport, scale = 1}) {
  mkdirSync(dir, {recursive: true});
  const client = await page.context().newCDPSession(page);
  const events = [];
  let live = false;
  let counter = 0;
  let inflight = 0;

  client.on('Page.screencastFrame', async event => {
    const at = Date.now();
    inflight++;
    try {
      if (live) {
        const file = join(dir, `f${String(counter++).padStart(6, '0')}.jpg`);
        writeFileSync(file, Buffer.from(event.data, 'base64'));
        events.push({kind: 'frame', at, file});
      }
    } finally {
      inflight--;
      await client.send('Page.screencastFrameAck', {sessionId: event.sessionId}).catch(() => {});
    }
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality,
    maxWidth: Math.round(viewport.width * scale),
    maxHeight: Math.round(viewport.height * scale),
    everyNthFrame: 1,
  });

  const flush = async () => {
    // A frame painted a moment ago is still on the wire.
    await page.waitForTimeout(160);
    for (let spin = 0; inflight > 0 && spin < 40; spin++) await page.waitForTimeout(25);
  };

  return {
    on() { live = true; },
    async off() { await flush(); live = false; },
    /** Sit on what is on screen. The one thing the script, not the clock, decides. */
    hold(ms) { events.push({kind: 'hold', at: Date.now(), ms}); },
    /** Where we are in the tree, from here on. */
    crumb(trail) { events.push({kind: 'crumb', at: Date.now(), trail}); },

    /** Everything recorded since the last take, as beats. */
    async take({name = 'segment', lens = null} = {}) {
      await flush();
      const mine = events.splice(0, events.length).sort((a, b) => a.at - b.at);
      const beats = [];
      const cues = [];
      let elapsed = 0;
      for (const [index, event] of mine.entries()) {
        if (event.kind === 'crumb') {
          cues.push({ms: elapsed, trail: event.trail});
          continue;
        }
        if (event.kind === 'hold') {
          if (beats.length) { beats.at(-1).ms += event.ms; elapsed += event.ms; }
          continue;
        }
        const next = mine.slice(index + 1).find(other => other.kind === 'frame');
        const ms = next ? Math.min(next.at - event.at, GAP_CAP_MS) : GAP_CAP_MS;
        beats.push({file: event.file, ms});
        elapsed += ms;
      }
      return {name, lens, beats, cues, ms: elapsed};
    },

    async close() {
      await client.send('Page.stopScreencast').catch(() => {});
      await client.detach().catch(() => {});
    },
  };
}

/**
 * A crop, eased in and out.
 *
 * The keymenu is a strip across the bottom of a 820-wide window, and the point
 * of showing it is the letters on the keys. So the camera moves in: the frame
 * is cropped towards the keys over `easeMs`, held there, and let back out at
 * the end. The crop is widened to the video's own shape first, so nothing is
 * ever letterboxed.
 */
export function lensAt(lens, through, aspect, frame) {
  if (!lens) return null;
  const full = {x: 0, y: 0, w: frame.width, h: frame.height};
  const want = fitAspect({
    x: lens.x * frame.scale, y: lens.y * frame.scale,
    w: lens.w * frame.scale, h: lens.h * frame.scale,
  }, aspect, frame);
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const t = ease(Math.max(0, Math.min(1, through)));
  return {
    x: full.x + (want.x - full.x) * t,
    y: full.y + (want.y - full.y) * t,
    w: full.w + (want.w - full.w) * t,
    h: full.h + (want.h - full.h) * t,
  };
}

function fitAspect(rect, aspect, frame) {
  let {x, y, w, h} = rect;
  if (w / h < aspect) { const grown = h * aspect; x -= (grown - w) / 2; w = grown; }
  else { const grown = w / aspect; y -= (grown - h) / 2; h = grown; }
  x = Math.max(0, Math.min(x, frame.width - Math.min(w, frame.width)));
  y = Math.max(0, Math.min(y, frame.height - Math.min(h, frame.height)));
  return {x, y, w: Math.min(w, frame.width), h: Math.min(h, frame.height)};
}

/**
 * Segments to a WebM, at one steady frame rate.
 *
 * A beat lasting 300ms at 20fps is the same picture six times over; VP8 spends
 * almost nothing on a repeat, which is why a five-minute screen recording is a
 * few megabytes rather than a few hundred.
 */
export async function encode({segments, out, poster, posterAt = 4000, fps = 25, width, height,
                              speed = 1, scratch, bitrate = '900k'}) {
  const aspect = width / height;
  const step = 1000 / fps;
  const plan = [];
  const cues = [];
  let elapsed = 0;
  for (const segment of segments) {
    // Where each beat sits on the segment's own clock.
    const marks = [];
    let within = 0;
    for (const beat of segment.beats) {
      marks.push({file: beat.file, start: within, end: within + beat.ms});
      within += beat.ms;
    }
    if (!marks.length) continue;
    for (const cue of segment.cues ?? []) cues.push({ms: elapsed + cue.ms / speed, trail: cue.trail});
    // Sample that clock at the video's frame rate rather than giving every
    // recorded frame a slot of its own: the compositor paints at sixty a
    // second when something is moving, and handing each of those a whole
    // twenty-fifth would play the movement back three times slower than it
    // happened.
    const frames = Math.max(1, Math.round(within / speed / step));
    let at = 0;
    for (let index = 0; index < frames; index++) {
      const when = Math.min((index + 0.5) * step * speed, within - 0.001);
      while (at < marks.length - 1 && marks[at].end <= when) at++;
      plan.push({
        file: marks[at].file,
        lens: segment.lens,
        through: within > 0 ? when / within : 0,
        ms: within,
      });
    }
    elapsed += frames * step;
  }

  const ffmpeg = spawn(ffmpegPath(), [
    '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', bitrate, '-crf', '32', '-qmin', '4', '-qmax', '48',
    '-deadline', 'good', '-cpu-used', '2', '-lag-in-frames', '16', '-auto-alt-ref', '1',
    '-threads', '4', '-pix_fmt', 'yuv420p', '-r', String(fps), out,
  ], {stdio: ['pipe', 'ignore', 'pipe']});
  let stderr = '';
  ffmpeg.stderr.on('data', chunk => { stderr += chunk; });
  ffmpeg.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`))));
  });
  const write = buffer => new Promise(resolve => {
    if (ffmpeg.stdin.write(buffer)) resolve();
    else ffmpeg.stdin.once('drain', resolve);
  });

  let posterFrame = null;
  let last = null;
  let cached = null;
  for (const [index, item] of plan.entries()) {
    // A held frame is the same file many times over, and a lensed one is the
    // same crop at the same point of the same ease.
    const key = `${item.file}|${Math.round(item.through * 400)}`;
    let buffer;
    if (cached && cached.key === key) buffer = cached.buffer;
    else {
      buffer = readFileSync(item.file);
      const size = jpegSize(buffer);
      if (item.lens || !size || size.width !== width || size.height !== height) {
        const frame = {width: size.width, height: size.height, scale: size.width / width};
        const crop = item.lens
          ? lensAt(item.lens, easeWindow(item.through, item.ms, item.lens.easeMs ?? 420), aspect, frame)
          : fitAspect({x: 0, y: 0, w: size.width, h: size.height}, aspect, frame);
        buffer = await transform(scratch, buffer, crop, width, height);
      }
      cached = {key, buffer};
    }
    if (!posterFrame && index >= (posterAt / 1000) * fps) posterFrame = buffer;
    await write(buffer);
    last = buffer;
  }
  ffmpeg.stdin.end();
  await done;
  if (poster && (posterFrame ?? last)) writeFileSync(poster, posterFrame ?? last);
  return {frames: plan.length, seconds: elapsed / 1000, cues};
}

/** In at the start, held through the middle, out at the end. */
function easeWindow(through, totalMs, easeMs) {
  const inAt = Math.min(.45, easeMs / Math.max(totalMs, 1));
  const outAt = 1 - inAt;
  if (through <= inAt) return through / inAt;
  if (through >= outAt) return Math.max(0, (1 - through) / inAt);
  return 1;
}

/** Crop and scale one frame, in a browser because that is where a JPEG decoder
 *  we already have is. */
async function transform(scratch, buffer, crop, width, height) {
  const encoded = await scratch.evaluate(async ([data, crop, width, height]) => {
    const image = new Image();
    image.src = 'data:image/jpeg;base64,' + data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', .92).split(',')[1];
  }, [buffer.toString('base64'), crop, width, height]);
  return Buffer.from(encoded, 'base64');
}
