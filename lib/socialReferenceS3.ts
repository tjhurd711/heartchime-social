import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'

export const LIVE_REFERENCE_SOURCE_BUCKET = 'order-by-age-uploads'

export async function mintLiveReferencePresignedUrl(
  key: string,
  bucket: string = LIVE_REFERENCE_SOURCE_BUCKET
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 60 * 60 }
  )
}
