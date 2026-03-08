import { NextResponse } from 'next/server'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { supabase } from '@/lib/supabase'
import { s3Client, BUCKET_NAME, AWS_REGION } from '@/lib/s3'

const PREFIX = 'social/recipients/'

export async function GET() {
  try {
    // 1. List all objects in the S3 bucket under social/recipients/
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: PREFIX,
    })

    const s3Response = await s3Client.send(command)
    const s3Objects = s3Response.Contents || []

    // Filter to only image files and build public URLs
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp']
    const s3Urls = s3Objects
      .filter(obj => {
        const key = obj.Key || ''
        const ext = key.toLowerCase().slice(key.lastIndexOf('.'))
        return imageExtensions.includes(ext)
      })
      .map(obj => `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${obj.Key}`)

    // 2. Get all existing image URLs from Supabase
    const { data: recipients, error } = await supabase
      .from('social_recipients')
      .select('image_clean_url')

    if (error) {
      console.error('Error fetching recipients from Supabase:', error)
      return NextResponse.json(
        { error: 'Failed to fetch existing recipients' },
        { status: 500 }
      )
    }

    // Create a Set of existing URLs for fast lookup
    const existingUrls = new Set(
      (recipients || []).map(r => r.image_clean_url).filter(Boolean)
    )

    // 3. Find unlinked URLs (in S3 but not in Supabase)
    const unlinked = s3Urls.filter(url => !existingUrls.has(url))

    return NextResponse.json({
      unlinked,
      total_in_s3: s3Urls.length,
      total_in_supabase: existingUrls.size,
    })
  } catch (error) {
    console.error('Error scanning S3 bucket:', error)
    return NextResponse.json(
      { error: 'Failed to scan S3 bucket' },
      { status: 500 }
    )
  }
}

