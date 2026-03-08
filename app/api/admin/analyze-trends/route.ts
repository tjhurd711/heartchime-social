import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ===========================================
// CONFIG
// ===========================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ===========================================
// GOOGLE TRENDS SCRAPING
// ===========================================

interface GoogleTrend {
  keyword: string
  traffic_estimate: string
  related_topics: string[]
  google_trends_url: string
}

async function fetchGoogleTrends(): Promise<GoogleTrend[]> {
  try {
    // Fetch from Google Trends RSS feed (updated URL as of 2024)
    // Old URL was: https://trends.google.com/trends/trendingsearches/daily/rss?geo=US
    // New URL is: https://trends.google.com/trending/rss?geo=US
    const response = await fetch(
      'https://trends.google.com/trending/rss?geo=US',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    )

    if (!response.ok) {
      console.log(`Google Trends RSS returned ${response.status}, using alternative method`)
      return await fetchTrendsAlternative()
    }

    const xmlText = await response.text()
    console.log(`[analyze-trends] RSS response length: ${xmlText.length} chars`)
    
    // Parse RSS XML to extract trends
    const trends: GoogleTrend[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    // Updated regex - titles are NOT in CDATA in the new format
    const titleRegex = /<title>([^<]+)<\/title>/
    const trafficRegex = /<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/
    const newsItemRegex = /<ht:news_item_title>([^<]+)<\/ht:news_item_title>/g

    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1]
      
      const titleMatch = titleRegex.exec(itemContent)
      const trafficMatch = trafficRegex.exec(itemContent)
      
      if (titleMatch) {
        const keyword = titleMatch[1].trim()
        // Skip the channel title
        if (keyword === 'Daily Search Trends') continue
        
        const relatedTopics: string[] = []
        
        let newsMatch
        while ((newsMatch = newsItemRegex.exec(itemContent)) !== null) {
          // Decode HTML entities
          const topic = newsMatch[1]
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
          relatedTopics.push(topic)
        }

        trends.push({
          keyword,
          traffic_estimate: trafficMatch ? trafficMatch[1] : 'Unknown',
          related_topics: relatedTopics.slice(0, 5),
          google_trends_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=US`,
        })
      }
    }

    console.log(`[analyze-trends] Parsed ${trends.length} trends from RSS`)
    return trends.slice(0, 20) // Top 20 trends
  } catch (error) {
    console.error('Error fetching Google Trends:', error)
    return await fetchTrendsAlternative()
  }
}

async function fetchTrendsAlternative(): Promise<GoogleTrend[]> {
  // Fallback: Try different Google Trends endpoints or regions
  console.log('[analyze-trends] Trying alternative fetch methods...')
  
  // Try different regions as fallback
  const regions = ['US', 'GB', 'CA']
  
  for (const region of regions) {
    try {
      const response = await fetch(
        `https://trends.google.com/trending/rss?geo=${region}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
        }
      )

      if (response.ok) {
        const xmlText = await response.text()
        const trends: GoogleTrend[] = []
        
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        const titleRegex = /<title>([^<]+)<\/title>/
        const trafficRegex = /<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/
        const newsItemRegex = /<ht:news_item_title>([^<]+)<\/ht:news_item_title>/g

        let match
        while ((match = itemRegex.exec(xmlText)) !== null) {
          const itemContent = match[1]
          const titleMatch = titleRegex.exec(itemContent)
          const trafficMatch = trafficRegex.exec(itemContent)
          
          if (titleMatch) {
            const keyword = titleMatch[1].trim()
            if (keyword === 'Daily Search Trends') continue
            
            const relatedTopics: string[] = []
            let newsMatch
            while ((newsMatch = newsItemRegex.exec(itemContent)) !== null) {
              const topic = newsMatch[1]
                .replace(/&apos;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
              relatedTopics.push(topic)
            }

            trends.push({
              keyword,
              traffic_estimate: trafficMatch ? trafficMatch[1] : 'Unknown',
              related_topics: relatedTopics.slice(0, 5),
              google_trends_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=${region}`,
            })
          }
        }
        
        if (trends.length > 0) {
          console.log(`[analyze-trends] Alternative fetch got ${trends.length} trends from ${region}`)
          return trends.slice(0, 20)
        }
      }
    } catch (error) {
      console.error(`Alternative fetch for ${region} failed:`, error)
    }
  }

  console.log('[analyze-trends] All fetch methods failed, returning empty')
  return []
}

// ===========================================
// CLAUDE ANALYSIS
// ===========================================

interface TrendAnalysis {
  keyword: string
  why_trending: string
  heartchime_fit: 'good' | 'maybe' | 'skip'
  fit_reasoning: string
  suggested_angle: string | null
}

async function analyzeTrendsWithClaude(trends: GoogleTrend[]): Promise<TrendAnalysis[]> {
  if (trends.length === 0) {
    return []
  }

  const trendsText = trends.map((t, i) => 
    `${i + 1}. "${t.keyword}" (${t.traffic_estimate} searches)${t.related_topics.length > 0 ? `\n   Related: ${t.related_topics.join(', ')}` : ''}`
  ).join('\n')

  const prompt = `You are analyzing trending topics for HeartChime, an app that helps people remember and honor deceased loved ones through personalized daily messages, photos, and memories.

HeartChime's social media content typically features:
- Memorial-style posts honoring loved ones
- Nostalgia and throwback content
- Grief support and community
- Celebrity deaths and anniversaries
- Music, movies, and cultural moments from the past
- Family/generational themes

Analyze these trending topics and determine if they could work for HeartChime social content:

${trendsText}

For EACH trend, provide:
1. A brief explanation of why it's trending (1-2 sentences)
2. HeartChime fit: "good" (directly relevant), "maybe" (could work with creative angle), or "skip" (not relevant)
3. Your reasoning for the fit assessment (1 sentence)
4. If good/maybe: A suggested content angle for HeartChime (null if skip)

IMPORTANT:
- "good" fits include: celebrity deaths, memorial events, nostalgic topics, music/movie anniversaries, grief-related news, family themes
- "maybe" fits include: topics that could tie to memories/loss with a creative angle
- "skip" fits include: political news, sports scores, tech releases, product launches, anything that can't meaningfully connect to memory/loss

Respond in JSON format:
{
  "analyses": [
    {
      "keyword": "exact keyword from input",
      "why_trending": "brief explanation",
      "heartchime_fit": "good" | "maybe" | "skip",
      "fit_reasoning": "why this fits or doesn't fit",
      "suggested_angle": "content angle or null"
    }
  ]
}

Only return the JSON, no other text.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        { role: 'user', content: prompt }
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    return parsed.analyses || []
  } catch (error) {
    console.error('Error analyzing trends with Claude:', error)
    throw error
  }
}

// ===========================================
// MAIN HANDLER
// ===========================================

export async function POST() {
  try {
    console.log('[analyze-trends] Starting trend analysis...')

    // Step 1: Fetch trending topics from Google Trends
    const googleTrends = await fetchGoogleTrends()
    console.log(`[analyze-trends] Fetched ${googleTrends.length} trends from Google`)

    if (googleTrends.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trends available at this time. Try again later.',
        trends: [],
      })
    }

    // Step 2: Analyze with Claude
    const analyses = await analyzeTrendsWithClaude(googleTrends)
    console.log(`[analyze-trends] Claude analyzed ${analyses.length} trends`)

    // Step 3: Create a batch ID for this analysis run (UUID format)
    const batchId = crypto.randomUUID()
    const trendingDate = new Date().toISOString().split('T')[0]

    // Step 4: Store results in Supabase
    const trendsToInsert = analyses.map((analysis, index) => {
      const googleTrend = googleTrends.find(g => g.keyword === analysis.keyword) || googleTrends[index]
      
      return {
        keyword: analysis.keyword,
        why_trending: analysis.why_trending,
        heartchime_fit: analysis.heartchime_fit,
        fit_reasoning: analysis.fit_reasoning,
        suggested_angle: analysis.suggested_angle,
        google_trends_url: googleTrend?.google_trends_url || null,
        related_topics: googleTrend?.related_topics || null,
        traffic_estimate: googleTrend?.traffic_estimate || null,
        trending_date: trendingDate,
        batch_id: batchId,
      }
    })

    // Delete old trends from the same day (to avoid duplicates)
    await supabase
      .from('trends')
      .delete()
      .eq('trending_date', trendingDate)

    // Insert new trends
    const { error: insertError } = await supabase
      .from('trends')
      .insert(trendsToInsert)

    if (insertError) {
      console.error('[analyze-trends] Error inserting trends:', insertError)
      throw insertError
    }

    console.log(`[analyze-trends] Stored ${trendsToInsert.length} trends in database`)

    // Step 5: Clean up old trends (keep last 7 days) - optional, ignore errors
    try {
      const { error: cleanupError } = await supabase.rpc('cleanup_old_trends')
      if (cleanupError) {
        console.log('[analyze-trends] cleanup_old_trends not available:', cleanupError.message)
      }
    } catch {
      console.log('[analyze-trends] cleanup_old_trends function not available')
    }

    return NextResponse.json({
      success: true,
      message: `Analyzed ${trendsToInsert.length} trends`,
      trends: trendsToInsert,
      stats: {
        good: trendsToInsert.filter(t => t.heartchime_fit === 'good').length,
        maybe: trendsToInsert.filter(t => t.heartchime_fit === 'maybe').length,
        skip: trendsToInsert.filter(t => t.heartchime_fit === 'skip').length,
      },
    })
  } catch (error) {
    console.error('[analyze-trends] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze trends' },
      { status: 500 }
    )
  }
}

// GET handler to fetch current trends without running new analysis
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('trends_dashboard')
      .select('*')
      .order('trending_date', { ascending: false })
      .order('fit_order', { ascending: true })
      .limit(50)

    if (error) throw error

    return NextResponse.json({
      success: true,
      trends: data || [],
    })
  } catch (error) {
    console.error('[analyze-trends] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch trends' },
      { status: 500 }
    )
  }
}

