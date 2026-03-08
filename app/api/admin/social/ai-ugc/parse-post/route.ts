import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedSlide {
  slideNumber: number
  type: 'persona_photo' | 'loved_one_photo' | 'together_photo' | 'generic_photo' | 'heartchime_card' | 'photo_with_caption'
  era?: string | null
  context?: string | null
  caption?: string | null
  cardMessage?: string | null
}

interface ParsedPost {
  slides: ParsedSlide[]
  overallCaption?: string
  platform?: 'instagram' | 'tiktok' | 'both'
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE PROMPT FOR PARSING
// ═══════════════════════════════════════════════════════════════════════════

function buildParsePrompt(personaName: string, lovedOneName: string, lovedOneRelationship: string, description: string, includeSelfie: boolean = true): string {
  const selfieInstructions = includeSelfie 
    ? `IMPORTANT: Slide 1 is ALWAYS a persona selfie and will be auto-generated separately. Do NOT include Slide 1 in your parsed output. The user's description only covers Slide 2 onward. Start your slide numbering from 2.`
    : `Parse ALL slides starting from Slide 1. The user describes every slide including the first one.`

  const slideNumberNote = includeSelfie
    ? `- slideNumber (start from 2, since Slide 1 is auto-generated)`
    : `- slideNumber (1-indexed, start from 1)`

  const interpretationRule1 = includeSelfie
    ? `1. If the user mentions "Slide 1" or a selfie for ${personaName}, IGNORE IT - Slide 1 is auto-generated`
    : `1. "selfie" or "selfie style" = persona_photo with "selfie, front-facing camera, POV shot" context`

  const renumberRule = includeSelfie
    ? `7. Renumber slides starting from 2 (Slide 1 is reserved for the auto-generated selfie)`
    : `7. Keep slide numbers as the user specifies them (starting from 1)`

  return `You are parsing a natural language description of a social media carousel post into structured slide definitions.

${selfieInstructions}

PERSONA INFO:
- Persona name: ${personaName}
- Deceased loved one name: ${lovedOneName} (${lovedOneRelationship})

USER'S DESCRIPTION:
"${description}"

Parse this into a structured JSON object. Each slide should have:
${slideNumberNote}
- type: one of:
  - "persona_photo" - photo of just ${personaName}
  - "loved_one_photo" - photo of just ${lovedOneName}
  - "together_photo" - photo of both ${personaName} and ${lovedOneName}
  - "generic_photo" - photo without people (food, objects, scenes)
  - "heartchime_card" - a HeartChime card (golden gradient card with photo and message)
  - "photo_with_caption" - any photo type with text overlay caption
- era (optional): "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", or "2020s"
- context (optional): scene description like "in kitchen cooking", "at coffee shop", "selfie style"
- caption (optional): text overlay for the slide
- cardMessage (optional): message text for heartchime_card type only

INTERPRETATION RULES:
${interpretationRule1}
2. "old photo" or "throwback" with both people = together_photo with appropriate era
3. "HeartChime card" or just "card" = heartchime_card
4. Food, objects, or scenes without people = generic_photo
5. If era mentions like "90s", "the 90s" = "1990s"
6. If a slide has a caption/text overlay AND a photo type, use the underlying photo type and add the caption field
${renumberRule}

Also extract:
- overallCaption: the post caption (text that goes in the Instagram/TikTok caption, not on slides)
- platform: "instagram", "tiktok", or "both" if specified

RESPOND WITH ONLY VALID JSON, no markdown, no explanation:
{
  "slides": [...],
  "overallCaption": "...",
  "platform": "..."
}
`
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/parse-post
// Parse natural language description into structured slide definitions
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { personaId, description, includeSelfie = true } = body as {
      personaId: string
      description: string
      includeSelfie?: boolean
    }

    if (!personaId || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: personaId, description' },
        { status: 400 }
      )
    }

    // Fetch persona and loved one
    const { data: persona, error: personaError } = await supabase
      .from('ai_ugc_personas')
      .select('*')
      .eq('id', personaId)
      .single()

    if (personaError || !persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    const { data: lovedOnes } = await supabase
      .from('ai_ugc_loved_ones')
      .select('*')
      .eq('persona_id', personaId)
      .limit(1)

    const lovedOne = lovedOnes?.[0]

    // Build prompt and call Claude
    const prompt = buildParsePrompt(
      persona.name,
      lovedOne?.name || 'their loved one',
      lovedOne?.relationship || 'loved one',
      description,
      includeSelfie
    )

    console.log('[ai-ugc/parse-post] Parsing description:', description.slice(0, 100))

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })
    }

    // Parse JSON response
    let parsed: ParsedPost
    try {
      // Clean up response (remove markdown code blocks if present)
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      parsed = JSON.parse(jsonStr)
    } catch (parseError) {
      console.error('[ai-ugc/parse-post] Failed to parse Claude response:', textContent.text)
      return NextResponse.json(
        { error: 'Failed to parse response', rawResponse: textContent.text },
        { status: 500 }
      )
    }

    console.log('[ai-ugc/parse-post] Parsed:', JSON.stringify(parsed, null, 2))

    return NextResponse.json({
      success: true,
      parsed,
      persona: {
        id: persona.id,
        name: persona.name,
        master_photo_url: persona.master_photo_url,
      },
      lovedOne: lovedOne ? {
        id: lovedOne.id,
        name: lovedOne.name,
        relationship: lovedOne.relationship,
        master_photo_url: lovedOne.master_photo_url,
      } : null,
    })
  } catch (error) {
    console.error('[ai-ugc/parse-post] Error:', error)
    return NextResponse.json(
      { error: 'Failed to parse post', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/social/ai-ugc/parse-post',
    description: 'Parse natural language description into structured slide definitions',
    params: {
      personaId: 'string (required) - UUID of the persona',
      description: 'string (required) - Natural language description of the post',
    },
    example: {
      personaId: 'uuid',
      description: '4 slide carousel. Slide 1: Linda selfie in kitchen. Slide 2: pot of pasta. Slide 3: old photo of Linda and mom cooking in the 90s. Slide 4: HeartChime card.',
    },
  })
}

