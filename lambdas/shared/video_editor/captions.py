from __future__ import annotations

import json
import os
import re
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib import error, request


@dataclass
class WordTiming:
    word: str
    start: float
    end: float


@dataclass
class IntroSegment:
    start: float
    end: float
    words: list[WordTiming]


WHISPER_MAX_SECONDS = 90.0


def _ass_timestamp(seconds: float) -> str:
    total_cs = max(int(round(seconds * 100)), 0)
    hours = total_cs // 360000
    minutes = (total_cs % 360000) // 6000
    secs = (total_cs % 6000) // 100
    cs = total_cs % 100
    return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"


def _escape_ass_path(path: str | Path) -> str:
    text = str(path).replace("\\", "/")
    return text.replace(":", "\\:").replace("'", "\\'")


def extract_audio_for_transcription(
    video_path: Path,
    output_path: Path,
    *,
    ffmpeg: str,
    max_seconds: float = WHISPER_MAX_SECONDS,
) -> None:
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(video_path),
    ]
    if max_seconds > 0:
        command += ["-t", str(max_seconds)]
    command += [
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)


def transcribe_words(audio_path: Path) -> list[WordTiming]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for intro segment selection")

    boundary = f"----Heartchime{uuid.uuid4().hex}"
    audio_bytes = audio_path.read_bytes()
    filename = audio_path.name

    parts: list[bytes] = []
    for name, value in (
        ("model", "whisper-1"),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
    ):
        parts.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                f"{value}\r\n".encode(),
            ]
        )
    parts.extend(
        [
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: audio/mpeg\r\n\r\n"
            ).encode(),
            audio_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    body = b"".join(parts)

    req = request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with request.urlopen(req, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Whisper transcription failed: {exc.code} {detail}") from exc

    words: list[WordTiming] = []
    for item in payload.get("words") or []:
        text = str(item.get("word") or "").strip()
        if not text:
            continue
        start = float(item.get("start", 0.0))
        end = float(item.get("end", start + 0.2))
        words.append(WordTiming(word=text, start=start, end=max(end, start + 0.08)))

    if not words and payload.get("text"):
        cursor = 0.0
        for token in str(payload["text"]).split():
            words.append(WordTiming(word=token, start=cursor, end=cursor + 0.35))
            cursor += 0.35

    if not words:
        raise RuntimeError("Whisper returned no words for intro clip")
    return words


def _parse_claude_json(text: str) -> dict:
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    return json.loads(cleaned)


def pick_intro_segment_claude(
    words: list[WordTiming],
    *,
    video_duration: float,
    min_seconds: float = 15.0,
    max_seconds: float = 20.0,
) -> tuple[float, float]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return _fallback_intro_segment(video_duration, min_seconds=min_seconds, max_seconds=max_seconds)

    transcript = "\n".join(f"[{word.start:.2f}-{word.end:.2f}] {word.word}" for word in words)
    prompt = (
        "You are selecting the single best short-form video intro segment from a transcript.\n"
        f"Pick ONE continuous segment between {min_seconds:.0f} and {max_seconds:.0f} seconds long "
        "that is the most emotional, impactful, or quotable moment.\n"
        "Use the word timestamps provided. Return ONLY JSON:\n"
        '{"start": <seconds>, "end": <seconds>, "reason": "<short reason>"}\n\n'
        f"Full clip duration: {video_duration:.2f}s\n\n"
        f"Transcript:\n{transcript}"
    )

    body = json.dumps(
        {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")

    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        text_blocks = [
            block.get("text", "")
            for block in payload.get("content") or []
            if block.get("type") == "text"
        ]
        parsed = _parse_claude_json("\n".join(text_blocks))
        start = max(0.0, float(parsed["start"]))
        end = min(video_duration, float(parsed["end"]))
        if end - start < min_seconds * 0.75:
            raise ValueError("segment too short")
        if end - start > max_seconds * 1.15:
            end = min(video_duration, start + max_seconds)
        return start, end
    except Exception:
        return _fallback_intro_segment(video_duration, min_seconds=min_seconds, max_seconds=max_seconds)


def _fallback_intro_segment(
    video_duration: float,
    *,
    min_seconds: float,
    max_seconds: float,
) -> tuple[float, float]:
    if video_duration <= max_seconds:
        return 0.0, video_duration
    target = min(max((min_seconds + max_seconds) / 2, min_seconds), max_seconds)
    return 0.0, min(target, video_duration)


def _words_in_segment(words: list[WordTiming], start: float, end: float) -> list[WordTiming]:
    selected: list[WordTiming] = []
    for word in words:
        if word.end <= start or word.start >= end:
            continue
        selected.append(
            WordTiming(
                word=word.word.upper(),
                start=max(0.0, word.start - start),
                end=max(0.05, word.end - start),
            )
        )
    return selected


def trim_video_segment(
    input_path: Path,
    output_path: Path,
    *,
    start: float,
    end: float,
    ffmpeg: str,
) -> None:
    """Trim [start, end) with frame-accurate re-encode.

    Always uses ``-ss`` before ``-i`` and ``-t {end-start}`` after.
    Stream-copy is skipped: keyframe seeks silently ignore start and can
    emit a clip that begins at 0 while lasting until the absolute end.
    """
    start = max(0.0, float(start))
    end = max(start + 0.5, float(end))
    duration = max(end - start, 0.5)
    command = [
        ffmpeg,
        "-y",
        "-ss",
        str(start),
        "-i",
        str(input_path),
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-avoid_negative_ts",
        "make_zero",
        str(output_path),
    ]
    print(
        f"[trim] start={start} end={end} duration={duration} cmd={' '.join(command)}",
        flush=True,
    )
    subprocess.run(command, check=True, capture_output=True, text=True)


def transcribe_trimmed_caption_words(
    trimmed_video: Path,
    *,
    work_dir: str,
    ffmpeg: str,
) -> list[WordTiming]:
    """Transcribe an already-trimmed intro; word timestamps are relative to t=0."""
    audio_path = Path(work_dir) / "manual_intro_captions.mp3"
    extract_audio_for_transcription(
        trimmed_video,
        audio_path,
        ffmpeg=ffmpeg,
        max_seconds=0,
    )
    try:
        words = transcribe_words(audio_path)
        return [
            WordTiming(word=word.word.upper(), start=word.start, end=word.end)
            for word in words
        ]
    except Exception as exc:
        print(f"[manual-captions] Whisper failed on trimmed intro: {exc}", flush=True)
        return []


def prepare_intro_clip(
    intro_path: Path,
    *,
    work_dir: str,
    ffmpeg: str,
    ffprobe: str,
    has_audio: bool,
    probe_duration_fn,
    min_seconds: float = 15.0,
    max_seconds: float = 20.0,
    auto_captions: bool = False,
) -> tuple[Path, IntroSegment]:
    """Opus-style intro selection: Whisper (first 90s) + Claude best ~15-20s segment."""
    video_duration = probe_duration_fn(intro_path)
    analysis_duration = min(video_duration, WHISPER_MAX_SECONDS)
    trimmed_path = Path(work_dir) / "intro_segment.mp4"

    if not has_audio:
        start, end = _fallback_intro_segment(
            video_duration, min_seconds=min_seconds, max_seconds=max_seconds
        )
        trim_video_segment(intro_path, trimmed_path, start=start, end=end, ffmpeg=ffmpeg)
        return trimmed_path, IntroSegment(start=start, end=end, words=[])

    audio_path = Path(work_dir) / "intro_whisper.mp3"
    extract_audio_for_transcription(
        intro_path,
        audio_path,
        ffmpeg=ffmpeg,
        max_seconds=analysis_duration,
    )
    try:
        words = transcribe_words(audio_path)
        words = [word for word in words if word.start < analysis_duration]
        start, end = pick_intro_segment_claude(
            words,
            video_duration=min(video_duration, analysis_duration),
            min_seconds=min_seconds,
            max_seconds=max_seconds,
        )
        end = min(end, video_duration, analysis_duration)
        segment_words = _words_in_segment(words, start, end) if auto_captions else []
    except Exception as exc:
        print(f"[intro-segment] Whisper/Claude failed, using fallback trim: {exc}", flush=True)
        start, end = _fallback_intro_segment(
            min(video_duration, analysis_duration),
            min_seconds=min_seconds,
            max_seconds=max_seconds,
        )
        end = min(end, video_duration)
        segment_words = []

    trim_video_segment(intro_path, trimmed_path, start=start, end=end, ffmpeg=ffmpeg)
    print(
        f"[intro-segment] selected {start:.2f}-{end:.2f}s ({end - start:.2f}s), "
        f"whisper_window={analysis_duration:.0f}s, caption_words={len(segment_words)}",
        flush=True,
    )
    return trimmed_path, IntroSegment(start=start, end=end, words=segment_words)


def write_word_captions_ass(
    words: list[WordTiming],
    output_path: Path,
    *,
    width: int,
    height: int,
) -> None:
    # Tuned for 1080x1920; scale proportionally so 1:1 / 16:9 stay readable.
    font_size = max(36, int(round(92 * (height / 1920))))
    margin_x = max(24, int(round(48 * (width / 1080))))
    # ~18.75% from bottom (360/1920); clamp so square frames don't clip.
    margin_v = max(48, min(int(round(height * 0.1875)), int(round(height * 0.28))))
    outline = max(3, int(round(5 * (height / 1920))))

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,Arial Black,{font_size},&H00FFFFFF,&H0000FFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{outline},0,2,{margin_x},{margin_x},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for word in words:
        start = _ass_timestamp(word.start)
        end = _ass_timestamp(word.end)
        animated = (
            "{\\fad(70,70)\\t(0,90,\\fscx112\\fscy112)\\t(90,180,\\fscx100\\fscy100)"
            "\\1c&HFFFFFF&\\3c&H000000&\\b1}" + word.word.replace("{", "").replace("}", "")
        )
        lines.append(f"Dialogue: 0,{start},{end},Reel,,0,0,0,,{animated}\n")

    output_path.write_text("".join(lines), encoding="utf-8")


def burn_ass_on_video(
    input_path: Path,
    ass_path: Path,
    output_path: Path,
    *,
    ffmpeg: str,
) -> None:
    escaped = _escape_ass_path(ass_path)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(input_path),
            "-vf",
            f"ass='{escaped}'",
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def apply_intro_captions(
    intro_video: Path,
    words: list[WordTiming],
    *,
    work_dir: str,
    width: int,
    height: int,
    ffmpeg: str,
) -> None:
    if not words:
        return
    ass_path = Path(work_dir) / "intro_captions.ass"
    captioned_path = Path(work_dir) / "intro_captioned.mp4"
    write_word_captions_ass(words, ass_path, width=width, height=height)
    burn_ass_on_video(intro_video, ass_path, captioned_path, ffmpeg=ffmpeg)
    captioned_path.replace(intro_video)
