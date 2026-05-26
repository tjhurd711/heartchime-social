import base64
import io
import json
import math
import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import boto3
import requests
from PIL import Image, ImageDraw, ImageFont


FRAME_WIDTH = 1080
FRAME_HEIGHT = 1920

FFMPEG_PATH = "/opt/bin/ffmpeg"
BASE_DIR = os.path.dirname(__file__)
FONTS_DIR = os.path.join(BASE_DIR, "fonts")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
TEMPLATE_PATH = os.path.join(TEMPLATES_DIR, "voicemail_template.png")
TEMPLATE_S3_KEY_DEFAULT = "voicemail-templates/ios_dark.png"

# Coordinates tuned for a 1080x1920 working frame (template is resized to this).
NAME_CLEAR_BOX = (274, 514, 806, 590)
NAME_POS = (540, 552)
NAME_FONT_SIZE = 56

AVATAR_CENTER = (540, 432)
AVATAR_RADIUS = 86
AVATAR_FALLBACK_BG = "#52506d"
AVATAR_INITIAL_FONT_SIZE = 72

TRANSCRIPT_BOX = (96, 1038, 984, 1424)
TRANSCRIPT_FONT_SIZE = 50
TRANSCRIPT_LINE_HEIGHT = 62
TRANSCRIPT_MAX_LINES = 6

TIMER_LEFT_POS = (96, 742)
TIMER_RIGHT_POS = (984, 742)  # right-aligned anchor
TIMER_LEFT_CLEAR_BOX = (84, 730, 220, 790)
TIMER_RIGHT_CLEAR_BOX = (824, 730, 996, 790)
TIMER_FONT_SIZE = 42

SLIDER_TRACK_START_X = 144
SLIDER_TRACK_END_X = 938
SLIDER_Y = 814  # center y of moving white pill
SLIDER_PILL_WIDTH = 86
SLIDER_PILL_HEIGHT = 44


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.append(os.path.join(FONTS_DIR, "DMSans-Variable.ttf"))
    candidates.append(os.path.join(FONTS_DIR, "DMSans-Variable.ttf"))

    for font_path in candidates:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size=size)
    return ImageFont.load_default()


def measure_text(draw: ImageDraw.ImageDraw, value: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), value, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def first_initial(name: str) -> str:
    clean = re.sub(r"\s+", " ", name or "").strip()
    if not clean:
        return "L"
    return clean[0].upper()


def format_timestamp(total_seconds: float) -> str:
    safe_seconds = max(0, int(math.floor(total_seconds)))
    minutes = safe_seconds // 60
    seconds = safe_seconds % 60
    return f"{minutes}:{seconds:02d}"


def extract_job_id_from_audio_key(audio_key: str | None) -> str | None:
    if not audio_key:
        return None
    match = re.match(r"^voicemail-tester/([^/]+)/audio\.", audio_key)
    return match.group(1) if match else None


def parse_data_url(data_url: str) -> tuple[str, bytes] | None:
    match = re.match(r"^data:([^;]+);base64,(.+)$", data_url, flags=re.DOTALL)
    if not match:
        return None
    mime_type = match.group(1)
    payload = match.group(2)
    return mime_type, base64.b64decode(payload)


def wrap_text_to_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> list[str]:
    words = [word for word in re.sub(r"\s+", " ", text).strip().split(" ") if word]
    if not words:
        return [""]

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        candidate_width, _ = measure_text(draw, candidate, font)
        if candidate_width <= max_width or not current:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) >= max_lines:
            break

    if len(lines) < max_lines and current:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]

    if len(lines) == max_lines:
        while True:
            last = lines[-1].rstrip()
            width, _ = measure_text(draw, f"{last}...", font)
            if width <= max_width or not last:
                lines[-1] = f"{last}..." if last else "..."
                break
            lines[-1] = last[:-1]

    return lines


def resolve_audio_bytes(event: dict[str, Any], s3_client: Any, bucket_name: str) -> tuple[bytes, str]:
    audio_key = (event.get("audioKey") or "").strip()
    audio_url = (event.get("audioUrl") or "").strip()
    audio_base64 = (event.get("audioBase64") or "").strip()
    audio_mime_type = (event.get("audioMimeType") or "audio/mpeg").strip()

    if audio_key:
        obj = s3_client.get_object(Bucket=bucket_name, Key=audio_key)
        return obj["Body"].read(), audio_mime_type

    if audio_url:
        response = requests.get(audio_url, timeout=20)
        response.raise_for_status()
        mime_type = response.headers.get("content-type", audio_mime_type).split(";")[0].strip()
        return response.content, mime_type or audio_mime_type

    if audio_base64:
        return base64.b64decode(audio_base64), audio_mime_type

    raise ValueError("audioKey, audioUrl, or audioBase64 is required")


def resolve_video_bytes(event: dict[str, Any], s3_client: Any, bucket_name: str) -> tuple[bytes, str]:
    source_video_key = (event.get("sourceVideoKey") or "").strip()
    source_video_url = (event.get("sourceVideoUrl") or "").strip()
    source_video_base64 = (event.get("sourceVideoBase64") or "").strip()
    source_video_mime_type = (event.get("sourceVideoMimeType") or "video/mp4").strip()

    if source_video_key:
        obj = s3_client.get_object(Bucket=bucket_name, Key=source_video_key)
        return obj["Body"].read(), source_video_mime_type

    if source_video_url:
        response = requests.get(source_video_url, timeout=30)
        response.raise_for_status()
        mime_type = response.headers.get("content-type", source_video_mime_type).split(";")[0].strip()
        return response.content, mime_type or source_video_mime_type

    if source_video_base64:
        return base64.b64decode(source_video_base64), source_video_mime_type

    raise ValueError("sourceVideoKey, sourceVideoUrl, or sourceVideoBase64 is required")


def extension_from_audio_mime_type(mime_type: str, audio_key: str | None = None, audio_url: str | None = None) -> str:
    if mime_type == "audio/mpeg":
        return "mp3"
    if mime_type in ("audio/mp4", "audio/aac"):
        return "m4a"
    if mime_type in ("audio/wav", "audio/x-wav"):
        return "wav"
    if mime_type == "audio/ogg":
        return "ogg"

    for candidate in [audio_key, audio_url]:
        if not candidate:
            continue
        parsed = urlparse(candidate)
        basename = os.path.basename(parsed.path or candidate)
        if "." in basename:
            ext = basename.rsplit(".", 1)[1].lower()
            if ext:
                return ext
    return "mp3"


def extension_from_video_mime_type(mime_type: str, source_video_key: str | None = None, source_video_url: str | None = None) -> str:
    if mime_type == "video/quicktime":
        return "mov"
    if mime_type in ("video/mp4", "video/x-m4v"):
        return "mp4"

    for candidate in [source_video_key, source_video_url]:
        if not candidate:
            continue
        parsed = urlparse(candidate)
        basename = os.path.basename(parsed.path or candidate)
        if "." in basename:
            ext = basename.rsplit(".", 1)[1].lower()
            if ext:
                return ext
    return "mp4"


def resolve_profile_image(profile_image_url: str | None, profile_image_data_url: str | None) -> Image.Image | None:
    image_bytes = None
    if profile_image_data_url:
        parsed = parse_data_url(profile_image_data_url)
        if parsed:
            _, image_bytes = parsed
    elif profile_image_url:
        response = requests.get(profile_image_url, timeout=20)
        response.raise_for_status()
        image_bytes = response.content

    if not image_bytes:
        return None

    profile = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    diameter = AVATAR_RADIUS * 2
    return profile.resize((diameter, diameter), Image.Resampling.LANCZOS)


def load_template_image(payload: dict[str, Any], s3_client: Any, bucket_name: str) -> Image.Image:
    template_bytes: bytes | None = None

    if os.path.exists(TEMPLATE_PATH):
        with open(TEMPLATE_PATH, "rb") as template_file:
            template_bytes = template_file.read()
    else:
        template_s3_key = (payload.get("templateKey") or TEMPLATE_S3_KEY_DEFAULT).strip() or TEMPLATE_S3_KEY_DEFAULT
        obj = s3_client.get_object(Bucket=bucket_name, Key=template_s3_key)
        template_bytes = obj["Body"].read()

    if not template_bytes:
        raise ValueError("Template image bytes are empty")

    template = Image.open(io.BytesIO(template_bytes)).convert("RGB")
    if template.size != (FRAME_WIDTH, FRAME_HEIGHT):
        template = template.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)
    return template


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    center: tuple[int, int],
    font: ImageFont.ImageFont,
    fill: str = "#ffffff",
) -> None:
    text_width, text_height = measure_text(draw, text, font)
    draw.text((center[0] - (text_width // 2), center[1] - (text_height // 2)), text, fill=fill, font=font)


def draw_right_aligned_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    right_x: int,
    y: int,
    font: ImageFont.ImageFont,
    fill: str = "#ffffff",
) -> None:
    text_width, _ = measure_text(draw, text, font)
    draw.text((right_x - text_width, y), text, fill=fill, font=font)


def render_voicemail_png(payload: dict[str, Any], output_path: str, s3_client: Any, bucket_name: str) -> tuple[int, int, int]:
    image = load_template_image(payload, s3_client, bucket_name)
    draw = ImageDraw.Draw(image)

    contact_name = (payload.get("contactName") or "Mom").strip() or "Mom"
    transcript_body = (payload.get("script") or payload.get("transcriptText") or "").strip()
    if not transcript_body:
        transcript_body = "Hey."
    duration_seconds = float(payload.get("durationSeconds") or 0)

    name_font = load_font(NAME_FONT_SIZE, bold=True)
    timer_font = load_font(TIMER_FONT_SIZE)
    transcript_font = load_font(TRANSCRIPT_FONT_SIZE)
    avatar_initial_font = load_font(AVATAR_INITIAL_FONT_SIZE, bold=True)

    # Hide template's baked name before drawing dynamic contact name.
    draw.rectangle(NAME_CLEAR_BOX, fill="#000000")
    draw_centered_text(draw, contact_name, NAME_POS, name_font)

    # Replace the template avatar with provided profile image or fallback initial.
    profile_image = resolve_profile_image(
        (payload.get("profileImageUrl") or "").strip() or None,
        (payload.get("profileImageDataUrl") or "").strip() or None,
    )
    avatar_left = AVATAR_CENTER[0] - AVATAR_RADIUS
    avatar_top = AVATAR_CENTER[1] - AVATAR_RADIUS
    avatar_diameter = AVATAR_RADIUS * 2
    if profile_image:
        mask = Image.new("L", (avatar_diameter, avatar_diameter), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse((0, 0, avatar_diameter, avatar_diameter), fill=255)
        image.paste(profile_image, (avatar_left, avatar_top), mask=mask)
    else:
        draw.ellipse(
            (
                AVATAR_CENTER[0] - AVATAR_RADIUS,
                AVATAR_CENTER[1] - AVATAR_RADIUS,
                AVATAR_CENTER[0] + AVATAR_RADIUS,
                AVATAR_CENTER[1] + AVATAR_RADIUS,
            ),
            fill=AVATAR_FALLBACK_BG,
        )
        draw_centered_text(draw, first_initial(contact_name), AVATAR_CENTER, avatar_initial_font)

    # Replace transcript body only; template keeps the "Transcript" heading and controls.
    draw.rectangle(TRANSCRIPT_BOX, fill="#000000")
    transcript_lines = wrap_text_to_width(
        draw,
        transcript_body,
        transcript_font,
        TRANSCRIPT_BOX[2] - TRANSCRIPT_BOX[0],
        TRANSCRIPT_MAX_LINES,
    )
    transcript_y = TRANSCRIPT_BOX[1]
    for line in transcript_lines:
        draw.text((TRANSCRIPT_BOX[0], transcript_y), line, fill="#ffffff", font=transcript_font)
        transcript_y += TRANSCRIPT_LINE_HEIGHT

    # Keep left timer from template; only update right timer seed text in the base image.
    draw.rectangle(TIMER_RIGHT_CLEAR_BOX, fill="#000000")
    right_text = f"-{format_timestamp(duration_seconds)}"
    draw_right_aligned_text(draw, right_text, TIMER_RIGHT_POS[0], TIMER_RIGHT_POS[1], timer_font)

    image.save(output_path, format="PNG")
    return SLIDER_TRACK_START_X, SLIDER_TRACK_END_X, SLIDER_Y


def render_video_with_ffmpeg(
    background_png_path: str,
    audio_path: str,
    output_path: str,
    duration_seconds: float,
    slider_start_x: int,
    slider_end_x: int,
    slider_y: int,
) -> None:
    duration = max(0.1, float(duration_seconds))
    duration_str = f"{duration:.3f}"
    fps = 30
    total_frames = max(1, int(math.ceil(duration * fps)))
    slider_span = slider_end_x - slider_start_x
    half_pill_w = SLIDER_PILL_WIDTH // 2
    half_pill_h = SLIDER_PILL_HEIGHT // 2

    base_frame = Image.open(background_png_path).convert("RGB")
    timer_font = load_font(TIMER_FONT_SIZE)
    frames_dir = os.path.join(os.path.dirname(output_path), "frames")
    os.makedirs(frames_dir, exist_ok=True)

    for frame_idx in range(total_frames):
        current_time = min(duration, frame_idx / fps)
        progress = current_time / duration if duration > 0 else 1.0
        pill_center_x = int(round(slider_start_x + (slider_span * progress)))
        elapsed_text = format_timestamp(current_time)
        remaining_text = f"-{format_timestamp(max(0, duration - current_time))}"

        frame = base_frame.copy()
        draw = ImageDraw.Draw(frame)
        draw.rectangle(TIMER_LEFT_CLEAR_BOX, fill="#000000")
        draw.rectangle(TIMER_RIGHT_CLEAR_BOX, fill="#000000")
        draw.text(TIMER_LEFT_POS, elapsed_text, fill="#ffffff", font=timer_font)
        draw_right_aligned_text(draw, remaining_text, TIMER_RIGHT_POS[0], TIMER_RIGHT_POS[1], timer_font)
        draw.rounded_rectangle(
            (
                pill_center_x - half_pill_w,
                slider_y - half_pill_h,
                pill_center_x + half_pill_w,
                slider_y + half_pill_h,
            ),
            radius=SLIDER_PILL_HEIGHT // 2,
            fill="#ffffff",
        )
        frame.save(os.path.join(frames_dir, f"frame_{frame_idx:05d}.png"), format="PNG")

    command = [
        FFMPEG_PATH,
        "-y",
        "-framerate",
        str(fps),
        "-i",
        os.path.join(frames_dir, "frame_%05d.png"),
        "-i",
        audio_path,
        "-t",
        duration_str,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
        output_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"ffmpeg failed: {exc.stderr.strip()}") from exc


def swap_video_audio_with_ffmpeg(source_video_path: str, audio_path: str, output_path: str) -> None:
    command = [
        FFMPEG_PATH,
        "-y",
        "-i",
        source_video_path,
        "-i",
        audio_path,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-shortest",
        "-movflags",
        "+faststart",
        output_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"ffmpeg failed: {exc.stderr.strip()}") from exc


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    action = (event.get("action") or "render").strip().lower()
    bucket_name = (event.get("bucket") or os.environ.get("S3_BUCKET_NAME") or "heartbeat-photos-prod").strip()
    region = (event.get("region") or os.environ.get("AWS_REGION") or "us-east-2").strip()
    audio_key = (event.get("audioKey") or "").strip() or None
    audio_url = (event.get("audioUrl") or "").strip() or None
    derived_job_id = extract_job_id_from_audio_key(audio_key)
    job_id = (event.get("jobId") or derived_job_id or str(uuid.uuid4())).strip()
    job_prefix = f"voicemail-tester/{job_id}"
    video_key = (event.get("videoKey") or f"{job_prefix}/video.mp4").strip()
    metadata_key = (event.get("metadataKey") or f"{job_prefix}/metadata.json").strip()

    s3_client = boto3.client("s3", region_name=region)

    audio_bytes, detected_audio_mime_type = resolve_audio_bytes(event, s3_client, bucket_name)
    audio_extension = extension_from_audio_mime_type(detected_audio_mime_type, audio_key=audio_key, audio_url=audio_url)

    if action == "audio_swap":
        source_video_key = (event.get("sourceVideoKey") or "").strip() or None
        source_video_url = (event.get("sourceVideoUrl") or "").strip() or None
        source_video_bytes, source_video_mime_type = resolve_video_bytes(event, s3_client, bucket_name)
        source_video_extension = extension_from_video_mime_type(
            source_video_mime_type, source_video_key=source_video_key, source_video_url=source_video_url
        )

        with tempfile.TemporaryDirectory(prefix="voicemail-audio-swap-") as temp_dir:
            source_video_path = os.path.join(temp_dir, f"source-video.{source_video_extension}")
            audio_input_path = os.path.join(temp_dir, f"audio-input.{audio_extension}")
            output_video_path = os.path.join(temp_dir, "video-output.mp4")

            with open(source_video_path, "wb") as source_video_file:
                source_video_file.write(source_video_bytes)
            with open(audio_input_path, "wb") as audio_file:
                audio_file.write(audio_bytes)

            swap_video_audio_with_ffmpeg(
                source_video_path=source_video_path,
                audio_path=audio_input_path,
                output_path=output_video_path,
            )

            with open(output_video_path, "rb") as video_file:
                video_bytes = video_file.read()
    else:
        duration_seconds = float(event.get("durationSeconds", 0))
        if not math.isfinite(duration_seconds) or duration_seconds <= 0:
            raise ValueError("durationSeconds must be a positive number")

        with tempfile.TemporaryDirectory(prefix="voicemail-render-") as temp_dir:
            background_png_path = os.path.join(temp_dir, "voicemail-base.png")
            audio_input_path = os.path.join(temp_dir, f"audio-input.{audio_extension}")
            output_video_path = os.path.join(temp_dir, "video-output.mp4")

            with open(audio_input_path, "wb") as audio_file:
                audio_file.write(audio_bytes)

            slider_start_x, slider_end_x, slider_y = render_voicemail_png(
                event,
                background_png_path,
                s3_client,
                bucket_name,
            )
            render_video_with_ffmpeg(
                background_png_path=background_png_path,
                audio_path=audio_input_path,
                output_path=output_video_path,
                duration_seconds=duration_seconds,
                slider_start_x=slider_start_x,
                slider_end_x=slider_end_x,
                slider_y=slider_y,
            )

            with open(output_video_path, "rb") as video_file:
                video_bytes = video_file.read()

    s3_client.put_object(
        Bucket=bucket_name,
        Key=video_key,
        Body=video_bytes,
        ContentType="video/mp4",
        CacheControl="max-age=31536000",
    )

    metadata_duration = float(event.get("durationSeconds", 0))
    if not math.isfinite(metadata_duration) or metadata_duration <= 0:
        metadata_duration = None

    metadata_payload = {
        "contactName": (event.get("contactName") or "Mom").strip() or "Mom",
        "emoji": (event.get("emoji") or "").strip(),
        "metadataLine": (event.get("metadataLine") or "home - Oct 15, 2025 at 7:16 PM").strip() or "home - Oct 15, 2025 at 7:16 PM",
        "topLabel": (event.get("topLabel") or "Voicemail").strip() or "Voicemail",
        "transcriptText": (event.get("transcriptText") or "Transcript (low confidence)").strip() or "Transcript (low confidence)",
        "theme": (event.get("theme") or "ios_voicemail").strip() or "ios_voicemail",
        "script": (event.get("script") or "").strip(),
        "durationSeconds": metadata_duration,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "audioKey": audio_key,
        "audioUrl": audio_url,
        "sourceVideoKey": (event.get("sourceVideoKey") or "").strip() or None,
        "sourceVideoUrl": (event.get("sourceVideoUrl") or "").strip() or None,
        "videoKey": video_key,
        "metadataKey": metadata_key,
        "renderer": "lambda-audio-swap-ffmpeg" if action == "audio_swap" else "lambda-pillow-ffmpeg",
    }

    s3_client.put_object(
        Bucket=bucket_name,
        Key=metadata_key,
        Body=json.dumps(metadata_payload, indent=2).encode("utf-8"),
        ContentType="application/json",
        CacheControl="max-age=31536000",
    )

    video_url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{video_key}"
    return {
        "videoUrl": video_url,
        "videoKey": video_key,
        "metadataKey": metadata_key,
        "durationSeconds": metadata_duration,
        "jobId": job_id,
    }
