// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL MEMORY BANK - Curated memories for social caption generation
// ═══════════════════════════════════════════════════════════════════════════
//
// Claude pulls from this bank and lightly remixes (never copies verbatim)
// to create vivid, specific captions that feel personal.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL MEDIA CAPTION BANK (for IG/TikTok post description)
// ═══════════════════════════════════════════════════════════════════════════

const socialCaptionBank = [
  "the memory of the people we loved most should never fade 💛 pinned post for more",
  "some people never really leave us 💛 check our pinned post",
  "they're still with us in the moments that matter 💛 pinned post to learn more",
  "keeping their memory alive, one moment at a time 💛 see pinned post",
  "because the people we love deserve to be remembered 💛 pinned post for more",
]

export function getRandomSocialCaption(): string {
  return socialCaptionBank[Math.floor(Math.random() * socialCaptionBank.length)]
}

// ═══════════════════════════════════════════════════════════════════════════
// BIRTHDAY MEMORY BANK
// ═══════════════════════════════════════════════════════════════════════════

export const birthdayMemoryBank: Record<string, string[]> = {
  grandmother: [
    "The way she'd have your favorite meal ready before you even told her you were coming over",
    "How she'd slip a $20 in your hand and whisper 'don't tell your mother'",
    "The way her house always smelled like something was baking, even when it wasn't",
    "How she remembered every single thing you ever told her, years later",
    "The way she'd hold your face in both hands and just look at you",
    "Her voice on the phone, always a little too loud, always happy to hear from you",
    "How she kept every school photo in a frame, even the bad ones",
    "The way she'd worry about you eating enough, no matter how old you got",
    "How her prayers always included your name, every single night",
    "The way she made holidays feel like the whole world stopped just for family",
    "Her handwriting on birthday cards — shaky but full of love",
    "How she'd stay up waiting for you to get home safe, no matter how late",
    "The way she called you by a nickname no one else was allowed to use",
    "How she made ordinary visits feel like you were the most important person alive",
    "The way she'd tear up just watching you walk through the door"
  ],
  grandfather: [
    "The way he'd wake up at 5am just to make sure you got the best fishing spot",
    "How he could fix anything — the car, the sink, your confidence",
    "The way he'd sit in his chair and just listen, never rushing you",
    "How he shook your hand like you were a grown man even when you were ten",
    "The sound of his truck pulling into the driveway",
    "The way he'd sneak you a piece of candy and put his finger to his lips",
    "How he never bragged, even when he had every reason to",
    "The way he danced with grandma like they were still twenty",
    "His voice telling the same stories you'd heard a hundred times — and you still wanted to hear them again",
    "How he made you feel safe without ever saying a word",
    "The way he'd pat you on the back and say 'I'm proud of you' like it was nothing — but it was everything",
    "How he kept every tool organized like it was sacred",
    "The way he worked with his hands like they knew something his words didn't",
    "How he always had time, even when he didn't",
    "The way he looked at you like you were capable of anything"
  ],
  mother: [
    "The way she knew something was wrong before you even said a word",
    "How she'd stay up late just to hear about your day",
    "The way she made your favorite dinner when she knew you needed it",
    "Her voice singing you to sleep, even when you pretended you were too old for it",
    "How she sacrificed things you didn't even know about until years later",
    "The way she defended you like a lion, even when you were wrong",
    "Her laugh — the real one, when something actually got her",
    "How she always found a way to make it work, no matter how tight things were",
    "The way she looked at old photos of you and got emotional every time",
    "Her hand on your forehead when you were sick, checking for fever",
    "How she remembered every little thing you liked and didn't like",
    "The way she worried — too much, always — because she loved too much",
    "Her hugs that lasted a beat longer than anyone else's",
    "How she'd call just to say she was thinking about you",
    "The way she made home feel like a place you could always come back to"
  ],
  father: [
    "The way he taught you to ride a bike by letting go and believing you'd figure it out",
    "How he showed up to every game, every recital, every small thing that mattered to you",
    "The way he'd work all day and still find energy to throw the ball around with you",
    "His voice telling you to 'shake it off' when you fell down",
    "How he pretended not to cry at your graduation, but you saw it anyway",
    "The way he fixed things around the house on Saturdays like it was a ritual",
    "His terrible jokes that somehow still made you laugh every time",
    "How he made you feel like you could do anything if you worked hard enough",
    "The way he squeezed your shoulder instead of saying 'I love you' — but you knew",
    "His advice that made no sense at 15 but made all the sense at 30",
    "How he always let you win when you were little, and pushed you to earn it when you got older",
    "The way he checked on the house before bed every night like clockwork",
    "His handshake — firm, warm, like a promise",
    "How he said 'drive safe' every time you left, every single time",
    "The way he believed in you louder than you believed in yourself"
  ],
  aunt: [
    "The way she spoiled you just enough to make your mom roll her eyes",
    "How she always remembered your birthday with a card and a call",
    "The way she listened to your drama like it was the most important thing in the world",
    "Her house where the rules were a little looser and the snacks were a little better",
    "How she gave advice that felt different from a parent's — more like a friend's",
    "The way she showed up for every big moment without being asked",
    "Her laugh that could fill up an entire room",
    "How she kept photos of you in her wallet like you were her own",
    "The way she texted you memes she thought you'd like (and she was always right)",
    "Her gift for making you feel seen in a crowded family",
    "How she remembered details about your life that even your parents forgot",
    "The way she defended you in family debates, even the petty ones",
    "Her hugs that smelled like perfume and love",
    "How she treated your friends like they were part of the family",
    "The way she made you feel like you had an extra corner in your corner"
  ],
  uncle: [
    "The way he made you laugh until your stomach hurt at every family gathering",
    "How he always had a twenty for you 'just because'",
    "The way he taught you stuff your dad didn't know how to",
    "His stories that were probably exaggerated but always entertaining",
    "How he remembered what it felt like to be your age when everyone else forgot",
    "The way he showed up with energy and left every room louder than he found it",
    "His bear hugs that nearly knocked the wind out of you",
    "How he never talked down to you, even when you were a kid",
    "The way he took your side in arguments just to stir things up",
    "His talent for turning boring family events into actual fun",
    "How he checked in on you randomly, just to see how you were doing",
    "The way he bragged about you to his friends like you'd won the Nobel Prize",
    "His advice that was half wisdom, half chaos, always memorable",
    "How he made you feel cool just by association",
    "The way he proved that family can be fun, not just obligatory"
  ],
  sister: [
    "The way she knew exactly what you were thinking without you saying a word",
    "How she'd cover for you with mom and dad, no questions asked",
    "The late night talks that went way longer than they should have",
    "Her ability to make you laugh at the worst possible moments",
    "How she remembered every embarrassing thing you ever did — and loved you anyway",
    "The way she'd steal your clothes and somehow look better in them",
    "Her texts that were half roast, half 'I love you'",
    "How she was the only one who truly understood what growing up in that house was like",
    "The way she showed up when things got hard, no explanation needed",
    "Her voice on the other end of the phone when you just needed to vent",
    "How she pushed you to be better while accepting exactly who you were",
    "The way she defended you to anyone, even when you fought like crazy at home",
    "Her laugh — the one that meant you'd really gotten her",
    "How she made big life moments feel less scary because she'd done them first",
    "The way she was your first best friend, even before you knew what that meant"
  ],
  brother: [
    "The way he turned everything into a competition — and made you better because of it",
    "How he had your back in a fight before you even had to ask",
    "The inside jokes no one else would ever understand",
    "His ability to piss you off and make you laugh in the same five minutes",
    "How he pushed you harder than anyone because he knew what you were capable of",
    "The way he looked out for you without ever making a big deal about it",
    "His dumb pranks that were annoying then but are memories now",
    "How he taught you things parents couldn't — or wouldn't",
    "The way he roughhoused with you until someone got hurt, then pretended nothing happened",
    "His loyalty that never wavered, even when you didn't deserve it",
    "How he shared a room, a childhood, a language no one else speaks",
    "The way he gave advice like an older brother, even if he was younger",
    "His presence at the big moments — graduation, wedding, hard days",
    "How he made ordinary days feel less ordinary just by being there",
    "The way he proved that brothers aren't just family — they're teammates for life"
  ],
  spouse: [
    "The way they reached for your hand without even thinking about it",
    "How they knew exactly how you took your coffee after all those years",
    "The way they looked at you across the room like you were still the only one",
    "How they always saved you the good pillow",
    "The way they laughed at your jokes even when they weren't funny",
    "How they knew when you needed space and when you needed them close",
    "The way they danced with you in the kitchen like nobody was watching",
    "How they remembered every little thing that mattered to you",
    "The way they said your name",
    "How they made ordinary days feel like enough",
    "The way they were your home, not just your house",
    "How they chose you, every single day",
    "The way they held you when words weren't enough",
    "How they were your best friend and your favorite person",
    "The way they made forever feel too short"
  ],
  son: [
    "The way he lit up when he saw you",
    "How he tried so hard to make you proud",
    "The way he hugged you like he meant it",
    "How he grew into someone you admired",
    "The way he laughed — you could hear it from anywhere in the house",
    "How he called just to check on you",
    "The way he looked at you like you had all the answers",
    "How he became your friend, not just your child",
    "The way he carried himself with quiet strength",
    "How he never forgot where he came from",
    "The way he made you laugh when you needed it most",
    "How he showed up when it mattered",
    "The way he said 'I love you' before hanging up",
    "How he made you proud in ways he never knew",
    "The way he was yours, and you were his"
  ],
  daughter: [
    "The way she called you just to hear your voice",
    "How she grew into someone you admired",
    "The way she hugged you a little longer every time",
    "How she knew exactly when you needed her",
    "The way she laughed — it could light up any room",
    "How she became your best friend without either of you noticing",
    "The way she looked at you like you hung the moon",
    "How she made you proud every single day",
    "The way she carried your lessons into her own life",
    "How she never forgot the little things",
    "The way she said 'I love you, Mom' or 'I love you, Dad' like it was easy",
    "How she showed up when it mattered most",
    "The way she made ordinary moments feel special",
    "How she was fierce and soft at the same time",
    "The way she was yours, and you were hers"
  ],
  friend: [
    "The way they showed up without being asked",
    "How they knew your story and loved you anyway",
    "The way they made you laugh until you couldn't breathe",
    "How they kept your secrets like they were their own",
    "The way they believed in you when you didn't believe in yourself",
    "How they made time feel like it didn't matter",
    "The way they picked up right where you left off, no matter how long it had been",
    "How they were family you chose",
    "The way they listened — really listened",
    "How they celebrated your wins like they were their own",
    "The way they held space for your grief and your joy",
    "How they made you a better person just by being around",
    "The way they stuck around when others didn't",
    "How they knew you — the real you",
    "The way they proved that some friends are forever"
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - Get a random memory for a relationship
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BUILD BIRTHDAY CAPTION - No Claude needed, uses memory bank directly
// ═══════════════════════════════════════════════════════════════════════════

export function buildBirthdayCaption(relationship: string, nickname: string): string {
  const memory = getRandomMemory(relationship)
  const age = 75 + Math.floor(Math.random() * 14) // 75-88
  
  // Determine pronouns
  const femaleRelationships = ['mother', 'mom', 'grandmother', 'grandma', 'nana', 'nanny', 'aunt', 'sister', 'wife', 'daughter']
  const isFemale = femaleRelationships.some(r => relationship.toLowerCase().includes(r))
  const possessive = isFemale ? 'her' : 'his'
  const object = isFemale ? 'her' : 'him'
  
  // Build the caption directly
  const caption = `Today, ${nickname} would have turned ${age}. ${memory} — ${possessive} memory still lives on with you. Smile a little extra for ${object} today.`
  
  console.log('[buildBirthdayCaption] Built caption:', caption)
  return caption
}

export function getRandomMemory(relationship: string): string {
  console.log('[getRandomMemory] Called with relationship:', relationship)
  const key = relationship.toLowerCase()
  
  // Try to find exact match first
  if (birthdayMemoryBank[key]) {
    const memories = birthdayMemoryBank[key]
    const selected = memories[Math.floor(Math.random() * memories.length)]
    console.log('[getRandomMemory] Found exact match for key:', key)
    console.log('[getRandomMemory] Returning memory:', selected)
    return selected
  }
  
  // Try partial matches (e.g., "grandma" → "grandmother")
  if (key.includes('grandma') || key.includes('nana') || key.includes('nanny') || key.includes('gram')) {
    const memories = birthdayMemoryBank['grandmother']
    const selected = memories[Math.floor(Math.random() * memories.length)]
    console.log('[getRandomMemory] Partial match → grandmother, returning:', selected)
    return selected
  }
  
  if (key.includes('grandpa') || key.includes('papa') || key.includes('pop')) {
    const memories = birthdayMemoryBank['grandfather']
    const selected = memories[Math.floor(Math.random() * memories.length)]
    console.log('[getRandomMemory] Partial match → grandfather, returning:', selected)
    return selected
  }
  
  if (key.includes('mom')) {
    const memories = birthdayMemoryBank['mother']
    const selected = memories[Math.floor(Math.random() * memories.length)]
    console.log('[getRandomMemory] Partial match → mother, returning:', selected)
    return selected
  }
  
  if (key.includes('dad')) {
    const memories = birthdayMemoryBank['father']
    const selected = memories[Math.floor(Math.random() * memories.length)]
    console.log('[getRandomMemory] Partial match → father, returning:', selected)
    return selected
  }
  
  // Default to grandmother if no match
  console.log('[getRandomMemory] No match found, defaulting to grandmother')
  const memories = birthdayMemoryBank['grandmother']
  const selected = memories[Math.floor(Math.random() * memories.length)]
  console.log('[getRandomMemory] Returning default memory:', selected)
  return selected
}

// ═══════════════════════════════════════════════════════════════════════════
// DEATH ANNIVERSARY MEMORY BANK
// ═══════════════════════════════════════════════════════════════════════════

export const deathAnniversaryBank: Record<string, { events: string[], presence: string[], traits: string[] }> = {
  grandmother: {
    events: ["Sunday dinners", "trips to the beach", "holiday baking", "visits to her house", "morning coffee together", "shopping trips", "gardening together", "movie nights", "church together", "summer stays at her place"],
    presence: ["her smile", "her laugh", "her warmth", "her hugs", "the way she lit up a room", "her voice", "her gentle hands", "her eyes"],
    traits: ["her patience", "her kindness", "her cooking", "her stories", "her wisdom", "her faith", "her generosity", "her love"]
  },
  grandfather: {
    events: ["fishing trips", "Saturday mornings", "working in the garage", "watching the game", "road trips", "walks together", "teaching you to drive", "camping trips", "breakfast at the diner", "fixing things together"],
    presence: ["his laugh", "his handshake", "his voice", "his presence", "the way he walked into a room", "his steady hands", "his smile", "his bear hugs"],
    traits: ["his wisdom", "his patience", "his strength", "his stories", "his jokes", "his work ethic", "his integrity", "his quiet love"]
  },
  mother: {
    events: ["bedtime stories", "school pickups", "cooking together", "late night talks", "road trips", "holiday mornings", "movie nights", "shopping trips", "walks around the neighborhood", "her helping with homework"],
    presence: ["her smile", "her laugh", "her hugs", "her voice", "her warmth", "her eyes", "the way she said your name", "her gentle touch"],
    traits: ["her strength", "her love", "her sacrifice", "her advice", "her encouragement", "her cooking", "her faith in you", "her fierce protection"]
  },
  father: {
    events: ["playing catch", "Saturday mornings", "learning to ride a bike", "road trips", "watching the game", "working on the car", "camping trips", "fishing", "teaching you to drive", "breakfast together"],
    presence: ["his laugh", "his handshake", "his voice", "his presence", "his bear hugs", "the way he walked in the door", "his steady hands", "his smile"],
    traits: ["his strength", "his wisdom", "his work ethic", "his patience", "his humor", "his integrity", "his quiet pride", "his protection"]
  },
  aunt: {
    events: ["sleepovers at her house", "shopping trips", "holiday visits", "summer stays", "road trips", "cooking together", "girls' days out", "birthday celebrations", "movie nights", "late night talks"],
    presence: ["her laugh", "her smile", "her hugs", "her energy", "her warmth", "her perfume", "the way she made you feel special", "her voice on the phone"],
    traits: ["her fun spirit", "her generosity", "her advice", "her encouragement", "her style", "her ability to listen", "her spoiling you", "her love"]
  },
  uncle: {
    events: ["family gatherings", "teaching you things", "holidays at his house", "road trips", "watching sports", "cookouts", "fishing trips", "camping", "working on projects", "adventures together"],
    presence: ["his laugh", "his jokes", "his energy", "his bear hugs", "his booming voice", "the way he entered a room", "his smile", "his presence"],
    traits: ["his humor", "his stories", "his generosity", "his fun spirit", "his advice", "his ability to make you laugh", "his loyalty", "his love"]
  },
  sister: {
    events: ["late night talks", "road trips", "holidays together", "shopping trips", "movie nights", "family dinners", "childhood memories", "vacations together", "school days", "shared secrets"],
    presence: ["her laugh", "her smile", "her voice", "her hugs", "her energy", "her eyes", "the way she said your name", "her presence beside you"],
    traits: ["her loyalty", "her honesty", "her humor", "her strength", "her support", "her ability to understand you", "her fierce love", "her encouragement"]
  },
  brother: {
    events: ["playing together", "road trips", "holidays", "watching games", "childhood adventures", "late night talks", "family dinners", "vacations", "competing at everything", "hanging out"],
    presence: ["his laugh", "his voice", "his energy", "his presence", "his smile", "his handshake", "the way he had your back", "his bear hugs"],
    traits: ["his loyalty", "his humor", "his strength", "his protection", "his competitiveness", "his support", "his honesty", "his love"]
  },
  spouse: {
    events: ["your wedding day", "Sunday mornings in bed", "date nights", "road trips together", "cooking dinner together", "holidays at home", "dancing in the kitchen", "lazy weekends", "anniversary dinners", "quiet evenings on the couch"],
    presence: ["their hand in yours", "their laugh", "their voice", "their warmth next to you", "the way they looked at you", "their smell", "their touch", "their presence"],
    traits: ["their love", "their patience", "their humor", "their kindness", "their devotion", "their support", "their partnership", "their friendship"]
  },
  son: {
    events: ["teaching him to ride a bike", "his graduation", "family dinners", "holidays together", "watching him grow up", "his wedding day", "playing catch", "road trips", "his first steps", "bedtime stories"],
    presence: ["his laugh", "his smile", "his voice", "his hugs", "the way he looked at you", "his energy", "his presence", "his eyes"],
    traits: ["his kindness", "his strength", "his humor", "his determination", "his love", "his loyalty", "his heart", "his spirit"]
  },
  daughter: {
    events: ["teaching her to ride a bike", "her graduation", "family dinners", "holidays together", "watching her grow up", "her wedding day", "braiding her hair", "road trips", "her first steps", "bedtime stories"],
    presence: ["her laugh", "her smile", "her voice", "her hugs", "the way she looked at you", "her energy", "her presence", "her eyes"],
    traits: ["her kindness", "her strength", "her humor", "her determination", "her love", "her loyalty", "her heart", "her spirit"]
  },
  friend: {
    events: ["road trips together", "late night talks", "celebrating milestones", "random adventures", "dinners out", "helping each other move", "holidays together", "concerts", "trips to nowhere", "years of inside jokes"],
    presence: ["their laugh", "their voice", "their energy", "their smile", "the way they made you feel", "their presence", "their hugs", "their warmth"],
    traits: ["their loyalty", "their humor", "their honesty", "their support", "their friendship", "their heart", "their generosity", "their love"]
  }
}

function getRandomItem(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DEATH ANNIVERSARY CAPTION - No Claude needed, uses memory bank directly
// ═══════════════════════════════════════════════════════════════════════════

export function buildDeathAnniversaryCaption(
  relationship: string,
  nickname: string
): string {
  const key = relationship.toLowerCase().replace(/\s+/g, '')
  const bank = deathAnniversaryBank[key] || deathAnniversaryBank['grandmother']
  
  const yearsAgo = Math.floor(Math.random() * 5) + 1 // 1-5 years
  const isFemale = /mother|mom|grandmother|grandma|nana|nanny|aunt|sister/i.test(relationship)
  const object = isFemale ? 'her' : 'him'
  const name = nickname.charAt(0).toUpperCase() + nickname.slice(1)
  
  const event = getRandomItem(bank.events)
  const presence = getRandomItem(bank.presence)
  const trait = getRandomItem(bank.traits)
  
  const caption = `${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'} ago today, ${name} left this world. Take today to remember your favorite things about ${object} — ${event}, ${presence}, and ${trait}. Although today is not necessarily to be celebrated, it is to be remembered.`
  
  console.log('[buildDeathAnniversaryCaption] Built caption:', caption)
  return caption
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD WEDDING ANNIVERSARY CAPTION - No Claude needed
// ═══════════════════════════════════════════════════════════════════════════

export function buildWeddingAnniversaryCaption(
  relationship: string,
  nickname: string
): string {
  const yearsAgo = Math.floor(Math.random() * 30) + 30
  
  // Spouse nickname map for older relationships
  const spouseNicknameMap: Record<string, string> = {
    grandmother: 'Grandpa',
    grandfather: 'Grandma',
    mother: 'Dad',
    father: 'Mom',
    aunt: 'Uncle',
    uncle: 'Aunt',
  }
  
  // Random first names for younger relationships
  const maleNames = ['John', 'Robert', 'James', 'William', 'Michael', 'David', 'Richard', 'Thomas']
  const femaleNames = ['Mary', 'Patricia', 'Linda', 'Elizabeth', 'Susan', 'Barbara', 'Margaret', 'Dorothy']
  
  const rel = relationship.toLowerCase()
  let names: string
  
  if (spouseNicknameMap[rel]) {
    // Older relationship - use nickname + derived spouse
    const name = nickname.charAt(0).toUpperCase() + nickname.slice(1)
    const spouse = spouseNicknameMap[rel]
    names = `${name} and ${spouse}`
  } else {
    // Younger relationship (brother, sister, son, daughter, friend, spouse)
    // Use random first names for both
    const isFemale = /sister|daughter/i.test(relationship)
    const maleName = maleNames[Math.floor(Math.random() * maleNames.length)]
    const femaleName = femaleNames[Math.floor(Math.random() * femaleNames.length)]
    names = isFemale ? `${femaleName} and ${maleName}` : `${maleName} and ${femaleName}`
  }
  
  return `On this day, ${yearsAgo} years ago, ${names} said "I do" 💍 — a day that will go down in history. The love they shared, the life they built together, and the family they created. That kind of love doesn't fade.`
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD USER BIRTHDAY CAPTION - No Claude needed, simple fixed template
// ═══════════════════════════════════════════════════════════════════════════

export function buildUserBirthdayCaption(
  relationship: string,
  nickname: string
): string {
  const isFemale = /mother|mom|grandmother|grandma|nana|nanny|aunt|sister|wife|daughter/i.test(relationship)
  const subject = isFemale ? 'She' : 'He'
  const name = nickname.charAt(0).toUpperCase() + nickname.slice(1)
  
  const caption = `Happy birthday 🎂 — let this serve as what would have been a text, call, or birthday wish from ${name}. ${subject} is with you in spirit today and would have wanted you to enjoy your special day!`
  
  console.log('[buildUserBirthdayCaption] Built caption:', caption)
  return caption
}

