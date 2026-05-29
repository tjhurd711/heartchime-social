import json
import os
import subprocess

WORK = os.path.dirname(os.path.abspath(__file__))
XFADE = 0.7  # must match lambda


def make_clip(path, seconds, color, freq):
    # 9:16-ish small frame, constant color video + sine audio, libx264 (no x265).
    subprocess.run([
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', f'color=c={color}:s=240x426:d={seconds}:r=24',
        '-f', 'lavfi', '-i', f'sine=frequency={freq}:duration={seconds}',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
        path,
    ], check=True, capture_output=True)


def probe_duration(path):
    out = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'json', path,
    ], check=True, capture_output=True, text=True)
    return float(json.loads(out.stdout)['format']['duration'])


def build_v_filter(durations, legacy=False):
    """Mirror lambdas/poem-mix video xfade chain.

    legacy=False -> NEW per-duration math (current lambda).
    legacy=True  -> OLD hardcoded-8s math (previous behavior), for comparison.
    """
    n = len(durations)
    if n == 1:
        return "[0:v]format=yuv420p[v]", []
    chain = []
    prev = "[0:v]"
    cum = 8.0 if legacy else durations[0]
    offsets = []
    for i in range(1, n):
        offset = cum - XFADE
        offsets.append(round(offset, 3))
        out = f"[v{i}]"
        chain.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset}{out}")
        prev = out
        cum = cum + (8.0 if legacy else durations[i]) - XFADE
    return ";".join(chain) + f";{prev}format=yuv420p[v]", offsets


def run_case(name, clips, durations, legacy=False):
    inputs = []
    for c in clips:
        inputs += ['-i', c]
    v_filter, offsets = build_v_filter(durations, legacy=legacy)
    out_path = os.path.join(WORK, f'out_{name}.mp4')
    cmd = ['ffmpeg', '-y'] + inputs + [
        '-filter_complex', v_filter,
        '-map', '[v]',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
        out_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"[{name}] FFMPEG FAILED\n{proc.stderr[-1200:]}")
        return
    actual = probe_duration(out_path)
    expected = sum(durations) - XFADE * (len(durations) - 1)
    # An xfade offset must fall inside the preceding clip's timeline, otherwise
    # the earlier clip freezes (visual jump) before the fade.
    offset_in_bounds = offsets[0] < durations[0] if offsets else True
    tag = 'OLD-8s-math' if legacy else 'NEW-per-duration'
    print(f"[{name}] ({tag}) durations={durations} xfade_offsets={offsets}")
    print(f"        first_clip_len={durations[0]}  first_offset_in_bounds={offset_in_bounds}")
    print(f"        expected_total={expected:.2f}s  actual_total={actual:.2f}s  diff={abs(actual-expected):.3f}s")
    print(f"        RESULT: {'PASS' if abs(actual-expected) < 0.25 and offset_in_bounds else 'FAIL'}")
    print()


def main():
    c8 = os.path.join(WORK, 'c8.mp4')
    c4 = os.path.join(WORK, 'c4.mp4')
    make_clip(c8, 8, 'blue', 220)
    make_clip(c4, 4, 'red', 440)
    print(f"clip8 real duration: {probe_duration(c8):.2f}s")
    print(f"clip4 real duration: {probe_duration(c4):.2f}s\n")

    # Requested test: 8s + 4s.
    run_case('8s_then_4s', [c8, c4], [8.0, 4.0])
    # Revealing test: 4s first. NEW math uses offset 3.3 (inside the 4s clip).
    run_case('4s_then_8s_NEW', [c4, c8], [4.0, 8.0])
    # Same inputs with the OLD hardcoded-8 math: offset 7.3 lands outside the
    # 4s clip -> freeze/visual jump and wrong total duration.
    run_case('4s_then_8s_OLD', [c4, c8], [4.0, 8.0], legacy=True)
    # Three-clip mix with a short middle clip (cumulative offset correctness).
    run_case('8_4_8_NEW', [c8, c4, c8], [8.0, 4.0, 8.0])
    run_case('8_4_8_OLD', [c8, c4, c8], [8.0, 4.0, 8.0], legacy=True)


if __name__ == '__main__':
    main()
