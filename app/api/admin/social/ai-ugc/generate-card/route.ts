import { NextRequest, NextResponse } from 'next/server'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE HEARTCHIME CARD
// Takes a photo URL and message, generates the card
// Simplified to match the working /api/admin/social/render-card endpoint
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { photoUrl, message, manualCropUrl } = body as {
      photoUrl: string
      message?: string
      manualCropUrl?: string // Optional manually cropped image
    }

    if (!photoUrl) {
      return NextResponse.json(
        { error: 'Missing required field: photoUrl' },
        { status: 400 }
      )
    }

    console.log('[generate-card] ═══════════════════════════════════════════')
    console.log('[generate-card] 🎴 GENERATING HEARTCHIME CARD')
    console.log('[generate-card] ═══════════════════════════════════════════')
    console.log('[generate-card] Photo URL:', photoUrl.slice(0, 80) + '...')
    console.log('[generate-card] Message:', message || '(none provided)')
    console.log('[generate-card] Manual crop:', manualCropUrl ? 'YES' : 'NO')

    // Use manual crop if provided, otherwise use the original photo
    const finalPhotoUrl = manualCropUrl || photoUrl
    console.log('[generate-card] Using photo:', finalPhotoUrl.slice(0, 60) + '...')

    // Use the message or a default
    const finalMessage = message || 'Missing you today ❤️'
    console.log('[generate-card] Final message:', finalMessage)

    // Generate the HeartChime card - let socialCardRenderer handle everything
    // (fetching image, embedding as base64, CSS border-radius for rounded corners)
    console.log('[generate-card] 🎨 Rendering HeartChime card...')
    const cardUrl = await renderAndUploadSocialCard(finalPhotoUrl, finalMessage)
    
    console.log('[generate-card] ✅ Card generated:', cardUrl.slice(0, 60) + '...')
    console.log('[generate-card] ═══════════════════════════════════════════')

    return NextResponse.json({
      success: true,
      cardUrl,
      croppedPhotoUrl: finalPhotoUrl,
      message: finalMessage,
    })
  } catch (error) {
    console.error('[generate-card] ❌ Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
