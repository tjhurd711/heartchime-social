import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { renderAndUploadSlide3 } from '@/lib/socialSlide3Renderer'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'

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

interface GenerateLiveNowRequest {
  selfieUrl: string  // Pre-generated selfie URL from the UI
  relationship: string
  nickname: string
  hookText: string
  hookStyle: TextStyle
  platform: 'tiktok' | 'instagram' | 'both'
  timePeriod: string
  photoHint: string
  peopleOverride?: 'solo' | 'two'  // Override auto people count in photo
  // Trend context
  trendKeyword: string
  trendId?: string | null
  whyTrending?: string
  suggestedAngle?: string
  // Manual mode
  isManualMode?: boolean
  manualCaption?: string
  // Slide 3 (optional media slide)
  includeSlide3?: boolean
  slide3Type?: 'album_art' | 'movie_poster'
  slide3ImageUrl?: string
  slide3Title?: string
  slide3Artist?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build photo prompt for trending topic
// ═══════════════════════════════════════════════════════════════════════════

function buildTrendPhotoPrompt(
  photoHint: string,
  relationship: string,
  gender: string,
  ageRange: string,
  timePeriod: string,
  ethnicity?: string,
  peopleOverride?: 'solo' | 'two'
): string {
  const ethnicityClause = ethnicity ? `${ethnicity} ` : ''
  
  // Map relationship to solo description (just the deceased)
  const soloContext: Record<string, string> = {
    grandmother: 'an elderly woman',
    grandfather: 'an elderly man',
    mother: 'a woman',
    father: 'a man',
    aunt: 'a woman',
    uncle: 'a man',
    sister: 'a woman',
    brother: 'a man',
    spouse: 'a person',
    son: 'a young man',
    daughter: 'a young woman',
    friend: 'a person',
  }
  
  // Map relationship to two-people description (deceased + recipient)
  const twoContext: Record<string, string> = {
    grandmother: 'an elderly woman with her grandchild',
    grandfather: 'an elderly man with his grandchild',
    mother: 'a mother with her child',
    father: 'a father with his child',
    aunt: 'an aunt with her niece/nephew',
    uncle: 'an uncle with his niece/nephew',
    sister: 'two sisters together',
    brother: 'two brothers together',
    spouse: 'a loving couple',
    son: 'a mother/father with their son',
    daughter: 'a mother/father with their daughter',
    friend: 'two close friends',
  }
  
  // Determine people description based on override
  let familyDesc: string
  let peopleCount: string
  
  if (peopleOverride === 'solo') {
    familyDesc = soloContext[relationship.toLowerCase()] || 'a person'
    peopleCount = 'Only ONE person in the photo.'
  } else if (peopleOverride === 'two') {
    familyDesc = twoContext[relationship.toLowerCase()] || 'family members together'
    peopleCount = 'Exactly TWO people in the photo.'
  } else {
    // Default to two people (most common case for social posts)
    familyDesc = twoContext[relationship.toLowerCase()] || 'family members together'
    peopleCount = ''
  }
  
  return `Vintage ${timePeriod} family photograph. ${photoHint}. 
  
The photo shows ${familyDesc}. The main subject is a ${ethnicityClause}${gender} in their ${ageRange}. ${peopleCount}

Technical requirements:
- Authentic ${timePeriod} film photography aesthetic
- Warm, slightly faded colors typical of the era
- Natural lighting, candid family moment feel
- Soft focus edges, period-appropriate grain
- Feels like a real photo from someone's family album

This should look like an authentic photo discovered in a box of old family photos, capturing a genuine moment of connection.`
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate card message for trending topic
// ═══════════════════════════════════════════════════════════════════════════

async function generateTrendCardMessage(
  trendKeyword: string,
  relationship: string,
  nickname: string,
  suggestedAngle?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  
  if (!apiKey) {
    // Fallback message
    return `${nickname} would have loved this. Their memory lives on with you. 💕`
  }

  const prompt = `You're writing a short, emotional caption for a HeartChime social media post about grief and memory.

Context:
- Trending topic: "${trendKeyword}"
- The post is from someone missing their deceased ${relationship} (they called them "${nickname}")
${suggestedAngle ? `- Suggested angle: ${suggestedAngle}` : ''}

Write a 2-3 sentence message that:
1. Connects the trending topic to missing their loved one
2. Evokes nostalgia and bittersweet emotion
3. Ends with hope/comfort about their memory living on
4. Uses "you" to speak directly to the viewer (the grieving person)

Keep it under 50 words. Be genuine, not cheesy. No hashtags.

Examples of good tone:
- "${nickname} would have been so excited about this. You can almost hear them now. Their joy lives on in you."
- "This would've been ${nickname}'s favorite. Remember how they'd light up? That light still shines through you."

Return ONLY the caption text, nothing else.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content?.[0]?.text?.trim() || `${nickname} would have loved this. Their memory lives on with you. 💕`
  } catch (error) {
    console.error('[generate-live-now] Card message generation failed:', error)
    return `${nickname} would have loved this. Their memory lives on with you. 💕`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate social caption for trending topic
// ═══════════════════════════════════════════════════════════════════════════

async function generateTrendSocialCaption(
  trendKeyword: string,
  relationship: string,
  nickname: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  
  if (!apiKey) {
    return `Missing ${nickname} today. Some things just aren't the same without them. 💔`
  }

  const prompt = `Write a short TikTok/Instagram caption (1-2 sentences) for a grief/memory post about "${trendKeyword}".

The poster is missing their deceased ${relationship} (called "${nickname}").

Requirements:
- Casual, authentic social media voice
- Connects the trending topic to missing them
- Ends with 1-2 relevant emojis
- Under 20 words
- No hashtags in the caption itself

Return ONLY the caption.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content?.[0]?.text?.trim() || `Missing ${nickname} today. Some things just aren't the same. 💔`
  } catch (error) {
    console.error('[generate-live-now] Social caption generation failed:', error)
    return `Missing ${nickname} today. Some things just aren't the same. 💔`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/generate-live-now-post
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: GenerateLiveNowRequest = await request.json()
    const {
      selfieUrl,
      relationship,
      nickname,
      hookText,
      hookStyle = 'snapchat',
      platform = 'both',
      timePeriod,
      photoHint,
      peopleOverride,
      trendKeyword,
      trendId,
      whyTrending,
      suggestedAngle,
      isManualMode = false,
      manualCaption,
      // Slide 3 (optional)
      includeSlide3 = false,
      slide3Type,
      slide3ImageUrl,
      slide3Title,
      slide3Artist,
    } = body

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    if (!selfieUrl) {
      return NextResponse.json({ error: 'Missing required field: selfieUrl' }, { status: 400 })
    }
    if (!relationship) {
      return NextResponse.json({ error: 'Missing required field: relationship' }, { status: 400 })
    }
    if (!hookText) {
      return NextResponse.json({ error: 'Missing required field: hookText' }, { status: 400 })
    }
    if (!photoHint) {
      return NextResponse.json({ error: 'Missing required field: photoHint' }, { status: 400 })
    }
    
    // Manual mode requires a caption
    if (isManualMode && !manualCaption) {
      return NextResponse.json({ error: 'Manual mode requires manualCaption' }, { status: 400 })
    }

    console.log('[generate-live-now] Starting generation for:', trendKeyword, isManualMode ? '(manual mode)' : '', 'selfie:', selfieUrl.slice(0, 50) + '...')

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Generate card message (for HeartChime slide 2)
    // ═══════════════════════════════════════════════════════════════════════

    let cardMessage: string
    
    if (isManualMode && manualCaption) {
      // Manual mode: use the provided caption directly
      console.log('[generate-live-now] Using manual caption...')
      cardMessage = manualCaption
    } else {
      // Auto mode: generate with Claude
      console.log('[generate-live-now] Generating card message with AI...')
      cardMessage = await generateTrendCardMessage(
        trendKeyword,
        relationship,
        nickname,
        suggestedAngle
      )
    }
    console.log('[generate-live-now] Card message:', cardMessage)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Generate social caption
    // ═══════════════════════════════════════════════════════════════════════

    let socialCaption: string
    
    if (isManualMode) {
      // Manual mode: generate a simple caption based on the topic
      console.log('[generate-live-now] Generating social caption for manual post...')
      socialCaption = await generateTrendSocialCaption(trendKeyword || 'this', relationship, nickname)
    } else {
      console.log('[generate-live-now] Generating social caption...')
      socialCaption = await generateTrendSocialCaption(trendKeyword, relationship, nickname)
    }
    console.log('[generate-live-now] Social caption:', socialCaption)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Generate vintage photo with Gemini
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-now] Generating vintage photo...')
    // Use default demographic values since we no longer have recipient data
    const photoPrompt = buildTrendPhotoPrompt(
      photoHint,
      relationship,
      'female', // Default gender for deceased
      '40s', // Default age range
      timePeriod || '1990s',
      undefined, // Ethnicity not specified
      peopleOverride
    )
    console.log('[generate-live-now] Photo prompt:', photoPrompt.substring(0, 200) + '...')
    
    const generatedPhotoUrl = await generateAndUploadPhoto(photoPrompt)
    console.log('[generate-live-now] Generated photo:', generatedPhotoUrl)

    // Use generated photo for slide 2, fallback to selfie
    const cardPhotoUrl = generatedPhotoUrl || selfieUrl

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Render slide 1 (selfie + hook)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-now] Rendering slide 1...')
    const slide1Url = await renderAndUploadSlide1(selfieUrl, hookText, hookStyle)
    console.log('[generate-live-now] Slide 1 uploaded:', slide1Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Render slide 2 (HeartChime card)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-now] Rendering slide 2...')
    const slide2Url = await renderAndUploadSocialCard(cardPhotoUrl, cardMessage)
    console.log('[generate-live-now] Slide 2 uploaded:', slide2Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6.5: Optionally render Slide 3 (media slide)
    // ═══════════════════════════════════════════════════════════════════════

    let slide3Url: string | null = null

    if (includeSlide3 && slide3ImageUrl && slide3Title && slide3Type) {
      console.log('[generate-live-now] Rendering slide 3...')
      try {
        // Determine category based on slide type for template selection
        const category = slide3Type === 'album_art' ? 'music' : 'movies_tv'
        
        slide3Url = await renderAndUploadSlide3(
          slide3ImageUrl,
          slide3Title,
          slide3Artist || '',
          timePeriod?.replace('s', '') || '2020', // Extract year from period like "1990s" -> "1990"
          slide3Type,
          category,
          cardMessage
        )
        console.log('[generate-live-now] Slide 3 uploaded:', slide3Url)
      } catch (slide3Error) {
        console.error('[generate-live-now] Slide 3 generation failed:', slide3Error)
        // Continue without slide 3 - don't fail the whole post
      }
    } else {
      console.log('[generate-live-now] Skipping slide 3 (not requested)')
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Create post record in database
    // ═══════════════════════════════════════════════════════════════════════

    const postData = {
      status: 'draft',
      platform,
      post_type: isManualMode ? 'manual' : 'trending',
      slide_1_url: slide1Url,
      slide_2_url: slide2Url,
      slide_3_url: slide3Url,
      hook_text: hookText,
      text_style: hookStyle,
      deceased_nickname: nickname || relationship,
      deceased_relationship: relationship,
      caption: socialCaption,
      card_message: cardMessage,
      generated_photo_url: generatedPhotoUrl || null,
      time_period: timePeriod || null,
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postData)
      .select()
      .single()

    if (postError) {
      console.error('[generate-live-now] Failed to create post:', postError)
      return NextResponse.json({ error: 'Failed to create post record', details: postError.message }, { status: 500 })
    }

    console.log('[generate-live-now] Post created:', post.id)

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
        slide_3_url: slide3Url,
        caption: socialCaption,
        card_message: cardMessage,
        platform,
        post_type: isManualMode ? 'manual' : 'trending',
      },
    })

  } catch (error) {
    console.error('[generate-live-now] Unexpected error:', error)
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
    endpoint: '/api/admin/social/generate-live-now-post',
    method: 'POST',
    description: 'Generate a Live Now social media post based on a trending topic',
    body: {
      selfieUrl: 'string (required) - Pre-generated selfie URL from /api/admin/social/generate-selfie',
      relationship: 'string (required) - e.g., grandmother, father',
      nickname: 'string (optional) - e.g., Nanny, Pop',
      hookText: 'string (required) - The hook text for slide 1',
      hookStyle: "'snapchat' | 'clean' (default: 'snapchat')",
      platform: "'tiktok' | 'instagram' | 'both' (default: 'both')",
      timePeriod: 'string (required) - e.g., 1990s',
      photoHint: 'string (required) - Scene description for AI photo generation',
      trendKeyword: 'string (required) - The trending topic',
      trendId: 'string (optional) - UUID of the trend record',
      whyTrending: 'string (optional) - Context about why it\'s trending',
      suggestedAngle: 'string (optional) - Suggested content angle',
    },
  })
}

