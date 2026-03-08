// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL CAPTION TEMPLATES - Claude prompts for social media card messages
// ═══════════════════════════════════════════════════════════════════════════
//
// These templates generate brief, emotional messages for social media posts
// featuring HeartChime notification cards with photos of deceased loved ones.
//
// Used for: TikTok, Instagram evergreen content
// ═══════════════════════════════════════════════════════════════════════════

import { getRandomMemory } from './socialMemoryBank'

// ═══════════════════════════════════════════════════════════════════════════
// PRONOUN HELPER - Derive pronouns from relationship
// ═══════════════════════════════════════════════════════════════════════════

type Pronouns = { subject: string; object: string; possessive: string }

function getPronouns(relationship: string): Pronouns {
  const femaleRelationships = ['mother', 'mom', 'grandmother', 'grandma', 'nana', 'nanny', 'aunt', 'sister', 'wife', 'daughter']
  const normalized = relationship.toLowerCase().trim()
  
  if (femaleRelationships.some(r => normalized.includes(r))) {
    return { subject: 'she', object: 'her', possessive: 'her' }
  }
  return { subject: 'he', object: 'him', possessive: 'his' }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT - Prepended to all social caption requests
// ═══════════════════════════════════════════════════════════════════════════
const SOCIAL_SYSTEM_PROMPT = `You write HeartChime notification messages. These are brief, emotional messages that accompany a photo of a deceased loved one.

STRICT RULES:
- 2-4 sentences max
- No greetings, no signatures
- No emojis, no hashtags
- Never use "I" or "we" — HeartChime is not a person
- Use the nickname throughout, never "your [relationship]"
- ALWAYS use the correct pronouns provided (he/him/his OR she/her/hers)
- NEVER use "they/them" for a single person
- Use a SPECIFIC age when instructed (e.g., "would have turned 82")
- Show don't tell — paint a scene, don't state feelings
- Follow the EXACT STRUCTURE provided in each prompt — do not deviate`

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SocialPostType = 'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday'

export interface SocialCaptionParams {
  postType: SocialPostType
  relationship: string
  nickname: string
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

const SOCIAL_TEMPLATES: Record<SocialPostType, (params: SocialCaptionParams) => string> = {
  birthday: ({ relationship, nickname }) => {
    const p = getPronouns(relationship)
    const memory = getRandomMemory(relationship)
    console.log('[birthday template] ═══════════════════════════════════════════════')
    console.log('[birthday template] Called with relationship:', relationship, 'nickname:', nickname)
    console.log('[birthday template] Selected memory:', memory)
    console.log('[birthday template] ═══════════════════════════════════════════════')
    
    // Pick a random age between 75-88
    const age = 75 + Math.floor(Math.random() * 14)
    
    return `Write EXACTLY this caption, filling in the bracketed part:

"Today, ${nickname} would have turned ${age}. [REPHRASE THIS INTO A VIVID SCENE: ${memory}] — ${p.possessive} memory still lives on with you. Smile a little extra for ${p.object} today."

CRITICAL INSTRUCTIONS:
1. Keep sentence 1 EXACTLY as written: "Today, ${nickname} would have turned ${age}."
2. For sentence 2, transform "${memory}" into a vivid, specific scene. Examples:
   - "How she sacrificed things..." → "Think back to all the things she gave up for you that you didn't even know about until years later"
   - "The way she knew something was wrong..." → "Remember how she always knew something was off before you said a word"
3. Keep sentence 3 EXACTLY as written: "${p.possessive.charAt(0).toUpperCase() + p.possessive.slice(1)} memory still lives on with you. Smile a little extra for ${p.object} today."

DO NOT use generic phrases like "The world was better for having ${p.object}."
DO NOT skip the memory - it MUST appear in sentence 2.
Use ${p.subject}/${p.object}/${p.possessive} pronouns.

Output ONLY the 3-sentence caption. Nothing else.`
  },

  passing_anniversary: ({ relationship, nickname }) => {
    const p = getPronouns(relationship)
    return `
Post type: Death anniversary
Relationship: ${relationship}
Nickname: ${nickname}
Pronouns: ${p.subject}/${p.object}/${p.possessive}

Write a reverent, tender message. No silver linings. FOLLOW THIS EXACT STRUCTURE:
1. "[INVENT 1-5] years ago today, ${nickname} left this world."
2. One sentence grounding who ${p.subject} was with a VIVID invented detail (habit, trait, memory)
3. "But everything ${p.subject} gave — [the love, the lessons, ${p.possessive} way of...] — that's still here."
4. "Let yourself feel it all today." (or similar gentle permission)

EXAMPLE OUTPUT:
"2 years ago today, Pop left this world. The man who taught you to fish at dawn every Saturday, who never once rushed a cast. But everything he gave — the patience, the quiet lessons — that's still here. Let yourself feel it all today."`
  },

  wedding_anniversary: ({ relationship, nickname }) => {
    const p = getPronouns(relationship)
    return `
Post type: Wedding anniversary  
Relationship: ${relationship}
Nickname: ${nickname}
Pronouns: ${p.subject}/${p.object}/${p.possessive}

Write an intimate message honoring their partnership. FOLLOW THIS EXACT STRUCTURE:
1. "[INVENT 40-60] years ago today, ${nickname} and [INVENT SPOUSE NAME] said 'I do'."
2. One sentence painting their love with a VIVID invented detail (their thing, a moment, how they were together)
3. "That kind of love doesn't fade."
4. Acknowledge ${p.subject}'s being carried forward (by spouse, family, memory)

EXAMPLE OUTPUT:
"45 years ago today, Grandma and Earl said 'I do.' They always said the best part was that the adventure never really ended — Sunday drives to nowhere, holding hands in the car. That kind of love doesn't fade. She's being carried forward today."`
  },

  user_birthday: ({ relationship, nickname }) => {
    const p = getPronouns(relationship)
    return `
Post type: Recipient's birthday (the living person's birthday)
Relationship: ${relationship}
Nickname: ${nickname}
Pronouns: ${p.subject}/${p.object}/${p.possessive}

Write a warm message — the deceased celebrating the recipient. FOLLOW THIS EXACT STRUCTURE:
1. "Today is your day."
2. How ${nickname} would have shown up (INVENT a vivid detail — what ${p.subject}'d be doing, saying)
3. "${p.possessive.charAt(0).toUpperCase() + p.possessive.slice(1)} [love/pride] is still here."
4. "Feel that today." (or "Celebrate for both of you.")

EXAMPLE OUTPUT:
"Today is your day — and Grandpa would've been the first one at the door, a card in hand with his terrible handwriting and a twenty folded inside. His pride in you is still here. Feel that today."`
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION - Build full prompt for Claude
// ═══════════════════════════════════════════════════════════════════════════

export function buildSocialCaptionPrompt(params: SocialCaptionParams): string {
  const templateBuilder = SOCIAL_TEMPLATES[params.postType]
  
  if (!templateBuilder) {
    // Fallback for unknown post types
    return `${SOCIAL_SYSTEM_PROMPT}

Post type: ${params.postType}
Relationship: ${params.relationship}
Nickname: ${params.nickname}

Write a brief, warm message about missing ${params.nickname}. 2-4 sentences, no emojis or hashtags.`
  }

  const typeSpecificPrompt = templateBuilder(params)

  // For birthday, the template is self-contained - don't prepend system prompt
  if (params.postType === 'birthday') {
    return typeSpecificPrompt
  }

  return `${SOCIAL_SYSTEM_PROMPT}

${typeSpecificPrompt}

Output only the message text. Nothing else.`
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - Get display info for post types
// ═══════════════════════════════════════════════════════════════════════════

export const POST_TYPE_INFO: Record<SocialPostType, { label: string; emoji: string; description: string }> = {
  birthday: { label: 'Birthday', emoji: '🎂', description: "Deceased's birthday" },
  passing_anniversary: { label: 'Anniversary', emoji: '🕯️', description: 'Death anniversary' },
  wedding_anniversary: { label: 'Wedding Anniversary', emoji: '💍', description: "Couple's anniversary" },
  user_birthday: { label: 'User Birthday', emoji: '🎁', description: "Recipient's birthday" },
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - Generate fallback caption (non-AI)
// ═══════════════════════════════════════════════════════════════════════════

export function getFallbackCaption(postType: SocialPostType, nickname: string, relationship?: string): string {
  // Use relationship for pronouns if available, otherwise default to neutral phrasing
  const p = relationship ? getPronouns(relationship) : { subject: 'they', object: 'them', possessive: 'their' }
  
  switch (postType) {
    case 'birthday':
      return `Today, ${nickname} would have turned 82. The world was better for having ${p.object}. Smile a little extra for ${p.object} today.`
    case 'passing_anniversary':
      return `2 years ago today, ${nickname} left this world. But everything ${p.subject} gave — the love, the lessons — that's still here. Let yourself feel it all today.`
    case 'wedding_anniversary':
      return `45 years ago today, ${nickname} said 'I do.' That kind of love doesn't fade. ${p.subject.charAt(0).toUpperCase() + p.subject.slice(1)}'s being carried forward today.`
    case 'user_birthday':
      return `Today is your day — and ${nickname} would've been the first one celebrating. ${p.possessive.charAt(0).toUpperCase() + p.possessive.slice(1)} pride in you is still here. Feel that today.`
    default:
      return `Thinking of ${nickname} today. ${p.possessive.charAt(0).toUpperCase() + p.possessive.slice(1)} memory lives on.`
  }
}

