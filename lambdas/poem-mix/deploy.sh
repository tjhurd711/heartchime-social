#!/usr/bin/env bash
# Deploy the poem-mix Lambda.
#
# Zips this directory's code + bundled caption fonts (fonts/*.ttf) along with the
# shared social_video_library module (imported by the handler) and ships it via
# `aws lambda update-function-code`. The ffmpeg layer is attached separately and
# is unaffected by code updates.
#
# Fonts live under fonts/ (mapped to /var/task/fonts) so libass scans only fonts,
# never the package's .py files.
#
# Usage: ./deploy.sh
set -euo pipefail

REGION="us-east-2"
FUNCTION_NAME="poem-mix"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP="$HERE/poem-mix.zip"
BUILD="$HERE/.build"

rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD/fonts"

# Handler + bundled caption fonts (Cormorant Garamond + EB Garamond fallback).
cp "$HERE/lambda_function.py" "$BUILD/"
cp "$HERE"/fonts/*.ttf "$BUILD/fonts/"

# Shared helper imported by the handler: `from social_video_library import ...`.
cp "$HERE/../shared/social_video_library.py" "$BUILD/"

# Report the family name embedded in each bundled font. The ASS FontName /
# force_style value MUST match the family (name id 1) printed here, otherwise
# libass cannot match the font and renders nothing.
echo "Bundled font family names (name id 1):"
python3 - "$BUILD/fonts" <<'PY'
import os, struct, sys
def family(path):
    data = open(path, 'rb').read()
    if data[:4] not in (b'\x00\x01\x00\x00', b'true', b'ttcf', b'OTTO'):
        return '<not a valid sfnt font>'
    n = struct.unpack('>H', data[4:6])[0]; off = 12; name_off = None
    for _ in range(n):
        if data[off:off+4] == b'name':
            name_off = struct.unpack('>I', data[off+8:off+12])[0]; break
        off += 16
    if name_off is None:
        return '<no name table>'
    count, stroff = struct.unpack('>HH', data[name_off+2:name_off+6]); base = name_off+stroff
    found = {}
    for i in range(count):
        pid,_e,_l,nid,ln,o = struct.unpack('>HHHHHH', data[name_off+6+i*12:name_off+6+i*12+12])
        if nid != 1: continue
        raw = data[base+o:base+o+ln]
        try: txt = raw.decode('utf-16-be') if pid in (0,3) else raw.decode('latin-1')
        except Exception: continue
        found.setdefault(pid, txt.strip())
    for pid in (3,0,1):
        if found.get(pid): return found[pid]
    return next(iter(found.values()), '<unknown>')
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if f.lower().endswith(('.ttf','.otf')):
        print(f"  {f}: {family(os.path.join(d, f))!r}")
PY

( cd "$BUILD" && zip -r -q "$ZIP" . )
echo "Built $ZIP ($(du -h "$ZIP" | cut -f1)) containing:"
( cd "$BUILD" && find . -type f | sed 's#^\./#  #' )

echo "Deploying to $FUNCTION_NAME ($REGION)..."
SHA="$(aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP" \
  --region "$REGION" \
  --query 'CodeSha256' --output text)"
echo "New CodeSha256: $SHA"

rm -rf "$BUILD"
