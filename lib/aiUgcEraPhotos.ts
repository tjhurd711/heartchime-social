// ═══════════════════════════════════════════════════════════════════════════
// AI UGC ERA PHOTOS - Age-Based Reference Photo Selection
// ═══════════════════════════════════════════════════════════════════════════
//
// This module provides age-appropriate reference photos for AI UGC personas
// and their loved ones across different eras. Each person has multiple
// reference photos showing them at different ages, allowing us to maintain
// visual consistency when generating photos from different time periods.
//
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PhotoAgeRange {
  file: string
  minAge: number
  maxAge: number
}

type PersonPhotoRanges = Record<string, PhotoAgeRange[]>

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO AGE RANGES
// ═══════════════════════════════════════════════════════════════════════════
//
// For each persona and loved one, define the age ranges for their reference
// photos. The system will select the appropriate photo based on the target
// year and the person's birth year.
//
// ═══════════════════════════════════════════════════════════════════════════

const photoAgeRanges: PersonPhotoRanges = {
  // ═══════════════════════════════════════════════════════════════════════════
  // MIKE (Persona) - Born 1977
  // ═══════════════════════════════════════════════════════════════════════════
  'Mike': [
    { file: 'Mike_1980s.png', minAge: 0, maxAge: 9 },
    { file: 'Mike_1990s.png', minAge: 10, maxAge: 20 },
    { file: 'Mike_2000s.png', minAge: 20, maxAge: 31 },
    { file: 'Mike_2010s.png', minAge: 32, maxAge: 47 },
    { file: 'Mike.jpeg', minAge: 48, maxAge: 999 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MIKE'S DAD (Loved One) - Born 1951, Died 2022
  // ═══════════════════════════════════════════════════════════════════════════
  'Mike-dad': [
    { file: 'Mike-dad_1970s.png', minAge: 0, maxAge: 15 },
    { file: 'Mike-dad_1980s.png', minAge: 16, maxAge: 30 },
    { file: 'Mike-dad_30s.png', minAge: 31, maxAge: 42 },
    { file: 'Mike-dad_1990s.png', minAge: 43, maxAge: 61 },
    { file: 'Mike-dad_2010s.png', minAge: 62, maxAge: 71 },
    { file: 'Mike-dad.png', minAge: 72, maxAge: 999 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LINDA (Persona) - Born 1978
  // ═══════════════════════════════════════════════════════════════════════════
  'Linda': [
    { file: 'Linda_1970s.png', minAge: 0, maxAge: 11 },
    { file: 'Linda_1980s.png', minAge: 12, maxAge: 17 },
    { file: 'Linda_1990s.png', minAge: 18, maxAge: 28 },
    { file: 'Linda_2000s.png', minAge: 29, maxAge: 45 },
    { file: 'Linda.png', minAge: 46, maxAge: 999 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LINDA'S MOM (Loved One) - Born 1950, Died 2018
  // ═══════════════════════════════════════════════════════════════════════════
  'Linda-mom': [
    { file: 'Linda-Mom_1960s.png', minAge: 0, maxAge: 14 },
    { file: 'Linda-Mom_1970s.png', minAge: 15, maxAge: 25 },
    { file: 'Linda-Mom_1980s.png', minAge: 26, maxAge: 34 },
    { file: 'Linda-Mom_2000s.png', minAge: 35, maxAge: 46 },
    { file: 'Linda-Mom_2010.png', minAge: 47, maxAge: 68 },
    { file: 'Linda-mom.png', minAge: 69, maxAge: 999 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // JENNA (Persona) - Born 1998
  // ═══════════════════════════════════════════════════════════════════════════
  'Jenna': [
    { file: 'Jenna_2000s.png', minAge: 0, maxAge: 12 },
    { file: 'Jenna_2010s.png', minAge: 13, maxAge: 23 },
    { file: 'Jenna.png', minAge: 24, maxAge: 999 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // JENNA'S DAD (Loved One) - Born 1965, Died 2018
  // ═══════════════════════════════════════════════════════════════════════════
  'Jennas-Dad': [
    { file: 'Jenna-Dad_1980s.png', minAge: 0, maxAge: 26 },
    { file: 'Jenna-Dad_1990s.png', minAge: 27, maxAge: 38 },
    { file: 'Jenna-Dad_2010s.png', minAge: 39, maxAge: 53 },
    { file: 'Jennas-Dad.jpeg', minAge: 54, maxAge: 999 },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// S3 CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const S3_BUCKET = 'heartbeat-photos-prod'
const S3_REGION = 'us-east-2'
const S3_PREFIX = 'ai-ugc-personas'

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the middle year of an era string (e.g., "1990s" -> 1995)
 */
export function getEraMiddleYear(era: string): number {
  const decade = parseInt(era.slice(0, 4))
  return decade + 5
}

/**
 * Get a specific year from an era (random within the decade)
 */
export function getRandomYearInEra(era: string): number {
  const decade = parseInt(era.slice(0, 4))
  return decade + Math.floor(Math.random() * 10)
}

/**
 * Calculate age given birth year and target year
 */
export function calculateAge(birthYear: number, targetYear: number): number {
  return targetYear - birthYear
}

/**
 * Check if a person was alive in a given year
 */
export function wasAliveInYear(
  birthYear: number,
  deathYear: number | null,
  targetYear: number
): boolean {
  if (targetYear < birthYear) return false
  if (deathYear && targetYear > deathYear) return false
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: getEraPhotoUrl
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the appropriate reference photo URL for a person at a specific year.
 * 
 * @param personName - The name key in photoAgeRanges (e.g., 'Mike', 'Linda-mom')
 * @param birthYear - The person's birth year
 * @param targetYear - The year of the photo we're generating
 * @returns The full S3 URL to the reference photo, or null if person wasn't born
 * 
 * @example
 * // Get photo of Linda at age 8 (1986)
 * getEraPhotoUrl('Linda', 1978, 1986) 
 * // Returns: https://heartbeat-photos-prod.s3.amazonaws.com/ai-ugc-personas/Linda_1980s.png
 * 
 * @example
 * // Get photo of Mike's dad at age 45 (1996)
 * getEraPhotoUrl('Mike-dad', 1951, 1996)
 * // Returns: https://heartbeat-photos-prod.s3.amazonaws.com/ai-ugc-personas/Mike-dad_1990s.png
 */
export function getEraPhotoUrl(
  personName: string,
  birthYear: number,
  targetYear: number
): string | null {
  // Calculate age
  const age = targetYear - birthYear
  
  // Person not born yet
  if (age < 0) {
    console.log(`[aiUgcEraPhotos] ${personName} not born yet in ${targetYear} (birth year: ${birthYear})`)
    return null
  }
  
  // Get the age ranges for this person
  const ranges = photoAgeRanges[personName]
  
  if (!ranges) {
    console.warn(`[aiUgcEraPhotos] No photo ranges defined for "${personName}"`)
    return null
  }
  
  // Find the matching age range
  const matchingRange = ranges.find(range => age >= range.minAge && age <= range.maxAge)
  
  if (!matchingRange) {
    console.warn(`[aiUgcEraPhotos] No matching age range for ${personName} at age ${age}`)
    // Fallback to last range (oldest photos)
    const fallback = ranges[ranges.length - 1]
    if (fallback) {
      const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${S3_PREFIX}/${fallback.file}`
      console.log(`[aiUgcEraPhotos] Using fallback photo for ${personName}: ${url}`)
      return url
    }
    return null
  }
  
  const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${S3_PREFIX}/${matchingRange.file}`
  console.log(`[aiUgcEraPhotos] ${personName} age ${age} in ${targetYear} → ${matchingRange.file}`)
  
  return url
}

/**
 * Get era photo URL using an era string instead of a specific year
 * 
 * @param personName - The name key in photoAgeRanges
 * @param birthYear - The person's birth year
 * @param era - Era string like "1990s", "2000s", etc.
 * @returns The full S3 URL to the reference photo, or null if person wasn't born
 */
export function getEraPhotoUrlFromEra(
  personName: string,
  birthYear: number,
  era: string
): string | null {
  const targetYear = getEraMiddleYear(era)
  return getEraPhotoUrl(personName, birthYear, targetYear)
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Get all available personas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get list of all persona names that have photo ranges defined
 */
export function getAvailablePersonas(): string[] {
  return Object.keys(photoAgeRanges).filter(name => !name.includes('-'))
}

/**
 * Get list of all loved one names that have photo ranges defined
 */
export function getAvailableLovedOnes(): string[] {
  return Object.keys(photoAgeRanges).filter(name => name.includes('-'))
}

/**
 * Check if a person has era photos defined
 */
export function hasEraPhotos(personName: string): boolean {
  return personName in photoAgeRanges
}

/**
 * Get the photo ranges for a person (for debugging/admin display)
 */
export function getPhotoRanges(personName: string): PhotoAgeRange[] | null {
  return photoAgeRanges[personName] || null
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPPING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a persona name from the database to the era photo key
 * This handles variations in naming conventions
 */
export function mapPersonaNameToKey(dbName: string): string | null {
  const normalizedName = dbName.toLowerCase().trim()
  
  // Direct matches (case-insensitive)
  const keys = Object.keys(photoAgeRanges)
  for (const key of keys) {
    if (key.toLowerCase() === normalizedName) {
      return key
    }
  }
  
  // Partial matches
  for (const key of keys) {
    if (key.toLowerCase().startsWith(normalizedName) || normalizedName.startsWith(key.toLowerCase())) {
      return key
    }
  }
  
  return null
}

/**
 * Map a loved one name from the database to the era photo key
 * @param personaName - The persona's name (e.g., "Mike")
 * @param relationship - The relationship (e.g., "dad", "mom", "father", "mother")
 */
export function mapLovedOneToKey(personaName: string, relationship: string): string | null {
  const normalizedRelationship = relationship.toLowerCase().trim()
  
  // Normalize relationship terms
  let relKey = normalizedRelationship
  if (relKey === 'father') relKey = 'dad'
  if (relKey === 'mother') relKey = 'mom'
  if (relKey === 'grandmother') relKey = 'grandma'
  if (relKey === 'grandfather') relKey = 'grandpa'
  
  // Try common patterns (including possessive forms like "Jennas-Dad")
  const patterns = [
    `${personaName}-${relKey}`,
    `${personaName}_${relKey}`,
    `${personaName}${relKey}`,
    `${personaName}s-${relKey}`,  // Possessive: Jennas-Dad
    `${personaName}s_${relKey}`,
  ]
  
  for (const pattern of patterns) {
    if (photoAgeRanges[pattern]) {
      return pattern
    }
    // Case-insensitive check
    const keys = Object.keys(photoAgeRanges)
    for (const key of keys) {
      if (key.toLowerCase() === pattern.toLowerCase()) {
        return key
      }
    }
  }
  
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that both people can appear in a photo together in a given year
 * Returns info about what photo types are possible
 */
export function validateTogetherPhoto(
  personaBirthYear: number,
  lovedOneBirthYear: number,
  lovedOneDeathYear: number | null,
  targetYear: number
): {
  canBeTogetherPhoto: boolean
  personaAge: number
  lovedOneAge: number
  personaBornYet: boolean
  lovedOneAlive: boolean
  suggestedPhotoType: 'together_photo' | 'persona_photo' | 'loved_one_photo' | null
} {
  const personaAge = targetYear - personaBirthYear
  const lovedOneAge = targetYear - lovedOneBirthYear
  
  const personaBornYet = personaAge >= 0
  const lovedOneAlive = lovedOneAge >= 0 && (!lovedOneDeathYear || targetYear <= lovedOneDeathYear)
  
  let suggestedPhotoType: 'together_photo' | 'persona_photo' | 'loved_one_photo' | null = null
  
  if (personaBornYet && lovedOneAlive) {
    suggestedPhotoType = 'together_photo'
  } else if (personaBornYet && !lovedOneAlive) {
    suggestedPhotoType = 'persona_photo'
  } else if (!personaBornYet && lovedOneAlive) {
    suggestedPhotoType = 'loved_one_photo'
  }
  // If neither is available, suggestedPhotoType stays null
  
  return {
    canBeTogetherPhoto: personaBornYet && lovedOneAlive,
    personaAge,
    lovedOneAge,
    personaBornYet,
    lovedOneAlive,
    suggestedPhotoType,
  }
}

