function getStringVariable(variables: Record<string, unknown>, key: string): string {
  const value = variables[key]
  return typeof value === 'string' ? value : ''
}

function buildPhotoBlurDescription(variables: Record<string, unknown>, slideOrder?: number): string {
  const perSlideKey = typeof slideOrder === 'number' ? `photo_blur_level_${slideOrder}` : null
  const rawValue = perSlideKey ? getStringVariable(variables, perSlideKey) : null
  const fallbackRawValue = getStringVariable(variables, 'photo_blur_level')
  const rawLevel = Number.parseInt(rawValue || fallbackRawValue, 10)
  const level = Number.isNaN(rawLevel) ? 1 : Math.min(10, Math.max(1, rawLevel))

  if (level <= 1) {
    return 'Blur level 1/10: mostly clear handheld phone photo, no intentional blur.'
  }

  if (level <= 3) {
    return `Blur level ${level}/10: slight natural softness and minor motion blur on edges.`
  }

  if (level <= 6) {
    return `Blur level ${level}/10: noticeable handheld blur across people and background; avoid tack-sharp edges.`
  }

  if (level <= 8) {
    return `Blur level ${level}/10: strong handheld motion blur and soft focus; faces and clothing should not look crisp.`
  }

  return `Blur level ${level}/10: very strong blur with heavy motion smear; scene still recognizable but no sharp facial detail.`
}

function buildPhotoFilterDescription(variables: Record<string, unknown>): string {
  const filterStyle = getStringVariable(variables, 'photo_filter_style')

  if (!filterStyle || filterStyle === 'none') {
    return ''
  }

  if (filterStyle === 'black_and_white') {
    return 'Filter: black-and-white monochrome with realistic grayscale contrast.'
  }

  if (filterStyle === 'old_timey') {
    return 'Filter: old-timey vintage film with soft sepia, gentle grain, and lightly faded highlights.'
  }

  if (filterStyle === 'faded_film') {
    return 'Filter: faded film look with mild desaturation, warm highlights, soft contrast, and light grain.'
  }

  return ''
}

export function applyPhotoGenerationStyle(
  prompt: string,
  variables: Record<string, unknown>,
  slideOrder?: number
): string {
  if (!prompt.trim()) {
    return prompt
  }

  const filterDescription = buildPhotoFilterDescription(variables)
  const blurDescription = buildPhotoBlurDescription(variables, slideOrder)
  const styleParts = [filterDescription, blurDescription].filter((part) => part.trim().length > 0)

  if (styleParts.length === 0) {
    return prompt
  }

  const styleLock = `STYLE LOCK (high priority): ${styleParts.join(' ')}`
  return `${styleLock}\n\n${prompt}`
}
