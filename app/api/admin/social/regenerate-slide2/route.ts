import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildPhotoPrompt } from '@/lib/socialPhotoPrompt'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { 
  buildBirthdayCaption, 
  buildDeathAnniversaryCaption, 
  buildWeddingAnniversaryCaption, 
  buildUserBirthdayCaption 
} from '@/lib/socialMemoryBank'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { postId, regenerateType } = await request.json()
    console.log('[regenerate] Starting:', { postId, regenerateType })
    
    // Get the post
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .single()
    
    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    
    // Get the recipient
    const { data: recipient } = await supabase
      .from('social_recipients')
      .select('*')
      .eq('id', post.recipient_id)
      .single()
    
    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }
    
    const updates: Record<string, any> = {}
    let photoUrlForCard = post.generated_photo_url
    
    // Regenerate photo if requested
    if (regenerateType === 'photo' || regenerateType === 'both') {
      console.log('[regenerate] Regenerating photo...')
      const photoPrompt = buildPhotoPrompt(
        post.post_type,
        post.deceased_relationship,
        recipient.gender || 'female',
        recipient.age_range || '40s',
        post.time_period || '1990s',
        recipient.ethnicity || undefined
      )
      
      const newPhotoUrl = await generateAndUploadPhoto(photoPrompt)
      if (newPhotoUrl) {
        updates.generated_photo_url = newPhotoUrl
        photoUrlForCard = newPhotoUrl
      }
    }
    
    // Regenerate caption if requested
    let cardMessage = post.card_message
    if (regenerateType === 'caption' || regenerateType === 'both') {
      console.log('[regenerate] Regenerating caption...')
      
      const postType = post.post_type
      const relationship = post.deceased_relationship
      const nickname = post.deceased_nickname
      
      if (postType === 'birthday') {
        cardMessage = buildBirthdayCaption(relationship, nickname)
      } else if (postType === 'passing_anniversary') {
        cardMessage = buildDeathAnniversaryCaption(relationship, nickname)
      } else if (postType === 'wedding_anniversary') {
        cardMessage = buildWeddingAnniversaryCaption(relationship, nickname)
      } else if (postType === 'user_birthday') {
        cardMessage = buildUserBirthdayCaption(relationship, nickname)
      }
      
      updates.card_message = cardMessage
    }
    
    // Re-render slide 2 if we changed photo or caption
    if (Object.keys(updates).length > 0) {
      console.log('[regenerate] Re-rendering slide 2...')
      
      const renderResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/social/render-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl: photoUrlForCard,
          message: cardMessage
        })
      })
      
      const renderData = await renderResponse.json()
      if (renderData.url) {
        updates.slide_2_url = renderData.url
      }
      
      // Update the post
      const { error: updateError } = await supabase
        .from('social_posts')
        .update(updates)
        .eq('id', postId)
      
      if (updateError) {
        console.error('[regenerate] Update error:', updateError)
        return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
      }
    }
    
    console.log('[regenerate] Success:', updates)
    return NextResponse.json({ success: true, updates })
    
  } catch (error) {
    console.error('[regenerate] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
