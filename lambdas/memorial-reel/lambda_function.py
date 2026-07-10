import json
import os
import shutil
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from edit import (
    ASPECT_RATIO_DIMENSIONS,
    DEFAULT_ASPECT_RATIO,
    Job,
    build,
    clip_edits_from_event,
    overlay_caption_from_event,
    probe_duration,
    style_from_dict,
)
from source import S3KeysSource

s3 = boto3.client("s3")
DEFAULT_BUCKET = "heartbeat-photos-prod"


def _probe_video_size(path: Path) -> tuple[int | None, int | None]:
    import subprocess

    ffprobe = os.environ.get("FFPROBE_BIN", "/opt/bin/ffprobe")
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        parts = (result.stdout or "").strip().split(",")
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    except Exception as exc:
        print(f"PROBE_SIZE_FAILED path={path} msg={exc}", flush=True)
    return None, None


def _merge_style(event: dict) -> dict:
    raw = event.get("style")
    style = dict(raw) if isinstance(raw, dict) else {}
    aspect = event.get("aspectRatio") or event.get("aspect_ratio")
    if aspect and "aspectRatio" not in style and "aspect_ratio" not in style:
        style["aspectRatio"] = aspect
    return style


def _s3_object_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def _write_error_marker(
    *,
    job_id: str,
    bucket: str,
    error: str,
    details: str = "",
) -> None:
    error_key = f"memorial-reel/{job_id}/error.json"
    payload = {
        "jobId": job_id,
        "error": error,
        "details": details,
        "failedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        s3.put_object(
            Bucket=bucket,
            Key=error_key,
            Body=json.dumps(payload),
            ContentType="application/json",
        )
    except Exception as marker_exc:
        print(f"ERROR_MARKER_WRITE_FAILED jobId={job_id} msg={marker_exc}", flush=True)


def handler(event, context):
    job_id = event.get("jobId") or str(uuid.uuid4())
    clip_keys = event.get("clipKeys") or []
    auto_captions = bool(event.get("autoCaptions"))
    manual_edit = bool(event.get("manualEdit"))
    raw_clip_edits = event.get("clipEdits")
    print(
        f"CLIP_EDITS_RAW jobId={job_id} type={type(raw_clip_edits).__name__} "
        f"value={json.dumps(raw_clip_edits) if isinstance(raw_clip_edits, dict) else raw_clip_edits}",
        flush=True,
    )
    clip_edits = clip_edits_from_event(raw_clip_edits, clip_keys)
    print(
        f"CLIP_EDITS_PARSED jobId={job_id} count={len(clip_edits)} "
        + " ".join(
            f"{key}:[{edit.start_seconds},{edit.end_seconds}) gray={edit.grayscale}"
            for key, edit in clip_edits.items()
        ),
        flush=True,
    )
    overlay_caption = overlay_caption_from_event(event.get("overlayCaption"))
    print(
        f"OVERLAY_CAPTION jobId={job_id} "
        + (
            f"text_len={len(overlay_caption.text)} position={overlay_caption.position} "
            f"scope={overlay_caption.scope}"
            if overlay_caption
            else "none"
        ),
        flush=True,
    )
    music_key = event.get("musicKey")
    in_bucket = event.get("bucket", DEFAULT_BUCKET)
    out_bucket = event.get("output_bucket", DEFAULT_BUCKET)
    style_raw = _merge_style(event)
    aspect_value = str(
        style_raw.get("aspectRatio")
        or style_raw.get("aspect_ratio")
        or event.get("aspectRatio")
        or event.get("aspect_ratio")
        or DEFAULT_ASPECT_RATIO
    ).strip()
    if aspect_value not in ASPECT_RATIO_DIMENSIONS:
        return {
            "statusCode": 400,
            "body": json.dumps(
                {
                    "error": "aspectRatio must be one of: "
                    + ", ".join(ASPECT_RATIO_DIMENSIONS.keys()),
                }
            ),
        }
    style_raw["aspectRatio"] = aspect_value
    style = style_from_dict(style_raw)
    out_key = f"memorial-reel/{job_id}/output.mp4"
    meta_key = f"memorial-reel/{job_id}/metadata.json"
    error_key = f"memorial-reel/{job_id}/error.json"

    print(
        f"INVOKE jobId={job_id} clips={len(clip_keys)} manual_edit={manual_edit} "
        f"auto_captions={auto_captions} aspect={style.aspect_ratio} "
        f"size={style.width}x{style.height}",
        flush=True,
    )

    if not clip_keys:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "clipKeys is required"}),
        }

    if not isinstance(clip_keys, list) or len(clip_keys) < 1 or len(clip_keys) > 8:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "clipKeys must include between 1 and 8 S3 keys"}),
        }

    for marker_key in (meta_key, error_key):
        if _s3_object_exists(out_bucket, marker_key):
            print(f"IDEMPOTENT_SKIP jobId={job_id} existing={marker_key}", flush=True)
            return {
                "statusCode": 200,
                "body": json.dumps({"jobId": job_id, "skipped": True}),
            }

    work = Path(f"/tmp/{job_id}")
    if work.is_dir():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)

    output_path = work / "output.mp4"

    try:
        print(f"BUILD_START jobId={job_id}", flush=True)
        source = S3KeysSource(clip_keys, bucket=in_bucket, work_dir=str(work), s3_client=s3)
        local_clips = source.fetch("", len(clip_keys))

        music_path: Path | None = None
        if music_key:
            music_path = work / f"music{Path(music_key).suffix}"
            s3.download_file(in_bucket, music_key, str(music_path))

        build(
            Job(
                clips=local_clips,
                music=music_path,
                auto_captions=auto_captions,
                style=style,
                output=output_path,
                clip_keys=clip_keys,
                manual_edit=manual_edit,
                clip_edits=clip_edits,
                overlay_caption=overlay_caption,
            ),
            work_dir=str(work),
        )

        duration = probe_duration(output_path)
        width, height = _probe_video_size(output_path)
        s3.upload_file(
            str(output_path),
            out_bucket,
            out_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        meta = {
            "jobId": job_id,
            "key": out_key,
            "bucket": out_bucket,
            "clipCount": len(clip_keys),
            "duration": duration,
            "celebrityName": event.get("celebrityName"),
            "aspectRatio": style.aspect_ratio,
            "width": width or style.width,
            "height": height or style.height,
        }
        s3.put_object(
            Bucket=out_bucket,
            Key=meta_key,
            Body=json.dumps(meta),
            ContentType="application/json",
        )
        print(f"BUILD_OK jobId={job_id} duration={duration:.2f}s", flush=True)
        return {"statusCode": 200, "body": json.dumps(meta)}
    except Exception as exc:
        details = traceback.format_exc()
        print(f"HANDLER_ERROR jobId={job_id} type={type(exc).__name__} msg={exc}", flush=True)
        print(details, flush=True)
        _write_error_marker(
            job_id=job_id,
            bucket=out_bucket,
            error=str(exc),
            details=details[-4000:],
        )
        return {
            "statusCode": 500,
            "body": json.dumps({"jobId": job_id, "error": str(exc)}),
        }
