#!/usr/bin/env bash
# Deploy the memorial-slideshow Lambda.
#
# Zips this directory's handler (lambda_function.py) and ships it via
# `aws lambda update-function-code`. The only third-party import is boto3, which
# the Lambda Python runtime provides natively, so nothing else is bundled. The
# ffmpeg layer (/opt/bin/ffmpeg) is attached separately and is unaffected by
# code updates.
#
# Usage: ./deploy.sh
set -euo pipefail

REGION="us-east-2"
FUNCTION_NAME="memorial-slideshow"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP="$HERE/memorial-slideshow.zip"
BUILD="$HERE/.build"

rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD"

# Handler only; boto3 is supplied by the Lambda runtime.
cp "$HERE/lambda_function.py" "$BUILD/"

( cd "$BUILD" && zip -r -q "$ZIP" . )
echo "Built $ZIP ($(du -h "$ZIP" | cut -f1)) containing:"
( cd "$BUILD" && find . -type f | sed 's#^\./#  #' )

echo "Deploying to $FUNCTION_NAME ($REGION)..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP" \
  --region "$REGION" \
  --query '{FunctionArn:FunctionArn,LastModified:LastModified,CodeSha256:CodeSha256}' \
  --output table

rm -rf "$BUILD"
echo "Done. $FUNCTION_NAME updated in $REGION."
