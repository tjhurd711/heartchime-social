# Deploy with ./deploy.sh (zips this dir + shared module + bundled fonts and
# runs `aws lambda update-function-code` against the poem-mix function).
import json, os, struct, subprocess, boto3
from social_video_library import insert_social_video_library_row

s3 = boto3.client('s3')
FFMPEG = '/opt/bin/ffmpeg'
DEFAULT_BUCKET = 'heartbeat-photos-prod'
XFADE = 0.7  # seconds of crossfade overlap

# Caption fonts are bundled under a dedicated fonts/ dir (see deploy.sh) so they
# land at /var/task/fonts. Keeping them in their own directory stops libass from
# trying to parse the package's .py files as fonts. The Lambda runtime has no
# system fonts/fontconfig, so libass silently renders captionless video when the
# font is missing or its family name doesn't match -- hence the hard validation
# and the runtime family-name lookup below.
FONTS_DIR = '/var/task/fonts'
PRIMARY_FONT_PATH = os.path.join(FONTS_DIR, 'CormorantGaramond-Regular.ttf')
FALLBACK_FONT_PATH = os.path.join(FONTS_DIR, 'EBGaramond-Regular.ttf')

# Caption alpha fade (milliseconds) applied per line via the ASS \fad tag.
CAPTION_FADE_IN_MS = 300
CAPTION_FADE_OUT_MS = 300

# sfnt magic numbers identifying a valid TrueType/OpenType font.
_SFNT_MAGIC = (b'\x00\x01\x00\x00', b'true', b'ttcf', b'OTTO')


def _ttf_family_name(path):
    """Return the font's family name (sfnt 'name' record id 1, preferring the
    Windows platform), which is exactly what libass indexes from fontsdir. The
    bundled Cormorant face reports 'Cormorant Garamond Light' here, not the
    typographic family 'Cormorant Garamond', and the layer's libass only matches
    id 1 -- so using this value is what makes captions actually render. Returns
    '' when the file is missing or not a valid sfnt font."""
    try:
        with open(path, 'rb') as handle:
            data = handle.read()
    except OSError:
        return ''
    if data[:4] not in _SFNT_MAGIC:
        return ''
    try:
        num_tables = struct.unpack('>H', data[4:6])[0]
        name_off = None
        off = 12
        for _ in range(num_tables):
            if data[off:off + 4] == b'name':
                name_off = struct.unpack('>I', data[off + 8:off + 12])[0]
                break
            off += 16
        if name_off is None:
            return ''
        count, str_off = struct.unpack('>HH', data[name_off + 2:name_off + 6])
        base = name_off + str_off
        by_platform = {}
        for i in range(count):
            rec = data[name_off + 6 + i * 12:name_off + 6 + i * 12 + 12]
            pid, _eid, _lid, nid, ln, o = struct.unpack('>HHHHHH', rec)
            if nid != 1:
                continue
            raw = data[base + o:base + o + ln]
            try:
                text = raw.decode('utf-16-be') if pid in (0, 3) else raw.decode('latin-1')
            except Exception:
                continue
            by_platform.setdefault(pid, text.strip())
        for pid in (3, 0, 1):  # prefer Windows, then Unicode, then Mac
            if by_platform.get(pid):
                return by_platform[pid]
        return next(iter(by_platform.values()), '')
    except Exception:
        return ''


def _resolve_caption_font():
    """Resolve the caption font at cold start. Prefer Cormorant Garamond; fall
    back to the bundled serif; hard-fail if neither is a usable font so the
    Lambda errors loudly on first invocation instead of silently producing
    captionless video. The returned name is the family embedded in the chosen
    TTF so the ASS FontName matches what libass indexes."""
    primary = _ttf_family_name(PRIMARY_FONT_PATH)
    if primary:
        return primary, False
    fallback = _ttf_family_name(FALLBACK_FONT_PATH)
    if fallback:
        print(
            f'CAPTION_FONT_FALLBACK rendering with {fallback} '
            f'({PRIMARY_FONT_PATH} missing or invalid)'
        )
        return fallback, True
    raise RuntimeError(
        'CAPTION_FONT_MISSING no usable caption font in package: neither '
        f'{PRIMARY_FONT_PATH} nor {FALLBACK_FONT_PATH} is a valid TTF'
    )


# Evaluated at module import (cold start), before any handler invocation.
CAPTION_FONT_NAME, CAPTION_FONT_IS_FALLBACK = _resolve_caption_font()


def _read_line_timings(bucket, key):
    if not key:
        return []
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        payload = json.loads(obj['Body'].read().decode('utf-8', errors='replace'))
        raw = payload.get('lineTimings') if isinstance(payload, dict) else []
        if not isinstance(raw, list):
            return []
        rows = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            text = str(item.get('text') or '').strip()
            start = float(item.get('start') or 0.0)
            end = float(item.get('end') or start)
            if not text:
                continue
            rows.append({
                'text': text,
                'start': max(0.0, start),
                'end': max(start + 0.05, end),
            })
        rows.sort(key=lambda item: item['start'])
        return rows
    except Exception as exc:
        print(f'CAPTION_TIMINGS_READ_FAILED key={key} msg={exc}')
        return []


def _fallback_line_timings(poem_text, voice_dur):
    lines = [line.strip() for line in str(poem_text or '').replace('\r\n', '\n').split('\n') if line.strip()]
    if not lines or voice_dur <= 0:
        return []
    total_chars = sum(max(1, len(line)) for line in lines)
    cursor = 0.0
    out = []
    for line in lines:
        span = max(0.25, (max(1, len(line)) / total_chars) * voice_dur)
        start = cursor
        end = min(voice_dur, start + span)
        out.append({'text': line, 'start': start, 'end': max(start + 0.05, end)})
        cursor = end
    return out


def _wrap_text(text, max_chars=26):
    words = str(text or '').split()
    if not words:
        return ''
    lines = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= max_chars:
            current += f' {word}'
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return '\n'.join(lines)


def _escape_ass_text(text):
    return str(text).replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}')


def _seconds_to_ass(seconds):
    total = max(0.0, float(seconds))
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    secs = int(total % 60)
    centiseconds = int(round((total - int(total)) * 100))
    if centiseconds >= 100:
        secs += 1
        centiseconds -= 100
    return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"


def _write_ass_captions(path, line_timings):
    if not line_timings:
        return False

    # Fontname is the family embedded in the bundled TTF (resolved at cold
    # start) so libass matches it; colours/outline/alignment/margins are
    # unchanged. Font size is 88 for legibility on a 720x1280 phone frame.
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{CAPTION_FONT_NAME},88,&H00FFFFFF,&H000000FF,&H80000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,5,30,30,45,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for line in line_timings:
        start = float(line.get('start') or 0.0)
        end = float(line.get('end') or start + 0.5)
        if end <= start:
            end = start + 0.5
        wrapped = _wrap_text(line.get('text', ''))
        if not wrapped:
            continue
        text = _escape_ass_text(wrapped).replace('\n', r'\N')
        # libass-native alpha fade (in/out ms) within the line's own window, so
        # captions ease in/out instead of popping. Tag must precede the escaped
        # text and keep its literal braces.
        fade = f"{{\\fad({CAPTION_FADE_IN_MS},{CAPTION_FADE_OUT_MS})}}"
        lines.append(
            f"Dialogue: 0,{_seconds_to_ass(start)},{_seconds_to_ass(end)},Caption,,0,0,0,,{fade}{text}\n"
        )
    with open(path, 'w', encoding='utf-8') as handle:
        handle.writelines(lines)
    return True


def _build_caption_filter(captions_path, line_timings):
    if not line_timings:
        return '[v]null[vout]'
    escaped_path = captions_path.replace('\\', '\\\\').replace(':', '\\:')
    # fontsdir points at the dedicated fonts/ dir (no .py files to misparse), and
    # force_style pins the family to the exact name embedded in the chosen TTF so
    # libass can always match it. This only sets FontName -- styling/position/
    # fade are untouched.
    return (
        f"[v]subtitles={escaped_path}:fontsdir={FONTS_DIR}"
        f":force_style='FontName={CAPTION_FONT_NAME}'[vout]"
    )

def _normalize_clip_durations(raw, count):
    """Per-clip durations parallel to clipKeys. Falls back to 8s when the
    payload is absent or malformed so older invocations stay compatible."""
    if not isinstance(raw, list) or len(raw) != count:
        return [8.0] * count
    out = []
    for value in raw:
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            seconds = 0.0
        out.append(seconds if seconds > 0 else 8.0)
    return out


def handler(event, context):
    job_id      = event['parentJobId']
    clip_keys   = event['clipKeys']           # ordered list
    clip_durs   = event.get('clipDurations')  # optional, parallel to clipKeys
    voice_key   = event['voiceKey']
    timings_key = event.get('voiceTimingsKey')
    poem_text   = event.get('poemText', '')
    voice_dur   = float(event['voiceDuration'])
    keep_amb    = bool(event.get('keepAmbient', False))
    in_bucket   = event.get('bucket', DEFAULT_BUCKET)
    out_bucket  = event.get('output_bucket', DEFAULT_BUCKET)
    out_key     = f"poem-video/{job_id}/final.mp4"

    if not timings_key and str(voice_key).endswith('/voice.mp3'):
        timings_key = str(voice_key)[:-len('/voice.mp3')] + '/timings.json'

    work = f"/tmp/{job_id}"
    os.makedirs(work, exist_ok=True)

    # download clips + voice
    local_clips = []
    for i, k in enumerate(clip_keys):
        p = f"{work}/clip_{i:03d}.mp4"
        s3.download_file(in_bucket, k, p)
        local_clips.append(p)
    voice_path = f"{work}/voice.mp3"
    s3.download_file(in_bucket, voice_key, voice_path)

    n = len(local_clips)
    # Per-clip durations (parallel to clip_keys). Reused library clips may be
    # 4s/6s rather than the 8s Veo default, which shifts the crossfade points.
    durations = _normalize_clip_durations(clip_durs, n)
    # Build xfade chain. Crossfade = XFADE seconds of overlap between clips.
    # Each clip i fades into the next at the running timeline length minus XFADE.
    inputs = []
    for c in local_clips:
        inputs += ['-i', c]
    inputs += ['-i', voice_path]

    # Video xfade chain
    if n == 1:
        v_filter = "[0:v]format=yuv420p[v]"
    else:
        chain = []
        prev = "[0:v]"
        cum = durations[0]
        for i in range(1, n):
            offset = cum - XFADE
            out = f"[v{i}]"
            chain.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset}{out}")
            prev = out
            cum = cum + durations[i] - XFADE
        v_filter = ";".join(chain) + f";{prev}format=yuv420p[v]"

    # Audio: voice always at full. Optional ambient from each clip ducked to 0.15 and concatenated.
    if keep_amb:
        # build ambient track by crossfading clip audios same way (acrossfade)
        if n == 1:
            a_amb = "[0:a]volume=0.15[amb]"
        else:
            chain = []
            prev = "[0:a]"
            for i in range(1, n):
                out = f"[a{i}]"
                chain.append(f"{prev}[{i}:a]acrossfade=d={XFADE}{out}")
                prev = out
            a_amb = ";".join(chain) + f";{prev}volume=0.15[amb]"
        # voice is the last input index = n
        a_filter = f"{a_amb};[{n}:a]volume=1.0[voice];[voice][amb]amix=inputs=2:duration=longest:dropout_transition=0[a]"
    else:
        a_filter = f"[{n}:a]anull[a]"

    line_timings = _read_line_timings(in_bucket, timings_key)
    timings_source = 'timings-file'
    if not line_timings:
        line_timings = _fallback_line_timings(poem_text, voice_dur)
        timings_source = 'poem-fallback' if line_timings else 'none'
    print(
        f'CAPTION_LINES jobId={job_id} count={len(line_timings)} '
        f'timingsKey={timings_key} bucket={in_bucket} source={timings_source}'
    )
    captions_path = f"{work}/captions.ass"
    captions_ready = _write_ass_captions(captions_path, line_timings)
    captions_filter = _build_caption_filter(captions_path, line_timings if captions_ready else [])

    final = f"{work}/final.mp4"
    cmd = [FFMPEG, '-y'] + inputs + [
        '-filter_complex', f"{v_filter};{a_filter};{captions_filter}",
        '-map', '[vout]', '-map', '[a]',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', str(voice_dur),         # trim final video to exact voice length
        '-movflags', '+faststart',
        final,
    ]
    subprocess.run(cmd, check=True)

    s3.upload_file(final, out_bucket, out_key, ExtraArgs={'ContentType': 'video/mp4'})
    meta = {'parentJobId': job_id, 'key': out_key, 'bucket': out_bucket,
            'clipCount': n, 'voiceDuration': voice_dur, 'keepAmbient': keep_amb}
    s3.put_object(Bucket=out_bucket, Key=f"poem-video/{job_id}/final-metadata.json",
                  Body=json.dumps(meta), ContentType='application/json')
    try:
        insert_social_video_library_row({
            'source': 'poem-final',
            'job_id': job_id,
            'parent_job_id': job_id,
            'clip_count': n,
            'duration_seconds': int(round(voice_dur)),
            's3_key': out_key,
            'bucket': out_bucket,
        })
    except Exception as exc:
        print(f'SOCIAL_VIDEO_LIBRARY_INSERT_FAILED jobId={job_id} msg={exc}')
    return {'statusCode': 200, 'body': json.dumps(meta)}
