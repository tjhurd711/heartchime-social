import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSocialCaptionPrompt, getFallbackCaption, SocialPostType } from '@/lib/socialCaptionTemplates'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { buildPhotoPrompt } from '@/lib/socialPhotoPrompt'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { getRandomSocialCaption } from '@/lib/socialMemoryBank'

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GeneratePostRequest {
  selfieUrl: string // Pre-generated selfie URL from the UI
  postType: SocialPostType
  relationship: string
  nickname: string
  hookText: string
  hookStyle: TextStyle
  platform: 'tiktok' | 'instagram' | 'both'
  scheduledTime?: string // ISO datetime
  timePeriod?: string
  spouseName?: string // Required for wedding_anniversary
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/generate-post
// Full post generation flow: caption → slide 1 → slide 2 → save to DB
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: GeneratePostRequest = await request.json()
    const {
      selfieUrl,
      postType,
      relationship,
      nickname,
      hookText,
      hookStyle = 'snapchat',
      platform = 'both',
      scheduledTime,
      timePeriod,
      spouseName,
    } = body

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    if (!selfieUrl) {
      return NextResponse.json({ error: 'Missing required field: selfieUrl' }, { status: 400 })
    }
    if (!postType) {
      return NextResponse.json({ error: 'Missing required field: postType' }, { status: 400 })
    }
    if (!relationship) {
      return NextResponse.json({ error: 'Missing required field: relationship' }, { status: 400 })
    }
    if (!hookText) {
      return NextResponse.json({ error: 'Missing required field: hookText' }, { status: 400 })
    }

    const validPostTypes: SocialPostType[] = ['birthday', 'passing_anniversary', 'wedding_anniversary', 'user_birthday']
    if (!validPostTypes.includes(postType)) {
      return NextResponse.json({ error: `Invalid postType. Must be one of: ${validPostTypes.join(', ')}` }, { status: 400 })
    }

    console.log('[generate-post] Starting generation for:', { postType, nickname, selfieUrl: selfieUrl.slice(0, 50) + '...' })

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Generate card message (for HeartChime slide 2)
    // ═══════════════════════════════════════════════════════════════════════

    let cardMessage: string

    try {
      if (postType === 'user_birthday') {
        // User birthday: No Claude needed, direct string building
        const { buildUserBirthdayCaption } = await import('@/lib/socialMemoryBank')
        cardMessage = buildUserBirthdayCaption(relationship, nickname || relationship)
        console.log('[generate-post] User birthday card message:', cardMessage)

      } else if (postType === 'wedding_anniversary') {
        // Wedding anniversary: No Claude needed, direct string building
        const { buildWeddingAnniversaryCaption } = await import('@/lib/socialMemoryBank')
        cardMessage = buildWeddingAnniversaryCaption(relationship, nickname || relationship)
        console.log('[generate-post] Wedding anniversary card message:', cardMessage)

      } else if (postType === 'passing_anniversary') {
        // Death anniversary: No Claude needed, direct string building
        const { buildDeathAnniversaryCaption } = await import('@/lib/socialMemoryBank')
        cardMessage = buildDeathAnniversaryCaption(relationship, nickname || relationship)
        console.log('[generate-post] Death anniversary card message:', cardMessage)

      } else if (postType === 'birthday') {
        // Birthday: Simple approach - Claude rewrites ONE memory, we plug into template
        const { getRandomMemory } = await import('@/lib/socialMemoryBank')
        const memory = getRandomMemory(relationship)
        const pronouns = relationship.match(/mother|mom|grandmother|grandma|nana|nanny|aunt|sister/i)
          ? { possessive: 'her', object: 'her' }
          : { possessive: 'his', object: 'him' }
        const age = Math.floor(Math.random() * 14) + 75
        const capitalizedNickname = (nickname || relationship).charAt(0).toUpperCase() + (nickname || relationship).slice(1)

        const apiKey = process.env.ANTHROPIC_API_KEY
        console.log('[generate-post] ANTHROPIC_API_KEY exists:', !!apiKey)
        
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY not set')
        }

        const prompt = `Rewrite this memory fragment into a complete, natural sentence that starts with "Take a second to think about how":

Memory: "${memory}"

Then put it in this template:
"Today, ${capitalizedNickname} would have turned ${age}. [YOUR SENTENCE HERE] — ${pronouns.possessive} memory still lives on with you. Smile a little extra for ${pronouns.object} today."

Return ONLY the final caption. Nothing else.`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`)
        }

        const data = await response.json()
        cardMessage = data.content?.[0]?.text?.trim() || getFallbackCaption(postType, nickname || relationship, relationship)
        console.log('[generate-post] Birthday card message:', cardMessage)

      } else {
        // Other post types: use the template system
        const prompt = buildSocialCaptionPrompt({
          postType,
          relationship,
          nickname: nickname || relationship,
        })

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY not set')
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`)
        }

        const data = await response.json()
        cardMessage = data.content?.[0]?.text?.trim() || getFallbackCaption(postType, nickname || relationship, relationship)
        console.log('[generate-post] Card message generated:', cardMessage.substring(0, 50) + '...')
      }
    } catch (captionError) {
      console.error('[generate-post] Card message generation failed, using fallback:', captionError)
      cardMessage = getFallbackCaption(postType, nickname || relationship, relationship)
    }

    // Get random social caption for IG/TikTok post description
    const socialCaption = getRandomSocialCaption()
    console.log('[generate-post] Social caption:', socialCaption)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Generate vintage photo with Gemini Imagen 4
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-post] Generating vintage photo with Gemini...')
    // Use default demographic values for vintage photo generation since we no longer have recipient data
    const photoPrompt = buildPhotoPrompt(
      postType,
      relationship,
      'female', // Default gender for deceased
      '40s', // Default age range for recipient
      timePeriod || '1990s',
      undefined // Ethnicity not specified
    )
    console.log('[generate-post] ═══════════════════════════════════════════')
    console.log('[generate-post] PHOTO PROMPT DEBUG:')
    console.log('[generate-post] postType:', postType)
    console.log('[generate-post] relationship:', relationship)
    console.log('[generate-post] timePeriod:', timePeriod)
    console.log('[generate-post] FULL PROMPT:')
    console.log(photoPrompt)
    console.log('[generate-post] ═══════════════════════════════════════════')
    const generatedPhotoUrl = await generateAndUploadPhoto(photoPrompt)
    console.log('[generate-post] Generated photo:', generatedPhotoUrl)

    // Use generated photo for slide 2, fallback to selfie if generation fails
    const cardPhotoUrl = generatedPhotoUrl || selfieUrl

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Render slide 1 (selfie + hook)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-post] Rendering slide 1...')
    const slide1Url = await renderAndUploadSlide1(selfieUrl, hookText, hookStyle)
    console.log('[generate-post] Slide 1 uploaded:', slide1Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Render slide 2 (HeartChime card with card message + AI-generated photo)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-post] Rendering slide 2...')
    const slide2Url = await renderAndUploadSocialCard(cardPhotoUrl, cardMessage)
    console.log('[generate-post] Slide 2 uploaded:', slide2Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Create post record in database
    // ═══════════════════════════════════════════════════════════════════════

    const postData = {
      status: scheduledTime ? 'pending' : 'draft',
      platform,
      post_type: postType,
      slide_1_url: slide1Url,
      slide_2_url: slide2Url,
      hook_text: hookText,
      text_style: hookStyle,
      deceased_nickname: nickname || relationship,
      deceased_relationship: relationship,
      caption: socialCaption, // Social media caption for IG/TikTok
      card_message: cardMessage, // Message displayed on HeartChime card
      generated_photo_url: generatedPhotoUrl || null, // AI-generated photo URL for regeneration
      time_period: timePeriod || null,
      scheduled_time: scheduledTime || null,
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postData)
      .select()
      .single()

    if (postError) {
      console.error('[generate-post] Failed to create post:', postError)
      return NextResponse.json({ error: 'Failed to create post record', details: postError.message }, { status: 500 })
    }

    console.log('[generate-post] Post created:', post.id)

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN SUCCESS
    // ═══════════════════════════════════════════════════════════════════════

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        status: post.status,
        slide_1_url: slide1Url,
        slide_2_url: slide2Url,
        caption: socialCaption,
        card_message: cardMessage,
        platform,
        post_type: postType,
        scheduled_time: scheduledTime || null,
      },
    })

  } catch (error) {
    console.error('[generate-post] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate post',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Health check / info
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/social/generate-post',
    method: 'POST',
    description: 'Generate a complete social media post with AI caption and rendered slides',
    body: {
      selfieUrl: 'string (required) - Pre-generated selfie URL from /api/admin/social/generate-selfie',
      postType: "'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday' (required)",
      relationship: 'string (required) - e.g., grandmother, father',
      nickname: 'string (optional) - e.g., Nanny, Pop',
      hookText: 'string (required) - The hook text for slide 1',
      hookStyle: "'snapchat' | 'clean' (default: 'snapchat')",
      platform: "'tiktok' | 'instagram' | 'both' (default: 'both')",
      scheduledTime: 'string (optional) - ISO datetime for scheduling',
      timePeriod: 'string (optional) - e.g., 1970s',
    },
    flow: [
      '1. Use pre-generated selfie URL for slide 1',
      '2. Generate caption via Claude AI',
      '3. Generate vintage photo with Gemini for slide 2',
      '4. Render slide 1 (selfie + hook text overlay)',
      '5. Render slide 2 (HeartChime card)',
      '6. Upload both to S3',
      '7. Create post record in social_posts',
      '8. Return post data',
    ],
  })
}

