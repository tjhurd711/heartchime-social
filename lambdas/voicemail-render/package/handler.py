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

LAYOUT = {
    "canvasWidth": 1080,
    "canvasHeight": 1920,
    "phoneRadius": 86,
    "phonePaddingX": 34,
    "phonePaddingTop": 28,
    "phonePaddingBottom": 30,
    "statusTimeFontSize": 36,
    "statusTopOffset": 6,
    "island": {"width": 286, "height": 50, "topMargin": 8, "bottomMargin": 34},
    "nav": {"buttonSize": 92, "iconSize": 32, "labelFontSize": 20, "rowBottomMargin": 38},
    "profile": {"size": 176, "topMargin": -6, "initialsFontSize": 58},
    "namePill": {"topMargin": 10, "horizontalPadding": 20, "verticalPadding": 8, "fontSize": 52},
    "metadata": {"topMargin": 16, "fontSize": 38},
    "scrubber": {
        "topMargin": 56,
        "timeFontSize": 41,
        "timelineHeight": 10,
        "timelineTopMargin": 10,
        "knobWidth": 86,
        "knobHeight": 44,
        "controlsTopMargin": 24,
        "controlSize": 62,
        "controlGap": 16,
    },
    "transcript": {"topMargin": 64, "labelFontSize": 43, "bodyTopMargin": 2, "bodyFontSize": 50},
    "dock": {
        "topMargin": 24,
        "height": 88,
        "searchSize": 88,
        "borderRadius": 999,
        "fontSize": 30,
        "badgeFontSize": 21,
        "horizontalPadding": 22,
        "searchLeftMargin": 14,
    },
}

PALETTE = {
    "shellBorder": "#1f1f1f",
    "shellBg": "#000000",
    "text": "#f2f2f2",
    "muted": "#9b9ca4",
    "pill": "#1b1b1f",
    "timelineTrack": "#1f2126",
    "timelineFill": "#bfc4ce",
    "knob": "#ffffff",
    "circleButtonBg": "#141418",
    "circleButtonBorder": "#404047",
    "callButtonBg": "#27d05f",
    "dockBorder": "#2f3033",
    "dockBg": "#151517",
    "accentBlue": "#26a8ff",
}

SHELL_X = 95
SHELL_Y = 72
SHELL_WIDTH = 890
SHELL_HEIGHT = 1776
CONTENT_X = SHELL_X + LAYOUT["phonePaddingX"]
CONTENT_Y = SHELL_Y + LAYOUT["phonePaddingTop"]
CONTENT_WIDTH = SHELL_WIDTH - (2 * LAYOUT["phonePaddingX"])
CONTENT_BOTTOM = SHELL_Y + SHELL_HEIGHT - LAYOUT["phonePaddingBottom"]

FFMPEG_PATH = "/opt/bin/ffmpeg"
FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")


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


def initials_from_name(name: str) -> str:
    words = [word.strip() for word in name.split(" ") if word.strip()]
    if not words:
        return "VC"
    if len(words) == 1:
        return words[0][:2].upper()
    return f"{words[0][0]}{words[1][0]}".upper()


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
    return profile.resize((LAYOUT["profile"]["size"], LAYOUT["profile"]["size"]), Image.Resampling.LANCZOS)


def draw_circle_button(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    bounds = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(bounds, fill=fill, outline=outline, width=width)


def render_voicemail_png(payload: dict[str, Any], output_path: str) -> tuple[int, int, int, int]:
    image = Image.new("RGB", (FRAME_WIDTH, FRAME_HEIGHT), "#020203")
    draw = ImageDraw.Draw(image)

    body_font = load_font(30)
    status_font = load_font(LAYOUT["statusTimeFontSize"])
    nav_label_font = load_font(LAYOUT["nav"]["labelFontSize"])
    name_font = load_font(LAYOUT["namePill"]["fontSize"], bold=True)
    metadata_font = load_font(LAYOUT["metadata"]["fontSize"])
    scrubber_font = load_font(LAYOUT["scrubber"]["timeFontSize"])
    transcript_label_font = load_font(LAYOUT["transcript"]["labelFontSize"])
    transcript_body_font = load_font(LAYOUT["transcript"]["bodyFontSize"])
    initials_font = load_font(LAYOUT["profile"]["initialsFontSize"], bold=True)
    dock_font = load_font(LAYOUT["dock"]["fontSize"])
    dock_badge_font = load_font(LAYOUT["dock"]["badgeFontSize"], bold=True)

    contact_name = (payload.get("contactName") or "Mom").strip() or "Mom"
    emoji = (payload.get("emoji") or "").strip()
    metadata_line = (payload.get("metadataLine") or "home - Oct 15, 2025 at 7:16 PM").strip() or "home - Oct 15, 2025 at 7:16 PM"
    top_label = (payload.get("topLabel") or "Voicemail").strip() or "Voicemail"
    transcript_text = (payload.get("transcriptText") or "Transcript (low confidence)").strip() or "Transcript (low confidence)"
    script = (payload.get("script") or "Hey").strip() or "Hey"

    draw.rounded_rectangle(
        (SHELL_X, SHELL_Y, SHELL_X + SHELL_WIDTH, SHELL_Y + SHELL_HEIGHT),
        radius=LAYOUT["phoneRadius"],
        fill=PALETTE["shellBg"],
        outline=PALETTE["shellBorder"],
        width=2,
    )

    current_y = CONTENT_Y
    draw.text((CONTENT_X + 6, current_y + LAYOUT["statusTopOffset"]), "6:11", fill=PALETTE["text"], font=status_font)
    battery_w, _ = measure_text(draw, "69%", status_font)
    draw.text(
        (CONTENT_X + CONTENT_WIDTH - battery_w, current_y + LAYOUT["statusTopOffset"]),
        "69%",
        fill=PALETTE["text"],
        font=status_font,
    )
    current_y += LAYOUT["statusTimeFontSize"] + LAYOUT["island"]["topMargin"]

    island_x = SHELL_X + (SHELL_WIDTH - LAYOUT["island"]["width"]) // 2
    draw.rounded_rectangle(
        (
            island_x,
            current_y,
            island_x + LAYOUT["island"]["width"],
            current_y + LAYOUT["island"]["height"],
        ),
        radius=999,
        fill="#0b0b0f",
        outline="#36363f",
        width=1,
    )
    current_y += LAYOUT["island"]["height"] + LAYOUT["island"]["bottomMargin"]

    nav_center_y = current_y + (LAYOUT["nav"]["buttonSize"] // 2)
    left_button_cx = CONTENT_X + (LAYOUT["nav"]["buttonSize"] // 2)
    right_button_cx = CONTENT_X + CONTENT_WIDTH - (LAYOUT["nav"]["buttonSize"] // 2)

    draw_circle_button(
        draw,
        left_button_cx,
        nav_center_y,
        LAYOUT["nav"]["buttonSize"] // 2,
        fill=PALETTE["circleButtonBg"],
        outline=PALETTE["circleButtonBorder"],
    )
    draw.text((left_button_cx - 10, nav_center_y - 16), "‹", fill="#ffffff", font=load_font(40))

    top_label_w, top_label_h = measure_text(draw, top_label, nav_label_font)
    draw.text(
        (SHELL_X + (SHELL_WIDTH - top_label_w) // 2, nav_center_y - (top_label_h // 2)),
        top_label,
        fill=PALETTE["muted"],
        font=nav_label_font,
    )

    draw_circle_button(
        draw,
        right_button_cx,
        nav_center_y,
        LAYOUT["nav"]["buttonSize"] // 2,
        fill=PALETTE["callButtonBg"],
    )
    draw.text((right_button_cx - 16, nav_center_y - 16), "☎", fill="#041508", font=load_font(30))

    current_y += LAYOUT["nav"]["buttonSize"] + LAYOUT["nav"]["rowBottomMargin"] + LAYOUT["profile"]["topMargin"]

    profile_size = LAYOUT["profile"]["size"]
    profile_left = SHELL_X + (SHELL_WIDTH - profile_size) // 2
    profile_top = current_y
    profile_center_x = profile_left + profile_size // 2
    profile_center_y = profile_top + profile_size // 2

    profile_image = resolve_profile_image(
        (payload.get("profileImageUrl") or "").strip() or None,
        (payload.get("profileImageDataUrl") or "").strip() or None,
    )
    if profile_image:
        mask = Image.new("L", (profile_size, profile_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse((0, 0, profile_size, profile_size), fill=255)
        image.paste(profile_image, (profile_left, profile_top), mask=mask)
    else:
        draw_circle_button(draw, profile_center_x, profile_center_y, profile_size // 2, fill="#51506d")
        initials = initials_from_name(contact_name)
        initials_w, initials_h = measure_text(draw, initials, initials_font)
        draw.text(
            (profile_center_x - initials_w // 2, profile_center_y - initials_h // 2),
            initials,
            fill="#ffffff",
            font=initials_font,
        )
    current_y += profile_size + LAYOUT["namePill"]["topMargin"]

    contact_line = f"{contact_name} {emoji}".strip()
    name_w, name_h = measure_text(draw, contact_line, name_font)
    arrow_w, _ = measure_text(draw, "›", name_font)
    pill_h = name_h + (2 * LAYOUT["namePill"]["verticalPadding"])
    pill_w = (
        name_w
        + arrow_w
        + (2 * LAYOUT["namePill"]["horizontalPadding"])
        + 26  # spacing between name and arrow
    )
    pill_x = SHELL_X + (SHELL_WIDTH - pill_w) // 2
    draw.rounded_rectangle(
        (pill_x, current_y, pill_x + pill_w, current_y + pill_h),
        radius=999,
        fill=PALETTE["pill"],
    )
    text_y = current_y + LAYOUT["namePill"]["verticalPadding"] - 2
    draw.text((pill_x + LAYOUT["namePill"]["horizontalPadding"], text_y), contact_line, fill=PALETTE["text"], font=name_font)
    draw.text((pill_x + pill_w - LAYOUT["namePill"]["horizontalPadding"] - arrow_w, text_y), "›", fill="#8b8d96", font=name_font)

    current_y += pill_h + LAYOUT["metadata"]["topMargin"]
    metadata_w, metadata_h = measure_text(draw, metadata_line, metadata_font)
    draw.text(
        (SHELL_X + (SHELL_WIDTH - metadata_w) // 2, current_y),
        metadata_line,
        fill=PALETTE["muted"],
        font=metadata_font,
    )

    current_y += metadata_h + LAYOUT["scrubber"]["topMargin"]
    elapsed_text = format_timestamp(0)
    remaining_text = f"-{format_timestamp(float(payload.get('durationSeconds') or 0))}"
    elapsed_w, elapsed_h = measure_text(draw, elapsed_text, scrubber_font)
    remaining_w, _ = measure_text(draw, remaining_text, scrubber_font)
    draw.text((CONTENT_X, current_y), elapsed_text, fill=PALETTE["text"], font=scrubber_font)
    draw.text((CONTENT_X + CONTENT_WIDTH - remaining_w, current_y), remaining_text, fill=PALETTE["text"], font=scrubber_font)

    scrubber_y = current_y + elapsed_h + LAYOUT["scrubber"]["timelineTopMargin"]
    scrubber_x = CONTENT_X
    scrubber_w = CONTENT_WIDTH
    scrubber_h = LAYOUT["scrubber"]["timelineHeight"]
    draw.rounded_rectangle(
        (scrubber_x, scrubber_y, scrubber_x + scrubber_w, scrubber_y + scrubber_h),
        radius=999,
        fill=PALETTE["timelineTrack"],
    )

    controls_y = scrubber_y + scrubber_h + LAYOUT["scrubber"]["controlsTopMargin"]
    control_size = LAYOUT["scrubber"]["controlSize"]
    icons = ["↑", "≪", "▶", "🔊", "⌫"]
    controls_total_w = (control_size * 5) + (LAYOUT["scrubber"]["controlGap"] * 4)
    controls_start_x = CONTENT_X + (CONTENT_WIDTH - controls_total_w) // 2
    for idx, icon in enumerate(icons):
        x = controls_start_x + idx * (control_size + LAYOUT["scrubber"]["controlGap"])
        is_active = idx == 2
        draw.rounded_rectangle(
            (x, controls_y, x + control_size, controls_y + control_size),
            radius=999,
            outline="#ffffff" if is_active else "#5a5a62",
            width=1,
            fill="#ffffff" if is_active else None,
        )
        icon_font = load_font(26)
        icon_w, icon_h = measure_text(draw, icon, icon_font)
        draw.text(
            (x + (control_size - icon_w) // 2, controls_y + (control_size - icon_h) // 2 - 1),
            icon,
            fill="#000000" if is_active else "#ffffff",
            font=icon_font,
        )

    transcript_y = controls_y + control_size + LAYOUT["transcript"]["topMargin"]
    draw.text((CONTENT_X, transcript_y), transcript_text, fill="#74757e", font=transcript_label_font)

    script_y = transcript_y + LAYOUT["transcript"]["labelFontSize"] + LAYOUT["transcript"]["bodyTopMargin"]
    script_lines = wrap_text_to_width(draw, script, transcript_body_font, CONTENT_WIDTH, 4)
    line_height = int(LAYOUT["transcript"]["bodyFontSize"] * 1.25)
    for line in script_lines:
        draw.text((CONTENT_X, script_y), line, fill="#ffffff", font=transcript_body_font)
        script_y += line_height

    dock_height = LAYOUT["dock"]["height"]
    search_size = LAYOUT["dock"]["searchSize"]
    dock_right_margin = LAYOUT["dock"]["searchLeftMargin"]
    dock_left_w = CONTENT_WIDTH - search_size - dock_right_margin
    dock_y = CONTENT_BOTTOM - dock_height

    draw.rounded_rectangle(
        (CONTENT_X, dock_y, CONTENT_X + dock_left_w, dock_y + dock_height),
        radius=999,
        fill=PALETTE["dockBg"],
        outline=PALETTE["dockBorder"],
        width=1,
    )
    search_x = CONTENT_X + dock_left_w + dock_right_margin
    draw.rounded_rectangle(
        (search_x, dock_y, search_x + search_size, dock_y + search_size),
        radius=999,
        fill=PALETTE["dockBg"],
        outline=PALETTE["dockBorder"],
        width=1,
    )

    dock_text_y = dock_y + (dock_height // 2) - 16
    draw.text((CONTENT_X + 24, dock_text_y), "⏰", fill=PALETTE["accentBlue"], font=dock_font)
    draw.text((CONTENT_X + 64, dock_text_y), "Calls", fill=PALETTE["accentBlue"], font=dock_font)
    badge_x = CONTENT_X + 144
    draw.rounded_rectangle((badge_x, dock_text_y + 6, badge_x + 44, dock_text_y + 34), radius=999, fill="#ff4b54")
    draw.text((badge_x + 8, dock_text_y + 8), "53", fill="#ffffff", font=dock_badge_font)
    draw.text((CONTENT_X + 206, dock_text_y), "👤", fill="#d5d5da", font=dock_font)
    draw.text((CONTENT_X + 246, dock_text_y), "⋮⋮", fill="#d5d5da", font=dock_font)
    draw.text((search_x + 26, dock_y + 22), "⌕", fill="#ffffff", font=load_font(42))

    image.save(output_path, format="PNG")
    return scrubber_x, scrubber_y, scrubber_w, scrubber_h


def render_video_with_ffmpeg(
    background_png_path: str,
    audio_path: str,
    output_path: str,
    duration_seconds: float,
    scrubber_x: int,
    scrubber_y: int,
    scrubber_w: int,
    scrubber_h: int,
) -> None:
    duration = max(0.1, float(duration_seconds))
    duration_str = f"{duration:.3f}"
    knob_width = LAYOUT["scrubber"]["knobWidth"]
    knob_height = LAYOUT["scrubber"]["knobHeight"]
    knob_x = scrubber_x - (knob_width // 2)
    knob_y = scrubber_y - ((knob_height - scrubber_h) // 2)

    filter_graph = ",".join(
        [
            f"[0:v]scale={FRAME_WIDTH}:{FRAME_HEIGHT}",
            "format=yuv420p",
            f"drawbox=x={scrubber_x}:y={scrubber_y}:w={scrubber_w}:h={scrubber_h}:color=white@0.22:t=fill",
            f"drawbox=x={scrubber_x}:y={scrubber_y}:w={scrubber_w}*t/{duration_str}:h={scrubber_h}:color=white@0.95:t=fill",
            f"drawbox=x={knob_x}+{scrubber_w}*t/{duration_str}:y={knob_y}:w={knob_width}:h={knob_height}:color=white@0.95:t=fill[v]",
        ]
    )

    subprocess.run(
        [
            FFMPEG_PATH,
            "-y",
            "-loop",
            "1",
            "-framerate",
            "30",
            "-i",
            background_png_path,
            "-i",
            audio_path,
            "-t",
            duration_str,
            "-filter_complex",
            filter_graph,
            "-map",
            "[v]",
            "-map",
            "1:a:0",
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
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    duration_seconds = float(event.get("durationSeconds", 0))
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError("durationSeconds must be a positive number")

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

    with tempfile.TemporaryDirectory(prefix="voicemail-render-") as temp_dir:
        background_png_path = os.path.join(temp_dir, "voicemail-base.png")
        audio_input_path = os.path.join(temp_dir, f"audio-input.{audio_extension}")
        output_video_path = os.path.join(temp_dir, "video-output.mp4")

        with open(audio_input_path, "wb") as audio_file:
            audio_file.write(audio_bytes)

        scrubber_x, scrubber_y, scrubber_w, scrubber_h = render_voicemail_png(event, background_png_path)
        render_video_with_ffmpeg(
            background_png_path=background_png_path,
            audio_path=audio_input_path,
            output_path=output_video_path,
            duration_seconds=duration_seconds,
            scrubber_x=scrubber_x,
            scrubber_y=scrubber_y,
            scrubber_w=scrubber_w,
            scrubber_h=scrubber_h,
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

    metadata_payload = {
        "contactName": (event.get("contactName") or "Mom").strip() or "Mom",
        "emoji": (event.get("emoji") or "").strip(),
        "metadataLine": (event.get("metadataLine") or "home - Oct 15, 2025 at 7:16 PM").strip() or "home - Oct 15, 2025 at 7:16 PM",
        "topLabel": (event.get("topLabel") or "Voicemail").strip() or "Voicemail",
        "transcriptText": (event.get("transcriptText") or "Transcript (low confidence)").strip() or "Transcript (low confidence)",
        "theme": (event.get("theme") or "ios_voicemail").strip() or "ios_voicemail",
        "script": (event.get("script") or "").strip(),
        "durationSeconds": duration_seconds,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "audioKey": audio_key,
        "audioUrl": audio_url,
        "videoKey": video_key,
        "metadataKey": metadata_key,
        "renderer": "lambda-pillow-ffmpeg",
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
        "durationSeconds": duration_seconds,
        "jobId": job_id,
    }
