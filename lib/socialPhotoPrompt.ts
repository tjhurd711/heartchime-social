// Inverse relationship map
const inverseRelationship: Record<string, { male: string, female: string }> = {
  grandmother: { male: 'grandson', female: 'granddaughter' },
  grandfather: { male: 'grandson', female: 'granddaughter' },
  mother: { male: 'son', female: 'daughter' },
  father: { male: 'son', female: 'daughter' },
  aunt: { male: 'nephew', female: 'niece' },
  uncle: { male: 'nephew', female: 'niece' },
  sister: { male: 'brother', female: 'sister' },
  brother: { male: 'brother', female: 'sister' },
  spouse: { male: 'husband', female: 'wife' },
  son: { male: 'father', female: 'mother' },
  daughter: { male: 'father', female: 'mother' },
  friend: { male: 'friend', female: 'friend' },
}

// Deceased description map
const deceasedDescription: Record<string, string> = {
  grandmother: 'elderly woman with warm smile, soft features, grandmotherly presence',
  grandfather: 'elderly man, distinguished, kind eyes, grandfatherly presence',
  mother: 'middle-aged woman, loving expression, maternal warmth',
  father: 'middle-aged man, proud demeanor, fatherly presence',
  aunt: 'woman in her 40s-50s, warm and approachable',
  uncle: 'man in his 40s-50s, friendly and relaxed',
  sister: 'young woman, sisterly bond visible',
  brother: 'young man, brotherly bond visible',
  spouse: 'loving partner, warm presence, deep connection visible',
  son: 'young man, warm smile, son who was deeply loved',
  daughter: 'young woman, warm smile, daughter who was deeply loved',
  friend: 'close friend, easy smile, comfortable presence',
}

// Era styling map
const eraStyling: Record<string, string> = {
  '1940s': 'Black and white photograph, formal poses, film grain, slight sepia tones, 1940s clothing and hairstyles',
  '1950s': 'Black and white or early Kodachrome colors, formal but relaxed, 1950s fashion, classic Americana feel',
  '1960s': 'Faded Kodachrome colors, warm yellow-orange tones, slight blur, 1960s clothing and hair, candid family snapshot',
  '1970s': 'Warm faded colors, orange and brown tones, soft focus, 1970s fashion, wood paneling or earth tones in background',
  '1980s': 'Saturated colors, flash photography look, slightly washed out, 1980s fashion and hair, bright clothing',
  '1990s': 'Disposable camera aesthetic, red-eye possible, 1990s fashion, casual poses, slightly overexposed flash',
  '2000s': 'Early digital camera quality, slight pixelation, flash photography, 2000s fashion, timestamp in corner acceptable',
  '2010s': 'iPhone quality, natural lighting, Instagram-era aesthetic, 2010s fashion and settings, slightly filtered look',
  '2020s': 'Modern smartphone quality, natural and candid, contemporary clothing, bright and clear but authentic',
}

// Scene banks by event
const sceneBank: Record<string, string[]> = {
  birthday: [
    'family gathered around kitchen table with birthday cake, shot from across the room',
    'backyard birthday party with decorations and balloons, wide angle shot',
    'living room with wrapped presents scattered around, medium shot from doorway',
    'restaurant booth with birthday candles glowing, shot from end of table',
    'picnic table at a park with birthday setup, wide shot',
  ],
  passing_anniversary: [
    'two people sitting together on a porch swing, shot from the yard',
    'walking side by side down a tree-lined sidewalk, shot from behind at a distance',
    'sitting across from each other at a kitchen table, shot through a doorway',
    'standing together in a backyard garden, medium wide shot',
    'sitting on a couch looking at photos together, shot from across the room',
  ],
  wedding_anniversary: [
    'couple dancing together at a party, shot from across the room',
    'sitting close together at a fancy dinner table, medium shot',
    'on their wedding day, medium wide shot',
    'holding hands walking away from camera down a path',
    'couple cutting wedding cake together, shot from guest perspective',
  ],
  user_birthday: [
    'family gathered around a birthday cake, shot from corner of the room',
    'opening presents on the living room floor, medium wide shot',
    'birthday party with hats and decorations, wide angle',
    'backyard celebration with family, shot from across the yard',
    'kitchen scene with cake and candles, shot through doorway',
  ],
}

// Default people count by event
const defaultPeopleCount: Record<string, string> = {
  birthday: 'solo',
  passing_anniversary: 'two',
  wedding_anniversary: 'two',
  user_birthday: 'two',
}

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function parseAgeRange(ageRange: string): number {
  // "20s" -> 25, "40s" -> 45, etc.
  const decade = parseInt(ageRange.replace('s', ''))
  return decade + 5
}

function calculateAgeInPhoto(recipientAgeNow: number, timePeriod: string): number | null {
  const birthYear = 2026 - recipientAgeNow
  const photoYear = parseInt(timePeriod.slice(0, 4)) + 5 // middle of decade
  const ageInPhoto = photoYear - birthYear
  if (ageInPhoto < 0) return null // Not born yet
  return ageInPhoto
}

function getDeceasedDescriptionForEra(relationship: string, timePeriod: string): string {
  const currentYear = 2026
  const photoYear = parseInt(timePeriod.slice(0, 4)) + 5 // middle of decade
  const yearsAgo = currentYear - photoYear
  
  const isFemale = /mother|grandmother|aunt|sister|daughter/i.test(relationship)
  const gender = isFemale ? 'woman' : 'man'
  
  // Grandparents: elderly now, but younger in past photos
  if (/grandmother|grandfather/i.test(relationship)) {
    if (yearsAgo > 40) return `middle-aged ${gender} in their 40s-50s, warm and loving`
    if (yearsAgo > 25) return `${gender} in their 50s-60s, warm smile, loving presence`
    if (yearsAgo > 10) return `older ${gender} in their 60s-70s, grandmotherly/grandfatherly warmth`
    return `elderly ${gender}, warm smile, soft features`
  }
  
  // Parents: middle-aged now, younger in past
  if (/mother|father/i.test(relationship)) {
    if (yearsAgo > 30) return `young ${gender} in their 20s-30s, youthful energy`
    if (yearsAgo > 15) return `${gender} in their 30s-40s, parental warmth`
    return `middle-aged ${gender}, loving expression`
  }
  
  // Siblings, friends: adjust based on time
  if (/sister|brother|friend/i.test(relationship)) {
    if (yearsAgo > 20) return `young ${gender}, youthful, full of life`
    return `${gender}, warm presence, close bond visible`
  }
  
  // Default fallback
  return deceasedDescription[relationship.toLowerCase()] || `${gender}, warm presence`
}

export function buildPhotoPrompt(
  postType: string,
  relationship: string,
  recipientGender: string,
  recipientAgeRange: string,
  timePeriod: string,
  recipientEthnicity?: string,
  peopleCount: string = 'default'
): string {
  const recipientAgeNow = parseAgeRange(recipientAgeRange)
  const ageInPhoto = calculateAgeInPhoto(recipientAgeNow, timePeriod)
  
  const eraStyle = eraStyling[timePeriod] || eraStyling['1990s']
  const deceased = getDeceasedDescriptionForEra(relationship, timePeriod)
  const inverse = inverseRelationship[relationship.toLowerCase()]
  const genderKey = recipientGender.toLowerCase() as 'male' | 'female'
  const recipientRole = inverse ? inverse[genderKey] : 'family member'
  
  const scenes = sceneBank[postType] || sceneBank['birthday']
  const scene = getRandomItem(scenes)
  
  // Ethnicity hint for family appearance
  const ethnicityHint = recipientEthnicity 
    ? `${recipientEthnicity} family` 
    : 'family'
  
  let peopleDesc = ''
  
  // SPECIAL CASE: Wedding anniversary
  if (postType === 'wedding_anniversary') {
    if (relationship.toLowerCase() === 'spouse') {
      // Recipient WAS the spouse - show the couple
      const isFemaleDeceased = recipientGender.toLowerCase() === 'male' // if recipient is male, deceased spouse was female
      const deceasedGender = isFemaleDeceased ? 'woman' : 'man'
      const recipientGenderWord = isFemaleDeceased ? 'man' : 'woman'
      peopleDesc = `A loving ${recipientEthnicity || ''} couple on their wedding day — a ${deceasedGender} and a ${recipientGenderWord}, groom in suit, bride in white wedding dress, clearly in love`.replace('  ', ' ').trim()
    } else {
      // Recipient is child/grandchild/etc - show deceased + THEIR spouse (not the recipient)
      const isFemaleDeceased = /mother|grandmother|aunt|sister|daughter/i.test(relationship)
      const deceasedRole = isFemaleDeceased ? 'wife' : 'husband'
      const spouseRole = isFemaleDeceased ? 'husband' : 'wife'
      peopleDesc = `A ${recipientEthnicity || ''} man and woman on their wedding day — groom in suit, bride in white wedding dress, clearly in love`.replace('  ', ' ').trim()
    }
  }
  // STANDARD CASES: Birthday, death anniversary, user birthday
  else {
    const recipientWasAlive = ageInPhoto && ageInPhoto > 0
    
    if (!recipientWasAlive) {
      // Recipient not born yet - just show the deceased
      peopleDesc = `A ${deceased}, ${ethnicityHint}`
    } else {
      // Recipient was alive - default to 'two' (show deceased + recipient)
      const count = peopleCount !== 'default' ? peopleCount : 'two'
      
      if (count === 'solo') {
        peopleDesc = `A ${deceased}, ${ethnicityHint}`
      } else if (count === 'two') {
        peopleDesc = `A ${deceased} with their ${recipientRole}, age ${ageInPhoto}, ${ethnicityHint}`
      } else if (count === 'small_group') {
        peopleDesc = `A ${deceased} with their ${recipientRole}, age ${ageInPhoto}, and other family members, ${ethnicityHint}`
      }
    }
  }
  
  return `Authentic vintage photograph from the ${timePeriod}. ${eraStyle}.

${peopleDesc}. ${scene}.

CRITICAL STYLE REQUIREMENTS:
- Shot by a family member, NOT a professional photographer
- Amateur framing — slightly off-center, imperfect composition
- NOT everyone looking at camera — someone caught mid-conversation or looking away
- Real environment clutter — cups, plates, random items on table
- Natural imperfect lighting — shadows, slight overexposure acceptable
- Candid moment, NOT a posed portrait
- Some motion blur acceptable
- This should look like a photo pulled from a shoebox, not a stock photo website

No watermarks. No text overlays. No AI artifacts. No perfect symmetry. No professional studio lighting. Should look like a real amateur photo someone would find in a family album or phone camera roll.

Aspect ratio: 4:3 landscape.`
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE PAST PHOTO PROMPT - Cultural moment-based scenes
// ═══════════════════════════════════════════════════════════════════════════

const LIVE_PAST_SCENES: Record<string, string[]> = {
  song_anniversary: [
    'listening to a radio in the living room',
    'singing along in the kitchen while cooking',
    'listening to music in the car',
    'dancing to music in the living room',
    'playing a record on a turntable',
  ],
  album_anniversary: [
    'holding a vinyl record album in the living room',
    'browsing records at a music store',
    'listening to music on headphones on the couch',
    'playing a cassette tape on a boombox',
    'sitting by a stereo system listening to music',
  ],
  movie_anniversary: [
    'watching TV together in the living room',
    'at a movie theater with popcorn',
    'browsing a video rental store',
    'watching a movie on the couch with blankets',
    'setting up a VHS tape to watch',
  ],
  artist_death: [
    'watching the news on TV in the living room',
    'at a concert in the crowd singing along',
    'listening to music with a poster on the bedroom wall',
    'holding an album and looking at it thoughtfully',
    'singing along to music in the kitchen',
  ],
  holiday: [
    'family gathered around a holiday dinner table',
    'decorating for a holiday celebration',
    'family cooking together in the kitchen',
    'opening gifts together in the living room',
    'family gathering on the porch with drinks',
  ],
  historical: [
    'watching a historic moment on TV together',
    'reading a newspaper at the kitchen table',
    'gathered around a radio listening intently',
    'looking up at the sky together outside',
    'family watching TV news in the living room',
  ],
}

export function buildLivePastPhotoPrompt(
  photoHint: string,
  relationship: string,
  recipientGender: string,
  recipientAgeRange: string,
  timePeriod: string,
  ethnicity?: string,
  peopleOverride?: 'solo' | 'two'
): string {
  const recipientAgeNow = parseAgeRange(recipientAgeRange)
  const ageInPhoto = calculateAgeInPhoto(recipientAgeNow, timePeriod)
  
  // Get era styling (reuse existing map)
  const eraStyle = eraStyling[timePeriod] || eraStyling['1990s']
  
  // Get deceased description for era (reuse existing function)
  const deceased = getDeceasedDescriptionForEra(relationship, timePeriod)
  
  // Get recipient's role relative to deceased
  const inverse = inverseRelationship[relationship.toLowerCase()]
  const genderKey = recipientGender.toLowerCase() as 'male' | 'female'
  const recipientRole = inverse ? inverse[genderKey] : 'family member'
  
  // Use the user-provided photo hint directly
  const scene = photoHint
  
  // Ethnicity hint for family appearance
  const ethnicityHint = ethnicity ? `${ethnicity} family` : 'family'
  
  // Build people description
  let peopleDesc = ''
  
  if (peopleOverride === 'solo') {
    // Forced solo — just the deceased
    peopleDesc = `A ${deceased}, ${ethnicityHint}. Only ONE person in the photo.`
  } else if (peopleOverride === 'two') {
    // Forced two people — deceased + recipient (use current age if not born yet)
    const recipientAge = ageInPhoto && ageInPhoto > 0 ? ageInPhoto : parseInt(recipientAgeRange) || 30
    peopleDesc = `A ${deceased} with their ${recipientRole}, age ${recipientAge}, ${ethnicityHint}. Exactly TWO people in the photo.`
  } else {
    // Auto — use existing birth year logic
    const recipientWasAlive = ageInPhoto && ageInPhoto > 0
    if (!recipientWasAlive) {
      peopleDesc = `A ${deceased}, ${ethnicityHint}. Only ONE person in the photo.`
    } else {
      peopleDesc = `A ${deceased} with their ${recipientRole}, age ${ageInPhoto}, ${ethnicityHint}. Exactly TWO people in the photo.`
    }
  }
  
  return `Authentic vintage photograph from the ${timePeriod}. ${eraStyle}.

${peopleDesc}. ${scene}.

CRITICAL STYLE REQUIREMENTS:
- Shot by a family member, NOT a professional photographer
- Amateur framing — slightly off-center, imperfect composition
- NOT everyone looking at camera — someone caught mid-conversation or looking away
- Natural imperfect lighting — shadows, slight overexposure acceptable
- Candid moment, NOT a posed portrait
- Some motion blur acceptable
- This should look like a photo pulled from a shoebox, not a stock photo website

No watermarks. No text overlays. No AI artifacts. No perfect symmetry. No professional studio lighting. Should look like a real amateur photo someone would find in a family album or phone camera roll.

Aspect ratio: 4:3 landscape.`
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC SELFIE GENERATION - For Slide 1 of social posts
// ═══════════════════════════════════════════════════════════════════════════

export interface SelfieParams {
  age: number
  gender: 'male' | 'female'
  ethnicity: 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed'
  angle: 'from below' | 'straight on' | 'from above' | 'side tilt'
  emotion: 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful'
  gaze: 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side'
  setting: 'home' | 'car' | 'outside' | 'office'
}

export function buildSelfiePrompt(params: SelfieParams): string {
  const { age, gender, ethnicity, angle, emotion, gaze, setting } = params

  const angleMap: Record<SelfieParams['angle'], string> = {
    'from below': 'Shot from slightly below chin level, phone held at arm\'s length',
    'straight on': 'Shot straight on at eye level, phone held at arm\'s length',
    'from above': 'Shot from slightly above, phone angled down toward face',
    'side tilt': 'Shot with phone tilted to the side, slight dutch angle'
  }

  const gazeMap: Record<SelfieParams['gaze'], string> = {
    'looking at camera': 'Looking directly into the camera lens',
    'looking away': 'Looking away from camera, eyes gazing off to the side',
    'eyes down': 'Eyes cast downward, contemplative',
    'looking off to side': 'Eyes shifted to look off-frame'
  }

  const settingMap: Record<SelfieParams['setting'], string> = {
    'home': 'Indoor home setting, warm overhead lighting casting soft shadows, ceiling or wall visible in background',
    'car': 'Inside a car, natural daylight from windows, car interior slightly visible',
    'outside': 'Outdoor setting, natural daylight, trees or sky softly blurred in background',
    'office': 'Indoor office or workspace, neutral lighting, plain wall or window behind'
  }

  return `Casual phone selfie of a ${age}-year-old ${ethnicity} ${gender} with a ${emotion} expression. ${angleMap[angle]}, face fills 70% of frame. ${gazeMap[gaze]}. ${settingMap[setting]}. Messy natural hair, casual plain clothing. Slight motion blur on edges. iPhone front camera quality — not professional, not filtered, not beautified. Visible skin texture, pores, minor imperfections. 9:16 vertical.`
}

