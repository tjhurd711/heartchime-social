export type MatchPlatform = 'tiktok' | 'instagram'

export function extractPlatformPostId(platform: MatchPlatform, publishedUrl: string): string | null {
  try {
    const url = new URL(publishedUrl)

    if (platform === 'tiktok') {
      return url.pathname.match(/\/video\/(\d+)/)?.[1] || null
    }

    return url.pathname.match(/\/(?:reel|p)\/([^/?#]+)/)?.[1] || null
  } catch {
    return null
  }
}

export function getPublishedUrlWarnings(
  platform: MatchPlatform,
  publishedUrl: string,
  platformPostId: string | null
): string[] {
  const warnings: string[] = []

  try {
    const url = new URL(publishedUrl)
    const hostname = url.hostname.toLowerCase()

    if (platform === 'tiktok' && !hostname.includes('tiktok.com')) {
      warnings.push('URL does not look like a TikTok link.')
    }

    if (platform === 'instagram' && !hostname.includes('instagram.com')) {
      warnings.push('URL does not look like an Instagram link.')
    }
  } catch {
    warnings.push('URL is not a fully valid URL.')
  }

  if (!platformPostId) {
    warnings.push('Could not extract a platform post ID from the URL.')
  }

  return warnings
}
