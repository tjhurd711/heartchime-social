#!/usr/bin/env python3
"""CLI for the vertical short-form reel ffmpeg pipeline."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAMBDA_SHARED = ROOT / "lambdas" / "shared" / "video_editor"
sys.path.insert(0, str(LAMBDA_SHARED))

from edit import Job, Style, build  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a vertical short-form reel from video clips.")
    parser.add_argument("clips", nargs="+", help="Ordered input clip paths (intro first)")
    parser.add_argument("--music", type=Path, default=None, help="Optional background music")
    parser.add_argument(
        "--auto-captions",
        action="store_true",
        help="Burn word-level animated captions on the intro segment (requires Whisper segment pass)",
    )
    parser.add_argument("--out", type=Path, default=Path("reel-output.mp4"))
    parser.add_argument("--max-clip", type=float, default=4.0)
    parser.add_argument("--xfade", type=float, default=0.4)
    parser.add_argument("--no-zoom", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    style = Style(
        max_clip_seconds=args.max_clip,
        xfade_seconds=args.xfade,
        ken_burns=not args.no_zoom,
    )
    job = Job(
        clips=[Path(clip) for clip in args.clips],
        music=args.music,
        auto_captions=args.auto_captions,
        style=style,
        output=args.out,
    )
    result = build(job)
    print(f"Wrote {result}")


if __name__ == "__main__":
    main()
