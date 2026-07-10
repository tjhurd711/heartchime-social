#!/usr/bin/env bash
# Deploy memorial-reel Lambda (vertical ffmpeg stitcher).
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
FUNCTION_NAME="${MEMORIAL_REEL_FUNCTION_NAME:-memorial-reel}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP="$HERE/memorial-reel.zip"
BUILD="$HERE/.build"

rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD"

cp "$HERE/lambda_function.py" "$BUILD/"
cp "$HERE/../shared/video_editor/edit.py" "$BUILD/"
cp "$HERE/../shared/video_editor/source.py" "$BUILD/"

( cd "$BUILD" && zip -r -q "$ZIP" . )

echo "Deploying to $FUNCTION_NAME ($REGION)..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP" \
  --region "$REGION" \
  --query '{FunctionArn:FunctionArn,LastModified:LastModified,CodeSha256:CodeSha256}' \
  --output table

rm -rf "$BUILD"
echo "Done."
