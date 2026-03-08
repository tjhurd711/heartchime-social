import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { buildLivePastPhotoPrompt } from '@/lib/socialPhotoPrompt'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { renderAndUploadSlide3 } from '@/lib/socialSlide3Renderer'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Categories that support Slide 3 rendering
const SLIDE_3_CATEGORIES = ['music', 'movies_tv', 'people']

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

interface GenerateLivePastPostRequest {
  selfieUrl: string  // Pre-generated selfie URL from the UI
  culturalMomentId: string
  relationship: string
  nickname: string
  hookText: string
  hookStyle: TextStyle
  platform: 'tiktok' | 'instagram' | 'both'
  scheduledTime?: string
  photoHint: string  // User-provided scene description for the vintage photo
  timePeriod?: string  // User-selected photo era, overrides auto-derive from moment date
  peopleOverride?: 'solo' | 'two'  // Override auto people count in photo
}

interface CulturalMoment {
  id: string
  title: string
  date_occurred: string
  category: string
  context_prompt: string | null
  suggested_hook: string | null
  media_title: string | null
  media_artist: string | null
  media_thumbnail_url: string | null
  slide_3_type: string | null
  is_recurring: boolean
  times_used: number
  last_used_at: string | null
  created_at: string
}

interface Recipient {
  id: string
  name: string
  age_range: string
  gender: string
  ethnicity: string | null
  image_clean_url: string
  times_used: number
  last_used_at: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/generate-live-past-post
// Full Live Past post generation flow
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: GenerateLivePastPostRequest = await request.json()
    const {
      selfieUrl,
      culturalMomentId,
      relationship,
      nickname,
      hookText,
      hookStyle = 'snapchat',
      platform = 'both',
      scheduledTime,
      photoHint,
      timePeriod: userTimePeriod,
      peopleOverride,
    } = body

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Validate required fields
    // ═══════════════════════════════════════════════════════════════════════

    if (!selfieUrl) {
      return NextResponse.json({ error: 'Missing required field: selfieUrl' }, { status: 400 })
    }
    if (!culturalMomentId) {
      return NextResponse.json({ error: 'Missing required field: culturalMomentId' }, { status: 400 })
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

    console.log('[generate-live-past-post] Starting generation for:', { culturalMomentId, relationship, selfieUrl: selfieUrl.slice(0, 50) + '...' })

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Fetch cultural moment
    // ═══════════════════════════════════════════════════════════════════════

    const { data: culturalMoment, error: momentError } = await supabase
      .from('social_cultural_moments')
      .select('*')
      .eq('id', culturalMomentId)
      .single()

    if (momentError || !culturalMoment) {
      console.error('[generate-live-past-post] Cultural moment not found:', momentError)
      return NextResponse.json({ error: 'Cultural moment not found' }, { status: 404 })
    }

    console.log('[generate-live-past-post] Found cultural moment:', culturalMoment.title)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Determine time period (user-selected or derive from cultural moment)
    // ═══════════════════════════════════════════════════════════════════════

    // Use user-selected time period if provided, otherwise derive from cultural moment date
    const momentYear = new Date(culturalMoment.date_occurred).getFullYear()
    const decade = userTimePeriod || `${Math.floor(momentYear / 10) * 10}s` // e.g., "2010s"

    console.log('[generate-live-past-post] Time period:', decade, userTimePeriod ? '(user-selected)' : `(derived from year: ${momentYear})`)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Generate card message via Claude API
    // ═══════════════════════════════════════════════════════════════════════

    let cardMessage: string

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      console.log('[generate-live-past-post] ANTHROPIC_API_KEY exists:', !!apiKey)

      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set')
      }

      const isHoliday = culturalMoment.category === 'holidays'

      const systemPrompt = isHoliday
        ? `You write HeartChime card messages for holidays. HeartChime sends photo notifications to families about their deceased loved ones on meaningful dates.

EVERY holiday message follows this exact 4-beat structure:
1. NAME THE DAY — State the holiday warmly. "Today is Christmas." "Happy Thanksgiving." Simple.
2. THE EMPTY SEAT — Acknowledge the absence without dwelling on it. The chair, the phone call, the tradition that feels different. One sentence, honest but not devastating.
3. BUT THEY'RE STILL HERE — Pivot to warmth. They live on in the traditions, the recipes, the way you do things because of them. The love they built is still in the room.
4. THE CTA — A gentle, ritual-based action. "Set a place in your heart for them today." "Raise a glass." "Make their recipe." "Tell their favorite story." Something the reader can DO.

TONE RULES:
- Warm, bittersweet, but ultimately hopeful — NOT gutting
- Like a thoughtful text from a family member who gets it
- Use the nickname naturally
- 2-4 sentences max
- One emoji max, only if natural
- NEVER mention HeartChime by name
- NEVER use generic grief platitudes like "sending love" or "thinking of you"
- NEVER start with "Remember when" or "They say"
- The goal is to make someone smile through watery eyes, not ugly cry

EXAMPLES OF GREAT HOLIDAY MESSAGES:
- "Merry Christmas 🎄 — the tree looks a little different this year without Nanny helping decorate it. But her ornaments are still on there, and so is everything she taught you about making the holidays feel like home. Tell her favorite story at dinner tonight."
- "Happy Thanksgiving — Papa's chair might be empty but the table is still full because of the family he built. Make his plate anyway. He earned it."
- "Happy Father's Day — Dad's not here to get another terrible tie, but he's here in every bad joke you tell and every time you fire up the grill. Do something he loved today, for him."

Return ONLY the card message. Nothing else. No quotes around it.`

        : `You write HeartChime card messages. HeartChime sends photo notifications to families about their deceased loved ones when something happens in the world that would have mattered to them.

EVERY message follows this exact 3-beat structure:
1. THE EVENT — State what happened. Factual, present tense or "X years ago today." Include specific details (scores, names, dates) when available.
2. THE CONNECTION — How the deceased related to this. What they loved about it, how they experienced it, a specific habit or memory tied to it. This should feel like something a family member actually told us.
3. THE NUDGE — A warm close. "This one's for him." "Give it a listen for her." "Tune in on Sunday for him." Something that gently pushes the reader to DO something in honor of the person.

TONE RULES:
- Conversational, warm, like a text from a thoughtful friend
- NOT poetic. NOT therapy-speak. NOT "their memory lives on in the wind"
- Use the nickname naturally, like a family member would
- Exclamation points are fine when the event is exciting
- Em dashes are your friend
- 2-4 sentences max
- One emoji max, only if natural (use sport/activity emojis, not hearts on everything)
- Specific > vague. "Kept his car in showroom condition for 40 years" beats "loved his car so much"
- NEVER mention HeartChime by name
- NEVER say "sending love" or "thinking of you" or any generic grief platitude
- NEVER start with "Remember when" or "They say" or any cliche opener

EXAMPLES OF GREAT MESSAGES:
- "The Chiefs just won the Super Bowl 25-22 over the 49ers! Dad would have been so happy — this one's for him!"
- "55 years ago, the 1971 Mustang Mach 1 rolled off the line. Thomas kept his in showroom condition for over 40 years — that car was his pride and joy."
- "Dolly Parton just performed at the Cowboys Thanksgiving Halftime Show! Grandma loved Dolly back when she was topping the charts in the 70s — she would have absolutely loved seeing her still shining."
- "61 years ago today, Elvis released 'Can't Help Falling in Love' — one of Nanny's favorites. When you get a chance, give it a full listen for her!"

Return ONLY the card message. Nothing else. No quotes around it.`

      const userMessage = `Deceased person's relationship to the user: ${relationship}
Nickname the user called them: ${nickname || relationship}
Event: ${culturalMoment.title}
Context: ${culturalMoment.context_prompt || 'A significant cultural moment.'}
${culturalMoment.media_title ? `Media: "${culturalMoment.media_title}" by ${culturalMoment.media_artist}` : ''}
Date it occurred: ${culturalMoment.date_occurred}

Write a HeartChime card message for this event.`

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
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`)
      }

      const data = await response.json()
      cardMessage = data.content?.[0]?.text?.trim()

      if (!cardMessage) {
        throw new Error('Empty response from Claude')
      }

      console.log('[generate-live-past-post] Card message generated:', cardMessage.substring(0, 50) + '...')

    } catch (captionError) {
      console.error('[generate-live-past-post] Card message generation failed, using fallback:', captionError)
      cardMessage = `When "${culturalMoment.media_title || culturalMoment.title}" comes on, you just know. Some memories are woven into the music. 💔`
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Generate social caption
    // ═══════════════════════════════════════════════════════════════════════

    const socialCaption = `example Heartchime from ${momentYear} 💛 pinned post for more`
    console.log('[generate-live-past-post] Social caption:', socialCaption)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Generate vintage photo with Gemini Imagen 4
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-past-post] Generating vintage photo with Gemini...')
    // Use default demographic values since we no longer have recipient data
    const photoPrompt = buildLivePastPhotoPrompt(
      photoHint,
      relationship,
      'female', // Default gender for deceased
      '40s', // Default age range
      decade,
      undefined, // Ethnicity not specified
      peopleOverride
    )

    console.log('[generate-live-past-post] ═══════════════════════════════════════════')
    console.log('[generate-live-past-post] PHOTO PROMPT DEBUG:')
    console.log('[generate-live-past-post] photoHint:', photoHint)
    console.log('[generate-live-past-post] decade:', decade)
    console.log('[generate-live-past-post] FULL PROMPT:')
    console.log(photoPrompt)
    console.log('[generate-live-past-post] ═══════════════════════════════════════════')

    const generatedPhotoUrl = await generateAndUploadPhoto(photoPrompt)
    console.log('[generate-live-past-post] Generated photo:', generatedPhotoUrl)

    // Use generated photo for slide 2, fallback to selfie if generation fails
    const cardPhotoUrl = generatedPhotoUrl || selfieUrl

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Render Slide 1 (selfie + hook + date stamp)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-past-post] Rendering slide 1 with date stamp...')
    const slide1Url = await renderAndUploadSlide1(
      selfieUrl,
      hookText,
      hookStyle,
      culturalMoment.date_occurred // eventDate — triggers date stamp
    )
    console.log('[generate-live-past-post] Slide 1 uploaded:', slide1Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Render Slide 2 (HeartChime card)
    // ═══════════════════════════════════════════════════════════════════════

    console.log('[generate-live-past-post] Rendering slide 2...')
    const slide2Url = await renderAndUploadSocialCard(cardPhotoUrl, cardMessage)
    console.log('[generate-live-past-post] Slide 2 uploaded:', slide2Url)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Optionally render Slide 3
    // Only render for supported categories (music, movies_tv, people)
    // ═══════════════════════════════════════════════════════════════════════

    let slide3Url: string | null = null

    if (
      SLIDE_3_CATEGORIES.includes(culturalMoment.category) &&
      culturalMoment.slide_3_type &&
      culturalMoment.slide_3_type !== 'none' &&
      culturalMoment.media_thumbnail_url
    ) {
      console.log('[generate-live-past-post] Rendering slide 3 for category:', culturalMoment.category)
      slide3Url = await renderAndUploadSlide3(
        culturalMoment.media_thumbnail_url,
        culturalMoment.media_title || culturalMoment.title,
        culturalMoment.media_artist || '',
        String(momentYear),
        culturalMoment.slide_3_type as 'album_art' | 'movie_poster',
        culturalMoment.category, // Pass category to determine which template to use
        cardMessage // Same message as Slide 2
      )
      console.log('[generate-live-past-post] Slide 3 uploaded:', slide3Url)
    } else {
      console.log('[generate-live-past-post] Skipping slide 3 (not configured or unsupported category)')
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Save to database
    // ═══════════════════════════════════════════════════════════════════════

    const postData = {
      status: scheduledTime ? 'pending' : 'draft',
      platform,
      post_type: culturalMoment.category,
      pipeline: 'live_past',
      cultural_moment_id: culturalMomentId,
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
      time_period: decade,
      scheduled_time: scheduledTime || null,
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postData)
      .select()
      .single()

    if (postError) {
      console.error('[generate-live-past-post] Failed to create post:', postError)
      return NextResponse.json({ error: 'Failed to create post record', details: postError.message }, { status: 500 })
    }

    console.log('[generate-live-past-post] Post created:', post.id)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Update cultural moment usage count
    // ═══════════════════════════════════════════════════════════════════════

    await supabase
      .from('social_cultural_moments')
      .update({
        times_used: (culturalMoment.times_used || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', culturalMomentId)

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
        pipeline: 'live_past',
        cultural_moment_id: culturalMomentId,
        scheduled_time: scheduledTime || null,
      },
    })

  } catch (error) {
    console.error('[generate-live-past-post] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate Live Past post',
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
    endpoint: '/api/admin/social/generate-live-past-post',
    method: 'POST',
    description: 'Generate a complete Live Past social media post tied to a cultural moment',
    body: {
      selfieUrl: 'string (required) - Pre-generated selfie URL from /api/admin/social/generate-selfie',
      culturalMomentId: 'string (required) - UUID of the cultural moment',
      relationship: 'string (required) - e.g., grandmother, father',
      nickname: 'string (optional) - e.g., Nanny, Pop',
      hookText: 'string (required) - The hook text for slide 1',
      hookStyle: "'snapchat' | 'clean' (default: 'snapchat')",
      platform: "'tiktok' | 'instagram' | 'both' (default: 'both')",
      scheduledTime: 'string (optional) - ISO datetime for scheduling',
      photoHint: 'string (required) - Scene description for the vintage photo (e.g., "Dad and son on the couch in Cowboys jerseys watching football")',
      timePeriod: 'string (optional) - Photo era, overrides auto-derive from moment date',
      peopleOverride: "'solo' | 'two' (optional) - Override auto people count in photo",
    },
    flow: [
      '1. Validate required fields',
      '2. Fetch cultural moment from social_cultural_moments',
      '3. Generate vintage photo with Gemini',
      '4. Render slide 1 (selfie + hook + date stamp)',
      '5. Render slide 2 (HeartChime card)',
      '6. Optionally render slide 3 (album art / movie poster)',
      '7. Save post to social_posts with pipeline=live_past',
      '8. Update cultural moment usage count',
    ],
    differences_from_evergreen: [
      'Uses pre-generated selfie URL instead of recipient selection',
      'Uses cultural moment instead of post type for context',
      'Derives time period automatically from moment date (can be overridden)',
      'Includes date stamp on slide 1',
      'May include slide 3 for album art / movie posters',
      'Sets pipeline=live_past in database',
    ],
  })
}

