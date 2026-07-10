from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from captions import (
    apply_intro_captions,
    prepare_intro_clip,
    transcribe_trimmed_caption_words,
    trim_video_segment,
)


FFMPEG = os.environ.get("FFMPEG_BIN", "/opt/bin/ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "/opt/bin/ffprobe")
PIPELINE_VERSION = "2026-07-10-overlay-caption"

# Single source of truth for output canvas size.
ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "16:9": (1920, 1080),
}
DEFAULT_ASPECT_RATIO = "9:16"


@dataclass
class Style:
    width: int = 1080
    height: int = 1920
    aspect_ratio: str = DEFAULT_ASPECT_RATIO
    fps: int = 30
    xfade_seconds: float = 0.4
    max_clip_seconds: float = 4.0
    music_volume: float = 0.3
    intro_music_volume: float = 0.18
    intro_segment_min_seconds: float = 15.0
    intro_segment_max_seconds: float = 20.0
    fade_in_seconds: float = 0.3
    fade_out_seconds: float = 0.3


@dataclass
class ClipEdit:
    start_seconds: float | None = None
    end_seconds: float | None = None  # exclusive: segment is [start_seconds, end_seconds)
    grayscale: bool = False

    def has_trim(self) -> bool:
        return self.start_seconds is not None and self.end_seconds is not None


@dataclass
class OverlayCaption:
    text: str
    position: str = "bottom"  # top | middle | bottom
    scope: str = "full"  # full | intro


@dataclass
class Job:
    clips: list[Path]
    music: Path | None
    auto_captions: bool
    style: Style
    output: Path
    clip_keys: list[str] | None = None
    manual_edit: bool = False
    clip_edits: dict[str, ClipEdit] | None = None
    overlay_caption: OverlayCaption | None = None


def probe_duration(path: str | Path) -> float:
    result = subprocess.run(
        [
            FFPROBE,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    value = float(result.stdout.strip())
    if value <= 0:
        raise RuntimeError(f"Invalid duration for {path}")
    return value


def has_audio_stream(path: str | Path) -> bool:
    result = subprocess.run(
        [
            FFPROBE,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return "audio" in (result.stdout or "")


def clamp_manual_edit(
    start_seconds: float,
    end_seconds: float,
    video_duration: float,
) -> tuple[float, float]:
    """Clamp manual trim window; end_seconds is exclusive."""
    start = max(0.0, min(float(start_seconds), video_duration))
    end = max(start + 0.5, min(float(end_seconds), video_duration))
    if end > video_duration:
        end = video_duration
    if end <= start:
        end = min(video_duration, start + 0.5)
    return start, end


def _edit_float_optional(value: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        if key in value and value[key] is not None and value[key] != "":
            return float(value[key])
    return None


def _edit_bool(value: dict[str, Any], *keys: str, default: bool = False) -> bool:
    for key in keys:
        if key in value and value[key] is not None:
            return bool(value[key])
    return default


def clip_edits_from_event(
    raw: dict[str, Any] | None,
    clip_keys: list[str],
) -> dict[str, ClipEdit]:
    if not raw or not isinstance(raw, dict):
        return {}
    allowed = set(clip_keys)
    edits: dict[str, ClipEdit] = {}
    for key, value in raw.items():
        if key not in allowed or not isinstance(value, dict):
            print(f"[clip-edits] skip key={key!r} allowed={key in allowed}", flush=True)
            continue
        start = _edit_float_optional(value, "startSeconds", "start_seconds")
        end = _edit_float_optional(value, "endSeconds", "end_seconds")
        grayscale = _edit_bool(value, "grayscale", default=False)
        edits[key] = ClipEdit(start_seconds=start, end_seconds=end, grayscale=grayscale)
        print(
            f"[clip-edits] parsed key={key} startSeconds={start} endSeconds={end} "
            f"grayscale={grayscale} raw_keys={list(value.keys())}",
            flush=True,
        )
    return edits


def overlay_caption_from_event(raw: Any) -> OverlayCaption | None:
    if not raw or not isinstance(raw, dict):
        return None
    text = str(raw.get("text") or "").strip()
    if not text:
        return None
    if len(text) > 80:
        text = text[:80]
    position = str(raw.get("position") or "bottom").strip().lower()
    if position not in ("top", "middle", "bottom"):
        position = "bottom"
    scope = str(raw.get("scope") or "full").strip().lower()
    if scope not in ("full", "intro"):
        scope = "full"
    return OverlayCaption(text=text, position=position, scope=scope)


def wrap_overlay_text(text: str, *, max_chars: int = 20, max_lines: int = 3) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = ""
    for word in words:
        if len(lines) >= max_lines:
            break
        while len(word) > max_chars:
            if len(lines) >= max_lines:
                break
            chunk = word[:max_chars]
            if current:
                lines.append(current)
                current = ""
            lines.append(chunk)
            word = word[max_chars:]
            if len(lines) >= max_lines:
                word = ""
                break
        if not word or len(lines) >= max_lines:
            continue
        trial = f"{current} {word}".strip() if current else word
        if len(trial) <= max_chars:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def _escape_drawtext_value(value: str) -> str:
    """Escape characters that break ffmpeg drawtext text=/path= values."""
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "%%")
    )


def _resolve_drawtext_font_opt() -> str:
    candidates = [
        os.environ.get("OVERLAY_CAPTION_FONT", "").strip(),
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/opt/fonts/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return f"fontfile={_escape_drawtext_value(path)}"
    return "font=Arial"


def _overlay_font_size(height: int, line_count: int) -> int:
    base = float(height) * 0.045
    # ~10% smaller per extra line so 1-line and 3-line text share visual weight.
    scaled = base * (0.9 ** max(line_count - 1, 0))
    return max(18, min(int(round(scaled)), int(round(height * 0.08))))


def _overlay_y_expr(
    position: str,
    *,
    auto_captions: bool,
) -> str:
    if position == "top":
        return "h*0.08"
    if position == "middle":
        return "(h-text_h)/2"
    # Bottom: keep clear of platform UI (~10%+). Nudge higher when intro
    # auto-captions occupy the lower third.
    if auto_captions:
        return "h*0.68-text_h"
    return "h*0.85-text_h"


def build_overlay_drawtext_filter(
    overlay: OverlayCaption,
    *,
    width: int,
    height: int,
    intro_duration: float,
    auto_captions: bool,
) -> str:
    lines = wrap_overlay_text(overlay.text)
    if not lines:
        raise ValueError("overlay caption text is empty after wrap")
    fontsize = _overlay_font_size(height, len(lines))
    escaped_text = _escape_drawtext_value("\n".join(lines))
    y_expr = _overlay_y_expr(overlay.position, auto_captions=auto_captions)
    font_opt = _resolve_drawtext_font_opt()
    # Gold fill + dark outline for legibility (matches reel caption aesthetic).
    parts = [
        f"drawtext={font_opt}",
        f"text='{escaped_text}'",
        f"fontsize={fontsize}",
        "fontcolor=0xF5D76E",
        "borderw=3",
        "bordercolor=black@0.75",
        "line_spacing=8",
        "x=(w-text_w)/2",
        f"y={y_expr}",
    ]
    if overlay.scope == "intro":
        parts.append(f"enable='lt(t\\,{max(intro_duration, 0.1):.3f})'")
    filter_str = ":".join(parts)
    print(
        f"[overlay] position={overlay.position} scope={overlay.scope} "
        f"lines={len(lines)} fontsize={fontsize} size={width}x{height}",
        flush=True,
    )
    return filter_str


def apply_overlay_caption(
    video_path: Path,
    output_path: Path,
    *,
    overlay: OverlayCaption,
    style: Style,
    intro_duration: float,
    auto_captions: bool,
) -> None:
    """Single re-encode pass: burn static overlay onto stitched (video-only) reel."""
    vf = build_overlay_drawtext_filter(
        overlay,
        width=style.width,
        height=style.height,
        intro_duration=intro_duration,
        auto_captions=auto_captions,
    )
    print(f"[overlay] drawtext filter={vf}", flush=True)
    command = [
        FFMPEG,
        "-y",
        "-i",
        str(video_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size <= 0:
        detail = (result.stderr or result.stdout or "overlay drawtext failed").strip()
        raise RuntimeError(detail[-2000:] if detail else "overlay drawtext failed")


def trim_clip_head_copy(
    input_path: Path,
    output_path: Path,
    *,
    duration: float,
    ffmpeg: str,
) -> bool:
    """Fast head trim with stream copy when no filters are needed yet."""
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(input_path),
        "-t",
        str(duration),
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    return (
        result.returncode == 0
        and output_path.is_file()
        and output_path.stat().st_size > 0
    )


def normalize_clip(
    input_path: str | Path,
    output_path: str | Path,
    style: Style,
    *,
    keep_audio: bool,
    max_duration: float | None = None,
    grayscale: bool = False,
) -> None:
    probed = probe_duration(input_path)
    duration = probed if max_duration is None else min(probed, max_duration)
    fade_out_start = max(duration - style.fade_out_seconds, 0.0)

    filters: list[str] = [
        f"scale={style.width}:{style.height}:force_original_aspect_ratio=increase",
        f"crop={style.width}:{style.height}",
        "setsar=1",
        f"fade=t=in:st=0:d={style.fade_in_seconds}",
        f"fade=t=out:st={fade_out_start}:d={style.fade_out_seconds}",
    ]
    if grayscale:
        filters.append("hue=s=0")
    filters.append("format=yuv420p")
    vf = ",".join(filters)

    command = [
        FFMPEG,
        "-y",
        "-i",
        str(input_path),
        "-t",
        str(duration),
        "-vf",
        vf,
        "-r",
        str(style.fps),
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]

    if keep_audio:
        command += ["-c:a", "aac", "-b:a", "128k"]
    else:
        command += ["-an"]

    command.append(str(output_path))
    subprocess.run(command, check=True, capture_output=True, text=True)


def _build_xfade_filter(durations: list[float], xfade_seconds: float, clip_count: int) -> tuple[str, str]:
    if clip_count == 1:
        return "[0:v]format=yuv420p[vout]", "vout"

    chain: list[str] = []
    prev = "[0:v]"
    cumulative = durations[0]
    for index in range(1, clip_count):
        offset = max(cumulative - xfade_seconds, 0.0)
        out = f"[v{index}]"
        chain.append(
            f"{prev}[{index}:v]xfade=transition=fade:duration={xfade_seconds}:offset={offset}{out}"
        )
        prev = out
        cumulative = cumulative + durations[index] - xfade_seconds
    return ";".join(chain) + f";{prev}format=yuv420p[vout]", "vout"


def _mux_final_output(
    *,
    video_path: Path,
    output_path: Path,
    style: Style,
    total_duration: float,
    intro_audio_path: Path | None,
    intro_audio_duration: float,
    music_path: Path | None,
) -> None:
    output_path = Path(output_path)
    video_path = Path(video_path)
    if music_path is not None:
        music_path = Path(music_path)
    if intro_audio_path is not None:
        intro_audio_path = Path(intro_audio_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tail_start = max(total_duration - 2.0, 0.0)
    intro_fade_start = max(intro_audio_duration - style.fade_out_seconds, 0.0)
    duration_arg = str(total_duration)

    if music_path and music_path.is_file():
        if intro_audio_path and intro_audio_path.is_file():
            filter_complex = (
                f"[1:a]afade=t=out:st={intro_fade_start}:d={style.fade_out_seconds}[intro];"
                f"[2:a]atrim=0:{total_duration},asetpts=PTS-STARTPTS,"
                f"volume='if(lt(t,{intro_audio_duration}),{style.intro_music_volume},{style.music_volume})',"
                f"afade=t=out:st={tail_start}:d=2[music];"
                f"[intro][music]amix=inputs=2:duration=longest:dropout_transition=2,"
                f"atrim=0:{total_duration},asetpts=PTS-STARTPTS[aout]"
            )
            subprocess.run(
                [
                    FFMPEG,
                    "-y",
                    "-i",
                    str(video_path),
                    "-i",
                    str(intro_audio_path),
                    "-i",
                    str(music_path),
                    "-filter_complex",
                    filter_complex,
                    "-map",
                    "0:v",
                    "-map",
                    "[aout]",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-t",
                    duration_arg,
                    "-movflags",
                    "+faststart",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        else:
            subprocess.run(
                [
                    FFMPEG,
                    "-y",
                    "-i",
                    str(video_path),
                    "-i",
                    str(music_path),
                    "-filter_complex",
                    (
                        f"[1:a]atrim=0:{total_duration},asetpts=PTS-STARTPTS,"
                        f"volume={style.music_volume},afade=t=out:st={tail_start}:d=2[aout]"
                    ),
                    "-map",
                    "0:v",
                    "-map",
                    "[aout]",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-t",
                    duration_arg,
                    "-movflags",
                    "+faststart",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
    elif intro_audio_path and intro_audio_path.is_file():
        subprocess.run(
            [
                FFMPEG,
                "-y",
                "-i",
                str(video_path),
                "-i",
                str(intro_audio_path),
                "-filter_complex",
                (
                    f"[1:a]afade=t=out:st={intro_fade_start}:d={style.fade_out_seconds}[intro];"
                    f"[intro]apad,atrim=0:{total_duration},asetpts=PTS-STARTPTS[aout]"
                ),
                "-map",
                "0:v",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-t",
                duration_arg,
                "-movflags",
                "+faststart",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    else:
        subprocess.run(
            [
                FFMPEG,
                "-y",
                "-i",
                str(video_path),
                "-c:v",
                "copy",
                "-an",
                "-t",
                duration_arg,
                "-movflags",
                "+faststart",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )


def build(job: Job, *, work_dir: str | None = None) -> Path:
    if not job.clips:
        raise ValueError("Job requires at least one clip")

    print(
        f"[build] PIPELINE_VERSION={PIPELINE_VERSION} clips={len(job.clips)} "
        f"aspect={job.style.aspect_ratio} size={job.style.width}x{job.style.height} "
        f"manual_edit={job.manual_edit}",
        flush=True,
    )

    cleanup = work_dir is None
    if work_dir is None:
        import tempfile

        work_dir = tempfile.mkdtemp(prefix="memorial-reel-")

    try:
        clip_paths = list(job.clips)
        clip_keys = job.clip_keys or []
        clip_edits = job.clip_edits or {}
        intro_segment_words: list = []

        def s3_key_for(index: int) -> str | None:
            if index < len(clip_keys):
                return clip_keys[index]
            return None

        def clip_edit_for(index: int) -> ClipEdit | None:
            key = s3_key_for(index)
            if not key:
                return None
            return clip_edits.get(key)

        def trim_edit_for(index: int) -> ClipEdit | None:
            """Manual trim only when manualEdit is on and start/end are present."""
            if not job.manual_edit:
                return None
            edit = clip_edit_for(index)
            if not edit or not edit.has_trim():
                return None
            return edit

        def grayscale_for(index: int) -> bool:
            edit = clip_edit_for(index)
            return bool(edit and edit.grayscale)

        if clip_paths:
            intro_source = clip_paths[0]
            intro_manual = trim_edit_for(0)
            if intro_manual:
                intro_duration = probe_duration(intro_source)
                print(
                    f"[manual-edit] intro raw start={intro_manual.start_seconds} "
                    f"end={intro_manual.end_seconds} source_duration={intro_duration:.2f}",
                    flush=True,
                )
                start, end = clamp_manual_edit(
                    float(intro_manual.start_seconds or 0.0),
                    float(intro_manual.end_seconds or 0.0),
                    intro_duration,
                )
                print(
                    f"[manual-edit] intro clamped start={start} end={end} "
                    f"segment={end - start:.2f}s",
                    flush=True,
                )
                trimmed_intro = Path(work_dir) / "intro_segment.mp4"
                trim_video_segment(
                    intro_source,
                    trimmed_intro,
                    start=start,
                    end=end,
                    ffmpeg=FFMPEG,
                )
                clip_paths[0] = trimmed_intro
                if job.auto_captions and has_audio_stream(trimmed_intro):
                    intro_segment_words = transcribe_trimmed_caption_words(
                        trimmed_intro,
                        work_dir=work_dir,
                        ffmpeg=FFMPEG,
                    )
                print(
                    f"[intro-segment] manual {start:.2f}-{end:.2f}s ({end - start:.2f}s), "
                    f"caption_words={len(intro_segment_words)}",
                    flush=True,
                )
            else:
                trimmed_intro, intro_segment = prepare_intro_clip(
                    intro_source,
                    work_dir=work_dir,
                    ffmpeg=FFMPEG,
                    ffprobe=FFPROBE,
                    has_audio=has_audio_stream(intro_source),
                    probe_duration_fn=probe_duration,
                    min_seconds=job.style.intro_segment_min_seconds,
                    max_seconds=job.style.intro_segment_max_seconds,
                    auto_captions=job.auto_captions,
                )
                clip_paths[0] = trimmed_intro
                intro_segment_words = intro_segment.words

        normalized: list[Path] = []
        for index, clip in enumerate(clip_paths):
            out_path = Path(work_dir) / f"norm_{index:03d}.mp4"
            source = clip
            max_duration: float | None = None
            highlight_manual = trim_edit_for(index) if index > 0 else None
            if highlight_manual:
                clip_duration = probe_duration(clip)
                print(
                    f"[manual-edit] clip[{index}] raw start={highlight_manual.start_seconds} "
                    f"end={highlight_manual.end_seconds} source_duration={clip_duration:.2f}",
                    flush=True,
                )
                start, end = clamp_manual_edit(
                    float(highlight_manual.start_seconds or 0.0),
                    float(highlight_manual.end_seconds or 0.0),
                    clip_duration,
                )
                print(
                    f"[manual-edit] clip[{index}] clamped start={start} end={end} "
                    f"segment={end - start:.2f}s",
                    flush=True,
                )
                trimmed_path = Path(work_dir) / f"trim_{index:03d}.mp4"
                trim_video_segment(
                    clip,
                    trimmed_path,
                    start=start,
                    end=end,
                    ffmpeg=FFMPEG,
                )
                source = trimmed_path
                print(
                    f"[clip-{index}] manual {start:.2f}-{end:.2f}s ({end - start:.2f}s)",
                    flush=True,
                )
            elif index > 0:
                trimmed_path = Path(work_dir) / f"trim_{index:03d}.mp4"
                if trim_clip_head_copy(
                    clip,
                    trimmed_path,
                    duration=job.style.max_clip_seconds,
                    ffmpeg=FFMPEG,
                ):
                    source = trimmed_path
                else:
                    max_duration = job.style.max_clip_seconds
            use_grayscale = grayscale_for(index)
            if use_grayscale:
                print(f"[normalize] clip[{index}] grayscale=true", flush=True)
            normalize_clip(
                source,
                out_path,
                job.style,
                keep_audio=index == 0,
                max_duration=max_duration,
                grayscale=use_grayscale,
            )
            normalized.append(out_path)

        if job.auto_captions and normalized and intro_segment_words:
            apply_intro_captions(
                normalized[0],
                intro_segment_words,
                work_dir=work_dir,
                width=job.style.width,
                height=job.style.height,
                ffmpeg=FFMPEG,
            )

        durations = [probe_duration(path) for path in normalized]
        clip_count = len(normalized)
        print(
            f"[build] normalized={clip_count} durations={[round(d, 2) for d in durations]}",
            flush=True,
        )

        if clip_count == 1:
            stitched_video = Path(work_dir) / "xfade_video.mp4"
            total_duration = durations[0]
            subprocess.run(
                [
                    FFMPEG,
                    "-y",
                    "-i",
                    str(normalized[0]),
                    "-map",
                    "0:v",
                    "-c:v",
                    "copy",
                    "-an",
                    "-movflags",
                    "+faststart",
                    str(stitched_video),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        else:
            inputs: list[str] = []
            for path in normalized:
                inputs.extend(["-i", str(path)])

            xfade_filter, video_label = _build_xfade_filter(
                durations, job.style.xfade_seconds, clip_count
            )
            stitched_video = Path(work_dir) / "xfade_video.mp4"
            total_duration = sum(durations) - job.style.xfade_seconds * (clip_count - 1)

            subprocess.run(
                [FFMPEG, "-y", *inputs, "-filter_complex", xfade_filter, "-map", f"[{video_label}]"]
                + [
                    "-c:v",
                    "libx264",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-an",
                    "-movflags",
                    "+faststart",
                    str(stitched_video),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

        stitched_duration = probe_duration(stitched_video)
        print(
            f"[build] stitched_duration={stitched_duration:.2f}s total_duration={total_duration:.2f}s",
            flush=True,
        )

        intro_audio_duration = durations[0] if durations else 0.0
        if job.overlay_caption and job.overlay_caption.text.strip():
            overlay_path = Path(work_dir) / "overlay_video.mp4"
            apply_overlay_caption(
                stitched_video,
                overlay_path,
                overlay=job.overlay_caption,
                style=job.style,
                intro_duration=intro_audio_duration,
                auto_captions=job.auto_captions,
            )
            stitched_video = overlay_path
        else:
            print("[overlay] skipped (no overlayCaption text)", flush=True)

        intro_audio_path: Path | None = None
        if normalized and has_audio_stream(normalized[0]):
            intro_audio_path = Path(work_dir) / "intro_audio.aac"
            subprocess.run(
                [
                    FFMPEG,
                    "-y",
                    "-i",
                    str(normalized[0]),
                    "-vn",
                    "-c:a",
                    "copy",
                    str(intro_audio_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

        _mux_final_output(
            video_path=stitched_video,
            output_path=job.output,
            style=job.style,
            total_duration=total_duration,
            intro_audio_path=intro_audio_path,
            intro_audio_duration=intro_audio_duration,
            music_path=job.music,
        )
        print(
            f"[build] output_duration={probe_duration(job.output):.2f}s",
            flush=True,
        )

        return job.output
    finally:
        if cleanup and work_dir and os.path.isdir(work_dir):
            import shutil

            shutil.rmtree(work_dir, ignore_errors=True)


def resolve_aspect_ratio(raw: dict[str, Any] | None) -> str:
    if not raw:
        return DEFAULT_ASPECT_RATIO
    value = raw.get("aspect_ratio") or raw.get("aspectRatio") or DEFAULT_ASPECT_RATIO
    aspect = str(value).strip()
    if aspect not in ASPECT_RATIO_DIMENSIONS:
        return DEFAULT_ASPECT_RATIO
    return aspect


def style_from_dict(raw: dict[str, Any] | None) -> Style:
    if not raw:
        return Style()
    aspect_ratio = resolve_aspect_ratio(raw)
    width, height = ASPECT_RATIO_DIMENSIONS[aspect_ratio]
    return Style(
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        fps=int(raw.get("fps", 30)),
        xfade_seconds=float(raw.get("xfade_seconds", raw.get("xfade", 0.4))),
        max_clip_seconds=float(raw.get("max_clip_seconds", raw.get("max_clip", 4.0))),
        music_volume=float(raw.get("music_volume", 0.3)),
        intro_music_volume=float(raw.get("intro_music_volume", 0.18)),
        intro_segment_min_seconds=float(raw.get("intro_segment_min_seconds", 15.0)),
        intro_segment_max_seconds=float(raw.get("intro_segment_max_seconds", 20.0)),
        fade_in_seconds=float(raw.get("fade_in_seconds", 0.3)),
        fade_out_seconds=float(raw.get("fade_out_seconds", 0.3)),
    )
