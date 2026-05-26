# Voicemail Render Lambda

This Lambda renders the voicemail card background with Pillow, animates scrubber progress with FFmpeg, muxes audio, uploads outputs to S3, and returns render metadata.

## Runtime + Region

- Runtime: `python3.12`
- Region: `us-east-2`
- Handler: `handler.handler`
- FFmpeg Layer: `arn:aws:lambda:us-east-2:716244586127:layer:ffmpeg:1`
- FFmpeg binary path expected by code: `/opt/bin/ffmpeg`

## Function Configuration

- Memory: `2048 MB`
- Timeout: `120 seconds`
- Ephemeral storage: `1024 MB`

## Environment Variables

- `AWS_REGION=us-east-2` (optional if set per-function)
- `S3_BUCKET_NAME=heartbeat-photos-prod` (optional fallback)

## IAM Requirements

Grant Lambda role `s3:GetObject` and `s3:PutObject` on the target bucket:

- `arn:aws:s3:::heartbeat-photos-prod`
- `arn:aws:s3:::heartbeat-photos-prod/*`

## Build + Zip

From repository root:

```bash
cd lambdas/voicemail-render
rm -rf build package voicemail-render.zip
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -t package
cp handler.py package/
cd package
zip -r ../voicemail-render.zip .
```

Upload `lambdas/voicemail-render/voicemail-render.zip` as function code.

## Example AWS CLI Create

```bash
aws lambda create-function \
  --region us-east-2 \
  --function-name voicemail-render \
  --runtime python3.12 \
  --handler handler.handler \
  --timeout 120 \
  --memory-size 2048 \
  --ephemeral-storage '{"Size":1024}' \
  --layers arn:aws:lambda:us-east-2:716244586127:layer:ffmpeg:1 \
  --role arn:aws:iam::<ACCOUNT_ID>:role/<LAMBDA_EXEC_ROLE> \
  --zip-file fileb://lambdas/voicemail-render/voicemail-render.zip
```

## Invocation Contract

Input payload fields:

- Required: `durationSeconds`
- Audio priority: `audioKey` (S3) -> `audioUrl` -> `audioBase64`
- Visual text fields: `contactName`, `emoji`, `metadataLine`, `topLabel`, `transcriptText`, `script`, `theme`
- Profile image: `profileImageUrl` or `profileImageDataUrl`
- Storage routing: `bucket`, `region`, `jobId` (or inferred from `audioKey`)
- Optional overrides: `videoKey`, `metadataKey`

Return:

```json
{
  "videoUrl": "https://.../voicemail-tester/<jobId>/video.mp4",
  "videoKey": "voicemail-tester/<jobId>/video.mp4",
  "metadataKey": "voicemail-tester/<jobId>/metadata.json",
  "durationSeconds": 8.2,
  "jobId": "<jobId>"
}
```
