#!/usr/bin/env bash
# Deploy the poem-mix Lambda.
#
# Zips this directory's code + bundled caption fonts (*.ttf) along with the
# shared social_video_library module (imported by the handler) and ships it via
# `aws lambda update-function-code`. The ffmpeg layer is attached separately and
# is unaffected by code updates.
#
# Usage: ./deploy.sh
set -euo pipefail

REGION="us-east-2"
FUNCTION_NAME="poem-mix"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP="$HERE/poem-mix.zip"
BUILD="$HERE/.build"

rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD"

# Handler + bundled caption fonts (Cormorant Garamond + EB Garamond fallback).
cp "$HERE/lambda_function.py" "$BUILD/"
cp "$HERE"/*.ttf "$BUILD/"

# Shared helper imported by the handler: `from social_video_library import ...`.
cp "$HERE/../shared/social_video_library.py" "$BUILD/"

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
