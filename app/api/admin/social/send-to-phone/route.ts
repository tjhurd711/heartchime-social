import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAC_SERVER_URL = 'https://tylers-macbook-air.taila01b1b.ts.net'

interface SendSlide {
  order: number
  image_url: string
  note?: string
  s3_key?: string
}

interface SendToPhoneBody {
  albumName?: string
  slides?: SendSlide[]
}

function parseMacResponse(raw: string): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendToPhoneBody
    const albumName = (body.albumName || '').trim()
    const slides = Array.isArray(body.slides) ? body.slides : []

    if (!albumName) {
      return NextResponse.json({ error: 'albumName is required' }, { status: 400 })
    }
    if (slides.length === 0) {
      return NextResponse.json({ error: 'At least one slide is required' }, { status: 400 })
    }

    const invalidSlide = slides.find(
      (slide) =>
        !Number.isFinite(slide.order) ||
        slide.order < 1 ||
        typeof slide.image_url !== 'string' ||
        !/^https?:\/\//i.test(slide.image_url.trim())
    )
    if (invalidSlide) {
      return NextResponse.json({ error: 'Each slide must include order and image_url' }, { status: 400 })
    }

    const serverUrl = MAC_SERVER_URL
    const apiKey = process.env.SEND_TO_PHONE_API_KEY ?? process.env.LIVE_PHOTO_API_KEY ?? ''

    const sendPayload = {
      post_id: albumName,
      trend_name: albumName,
      album_name: albumName,
      slides: slides
        .map((slide) => ({
          order: slide.order,
          image_url: slide.image_url,
          overlay_text: slide.note || '',
        }))
        .sort((a, b) => a.order - b.order),
    }

    const macResponse = await fetch(`${serverUrl}/send-to-device`, {
      method: 'POST',
      headers: apiKey
        ? {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }
        : {
            'Content-Type': 'application/json',
          },
      body: JSON.stringify(sendPayload),
      signal: AbortSignal.timeout(110_000),
    })

    const rawText = await macResponse.text()
    const parsedResponse = parseMacResponse(rawText)

    if (!macResponse.ok) {
      await supabase.from('send_to_phone_jobs').insert({
        album_name: albumName,
        status: 'failed',
        slides: slides.map((slide) => ({
          order: slide.order,
          note: slide.note || '',
          s3_key: slide.s3_key || null,
        })),
        error_text: rawText || `Mac server returned ${macResponse.status}`,
        mac_response: parsedResponse ?? null,
      })

      return NextResponse.json(
        {
          error: 'Mac server rejected the send request',
          status: macResponse.status,
          server_url: serverUrl,
          details: parsedResponse,
        },
        { status: 502 }
      )
    }

    const { data: savedJob, error: insertError } = await supabase
      .from('send_to_phone_jobs')
      .insert({
        album_name: albumName,
        status: 'imported',
        slides: slides.map((slide) => ({
          order: slide.order,
          note: slide.note || '',
          s3_key: slide.s3_key || null,
        })),
        mac_response: parsedResponse ?? null,
      })
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json(
        {
          error: 'Slides sent but failed to persist send job',
          details: insertError.message,
          server_url: serverUrl,
          mac_response: parsedResponse,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      jobId: savedJob.id,
      mac_response: parsedResponse,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Mac server request timed out' }, { status: 504 })
    }

    if (error instanceof TypeError) {
      return NextResponse.json({ error: 'Mac server unreachable — is it online?', server_url: MAC_SERVER_URL }, { status: 504 })
    }

    return NextResponse.json(
      {
        error: 'Failed to send slides to phone',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
