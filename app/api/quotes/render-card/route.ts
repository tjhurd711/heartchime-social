import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { readFileSync } from 'fs'
import path from 'path'
import { createElement, type CSSProperties, type ReactElement } from 'react'
import { s3Client } from '@/lib/s3'
import { generateAndUploadTextArtifact } from '@/lib/openaiImageGen'

export const runtime = 'nodejs'
export const maxDuration = 120

type ArtifactFormat =
  | 'book_page'
  | 'highlighted_book'
  | 'tweet'
  | 'typed_note'
  | 'handwritten'
  | 'book_page_photo'

type OgTheme = 'classic' | 'elegant' | 'moody' | 'vintage'

interface RenderCardRequest {
  format?: ArtifactFormat
  ogTheme?: OgTheme
  floralAccent?: boolean
  overlayDesign?:
    | 'none'
    | 'windchime'
    | 'olivebranch'
    | 'coffee'
    | 'moonphases'
    | 'candle'
    | 'whitecandle'
    | 'goldcandle'
    | 'blackcandle'
    | 'blackolive'
    | 'whiteolive'
    | 'goldenolive'
    | 'blackmoons'
    | 'whitemoons'
    | 'goldmoons'
    | 'goldchimes'
    | 'whitewindchimes'
    | 'blackwindchimes'
    | 'goldcoffee'
    | 'whitecoffee'
    | 'blackcoffee'
  quote?: string
  attribution?: string
  highlightText?: string
  styleDetails?: string
  jobId?: string
}

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1920

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer)
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

function loadFontFromPublic(fileName: string): ArrayBuffer {
  const fontPath = path.join(process.cwd(), 'public/fonts', fileName)
  return toArrayBuffer(readFileSync(fontPath))
}

function parseS3KeyFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) || null
  } catch {
    return null
  }
}

async function presignGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 86400 }
  )
}

function firstSentence(value: string): string {
  const sentenceMatch = value.match(/[^.!?]+[.!?]?/)
  return (sentenceMatch?.[0] || value).trim()
}

function stripEnclosingQuotes(value: string): string {
  let next = value.trim()
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ]

  let changed = true
  while (changed && next.length >= 2) {
    changed = false
    for (const [open, close] of quotePairs) {
      if (next.startsWith(open) && next.endsWith(close)) {
        next = next.slice(open.length, next.length - close.length).trim()
        changed = true
      }
    }
  }

  return next
}

function splitHighlight(
  quote: string,
  requestedHighlight?: string
): { before: string; highlighted: string; after: string } {
  const target = (requestedHighlight || firstSentence(quote)).trim()
  if (!target) {
    return { before: quote, highlighted: '', after: '' }
  }

  const lowerQuote = quote.toLowerCase()
  const lowerTarget = target.toLowerCase()
  const index = lowerQuote.indexOf(lowerTarget)

  if (index === -1) {
    return { before: quote, highlighted: '', after: '' }
  }

  return {
    before: quote.slice(0, index),
    highlighted: quote.slice(index, index + target.length),
    after: quote.slice(index + target.length),
  }
}

function parseTweetIdentity(attribution: string | undefined): { displayName: string; handle: string } {
  const fallback = { displayName: 'Mara Ellison', handle: '@mara_ellison77' }
  const raw = attribution?.trim()
  if (!raw) return fallback

  const handleMatch = raw.match(/@([a-zA-Z0-9_]{2,30})/)
  const handle = handleMatch ? `@${handleMatch[1]}` : `@${raw.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 15) || 'memorynotes'}`
  const displayName = raw
    .replace(/\(?.*?@([a-zA-Z0-9_]{2,30}).*?\)?/, '')
    .replace(/[-|].*$/, '')
    .trim() || fallback.displayName

  return { displayName, handle }
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'MN'
}

function getBookTheme(theme: OgTheme) {
  if (theme === 'elegant') {
    return {
      rootBackground: '#f4ece0',
      pageBackground: '#fdf9f1',
      border: 'rgba(60, 50, 32, 0.14)',
      text: '#2a2117',
      attribution: '#4a3f31',
      pageNumber: 'rgba(42,33,23,0.5)',
      shadow: '0 16px 34px rgba(24, 16, 7, 0.16)',
      flower: 'rgba(141, 108, 49, 0.28)',
      mark: 'rgba(255, 223, 130, 0.72)',
    }
  }
  if (theme === 'moody') {
    return {
      rootBackground: '#22211f',
      pageBackground: '#2c2a26',
      border: 'rgba(255, 245, 220, 0.12)',
      text: '#efe4cf',
      attribution: '#d8c8ac',
      pageNumber: 'rgba(239,228,207,0.45)',
      shadow: '0 16px 36px rgba(0, 0, 0, 0.38)',
      flower: 'rgba(255, 225, 170, 0.24)',
      mark: 'rgba(166, 132, 59, 0.7)',
    }
  }
  if (theme === 'vintage') {
    return {
      rootBackground: '#e8ddc9',
      pageBackground: '#f3ead6',
      border: 'rgba(92, 70, 44, 0.2)',
      text: '#2f2519',
      attribution: '#4e3e2a',
      pageNumber: 'rgba(47,37,25,0.45)',
      shadow: '0 14px 30px rgba(58, 41, 18, 0.2)',
      flower: 'rgba(126, 89, 38, 0.28)',
      mark: 'rgba(236, 208, 122, 0.72)',
    }
  }

  return {
    rootBackground: '#f5f0e7',
    pageBackground: '#fbf8f1',
    border: 'rgba(30, 28, 25, 0.08)',
    text: '#131313',
    attribution: '#343434',
    pageNumber: 'rgba(20,20,20,0.5)',
    shadow: '0 14px 30px rgba(0,0,0,0.1)',
    flower: 'rgba(107, 88, 59, 0.24)',
    mark: 'rgba(255, 231, 112, 0.72)',
  }
}

function floralOrnaments(color: string): ReactElement[] {
  const cornerBase: CSSProperties = {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 24,
    display: 'flex',
  }
  const stroke = `2px solid ${color}`
  const lineBase: CSSProperties = {
    position: 'absolute',
    backgroundColor: color,
    opacity: 0.9,
  }
  const petalBase: CSSProperties = {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: color,
    opacity: 0.85,
  }

  return [
    createElement(
      'div',
      {
        key: 'floral-top-left',
        style: {
          ...cornerBase,
          top: 24,
          left: 26,
          borderTop: stroke,
          borderLeft: stroke,
        },
      },
      createElement('div', { style: { ...lineBase, top: 18, left: 18, width: 48, height: 2 } }),
      createElement('div', { style: { ...lineBase, top: 18, left: 18, width: 2, height: 48 } }),
      createElement('div', { style: { ...petalBase, top: 10, left: 10 } }),
      createElement('div', { style: { ...petalBase, top: 26, left: 26, width: 10, height: 10, opacity: 0.72 } })
    ),
    createElement(
      'div',
      {
        key: 'floral-bottom-right',
        style: {
          ...cornerBase,
          bottom: 24,
          right: 26,
          borderBottom: stroke,
          borderRight: stroke,
        },
      },
      createElement('div', { style: { ...lineBase, bottom: 18, right: 18, width: 48, height: 2 } }),
      createElement('div', { style: { ...lineBase, bottom: 18, right: 18, width: 2, height: 48 } }),
      createElement('div', { style: { ...petalBase, bottom: 10, right: 10 } }),
      createElement('div', { style: { ...petalBase, bottom: 26, right: 26, width: 10, height: 10, opacity: 0.72 } })
    ),
    createElement(
      'div',
      {
        key: 'floral-top-divider',
        style: {
          position: 'absolute',
          top: 42,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 180,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        },
      },
      createElement('div', { style: { ...lineBase, position: 'relative', width: 60, height: 2 } }),
      createElement('div', { style: { width: 8, height: 8, backgroundColor: color, transform: 'rotate(45deg)' } }),
      createElement('div', { style: { ...lineBase, position: 'relative', width: 60, height: 2 } })
    ),
  ]
}

function overlayDesignFileName(
  design:
    | 'none'
    | 'windchime'
    | 'olivebranch'
    | 'coffee'
    | 'moonphases'
    | 'candle'
    | 'whitecandle'
    | 'goldcandle'
    | 'blackcandle'
    | 'blackolive'
    | 'whiteolive'
    | 'goldenolive'
    | 'blackmoons'
    | 'whitemoons'
    | 'goldmoons'
    | 'goldchimes'
    | 'whitewindchimes'
    | 'blackwindchimes'
    | 'goldcoffee'
    | 'whitecoffee'
    | 'blackcoffee'
    | undefined
): string | null {
  if (!design || design === 'none') return null
  if (design === 'windchime') return 'windchime.png'
  if (design === 'olivebranch') return 'olivebranch.png'
  if (design === 'coffee') return 'coffee.png'
  if (design === 'moonphases') return 'moonphases.png'
  if (design === 'candle') return 'candle.png'
  if (design === 'whitecandle') return 'whitecandle.png'
  if (design === 'goldcandle') return 'goldcandle.png'
  if (design === 'blackcandle') return 'blackcandle.png'
  if (design === 'blackolive') return 'blackolive.png'
  if (design === 'whiteolive') return 'whiteolive.png'
  if (design === 'goldenolive') return 'goldenolive.png'
  if (design === 'blackmoons') return 'blackmoons.png'
  if (design === 'whitemoons') return 'whitemoons.png'
  if (design === 'goldmoons') return 'goldmoons.png'
  if (design === 'goldchimes') return 'goldchimes.png'
  if (design === 'whitewindchimes') return 'whitewindchimes.png'
  if (design === 'blackwindchimes') return 'blackwindchimes.png'
  if (design === 'goldcoffee') return 'goldcoffee.png'
  if (design === 'whitecoffee') return 'whitecoffee.png'
  if (design === 'blackcoffee') return 'blackcoffee.png'
  return null
}

function renderBookPage(
  quote: string,
  attribution: string | undefined,
  options: { ogTheme: OgTheme; floralAccent: boolean; overlayImageUrl?: string }
): ReactElement {
  const quoteBody = stripEnclosingQuotes(quote)
  const theme = getBookTheme(options.ogTheme)
  const rootStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    backgroundColor: theme.rootBackground,
    padding: '150px 120px 110px 120px',
    justifyContent: 'center',
    position: 'relative',
  }
  const pageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.pageBackground,
    padding: '140px 110px 120px 110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: theme.shadow,
    position: 'relative',
  }
  const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 36,
  }
  const quoteStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: 'EB Garamond',
    fontSize: 56,
    lineHeight: 1.42,
    color: theme.text,
    textAlign: 'justify',
    letterSpacing: '0.002em',
  }
  const attributionStyle: CSSProperties = {
    fontFamily: 'EB Garamond',
    fontSize: 34,
    fontStyle: 'italic',
    color: theme.attribution,
    textAlign: 'left',
  }
  const pageNumberStyle: CSSProperties = {
    fontFamily: 'EB Garamond',
    fontSize: 24,
    color: theme.pageNumber,
    textAlign: 'center',
  }

  const bodyChildren: Array<ReactElement | null> = [
    createElement('div', { key: 'quote', style: quoteStyle }, `"${quoteBody}"`),
    attribution
      ? createElement('div', { key: 'attribution', style: attributionStyle }, `— ${attribution}`)
      : null,
  ]
  const pageChildren: ReactElement[] = [
    createElement('div', { key: 'body', style: bodyStyle }, ...bodyChildren),
    createElement('div', { key: 'page-num', style: pageNumberStyle }, '127'),
  ]
  if (options.overlayImageUrl) {
    pageChildren.push(
      createElement(
        'div',
        {
          key: 'bottom-overlay-wrap',
          style: {
            position: 'absolute',
            left: 100,
            right: 100,
            bottom: 84,
            height: '46%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            pointerEvents: 'none',
          },
        },
        createElement('img', {
          src: options.overlayImageUrl,
          alt: 'Bottom design overlay',
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center bottom',
          },
        })
      )
    )
  }
  if (options.floralAccent) {
    pageChildren.push(...floralOrnaments(theme.flower))
  }

  return createElement(
    'div',
    { style: rootStyle },
    createElement('div', { style: pageStyle }, ...pageChildren)
  )
}

function renderHighlightedBook(
  quote: string,
  attribution: string | undefined,
  highlightText: string | undefined,
  options: { ogTheme: OgTheme; floralAccent: boolean; overlayImageUrl?: string }
): ReactElement {
  const quoteBody = stripEnclosingQuotes(quote)
  const sections = splitHighlight(quoteBody, highlightText)
  const theme = getBookTheme(options.ogTheme)
  const quoteStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: 'EB Garamond',
    fontSize: 56,
    lineHeight: 1.42,
    color: theme.text,
    textAlign: 'justify',
    letterSpacing: '0.002em',
  }
  const markStyle: CSSProperties = {
    backgroundColor: theme.mark,
    borderRadius: 6,
    padding: '0 4px',
  }

  const quoteNode = sections.highlighted
    ? createElement(
        'div',
        { style: quoteStyle },
        createElement('span', null, '"'),
        createElement('span', null, sections.before),
        createElement('span', { style: markStyle }, sections.highlighted),
        createElement('span', null, sections.after),
        createElement('span', null, '"')
      )
    : createElement('div', { style: quoteStyle }, `"${quoteBody}"`)

  const rootStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    backgroundColor: theme.rootBackground,
    padding: '150px 120px 110px 120px',
    justifyContent: 'center',
    position: 'relative',
  }
  const pageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.pageBackground,
    padding: '140px 110px 120px 110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: theme.shadow,
    position: 'relative',
  }
  const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 36,
  }
  const attributionStyle: CSSProperties = {
    fontFamily: 'EB Garamond',
    fontSize: 34,
    fontStyle: 'italic',
    color: theme.attribution,
    textAlign: 'left',
  }
  const pageNumberStyle: CSSProperties = {
    fontFamily: 'EB Garamond',
    fontSize: 24,
    color: theme.pageNumber,
    textAlign: 'center',
  }

  const bodyChildren: Array<ReactElement | null> = [
    quoteNode,
    attribution
      ? createElement('div', { key: 'attribution', style: attributionStyle }, `— ${attribution}`)
      : null,
  ]
  const pageChildren: ReactElement[] = [
    createElement('div', { key: 'body', style: bodyStyle }, ...bodyChildren),
    createElement('div', { key: 'page-num', style: pageNumberStyle }, '214'),
  ]
  if (options.overlayImageUrl) {
    pageChildren.push(
      createElement(
        'div',
        {
          key: 'bottom-overlay-wrap',
          style: {
            position: 'absolute',
            left: 100,
            right: 100,
            bottom: 84,
            height: '46%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            pointerEvents: 'none',
          },
        },
        createElement('img', {
          src: options.overlayImageUrl,
          alt: 'Bottom design overlay',
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center bottom',
          },
        })
      )
    )
  }
  if (options.floralAccent) {
    pageChildren.push(...floralOrnaments(theme.flower))
  }

  return createElement(
    'div',
    { style: rootStyle },
    createElement('div', { style: pageStyle }, ...pageChildren)
  )
}

function renderTweet(
  quote: string,
  attribution: string | undefined,
  options: { ogTheme: OgTheme }
): ReactElement {
  const { displayName, handle } = parseTweetIdentity(attribution)
  const avatarInitials = initialsFromName(displayName)
  const isMoody = options.ogTheme === 'moody'
  const isVintage = options.ogTheme === 'vintage'
  const isElegant = options.ogTheme === 'elegant'

  const rootStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isMoody ? '#15181b' : isVintage ? '#e6dcc8' : isElegant ? '#eef1e6' : '#eceff3',
    padding: 80,
  }
  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: 840,
    borderRadius: 30,
    border: isMoody ? '1px solid #2f363d' : isVintage ? '1px solid #c6b79d' : '1px solid #d5dde6',
    backgroundColor: isMoody ? '#1e2328' : isVintage ? '#f8efd9' : isElegant ? '#ffffff' : '#ffffff',
    padding: '36px 34px 26px 34px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow: isMoody ? '0 10px 28px rgba(0,0,0,0.35)' : '0 8px 24px rgba(15,20,25,0.08)',
  }
  const topRowStyle: CSSProperties = {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
  }
  const avatarStyle: CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: isMoody ? '#596779' : '#8f9cb0',
    color: '#ffffff',
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  const nameStyle: CSSProperties = {
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 28,
    color: isMoody ? '#f2f5f8' : '#0f1419',
  }
  const handleStyle: CSSProperties = {
    fontFamily: 'Arial',
    fontSize: 24,
    color: isMoody ? '#9dafbf' : '#536471',
  }
  const quoteStyle: CSSProperties = {
    fontFamily: 'Arial',
    fontSize: 38,
    lineHeight: 1.32,
    color: isMoody ? '#f2f5f8' : '#0f1419',
    letterSpacing: '-0.01em',
    whiteSpace: 'pre-wrap',
  }
  const timestampStyle: CSSProperties = {
    fontFamily: 'Arial',
    fontSize: 22,
    color: isMoody ? '#9dafbf' : '#536471',
  }
  const dividerStyle: CSSProperties = {
    width: '100%',
    height: 1,
    backgroundColor: isMoody ? '#303943' : '#eff3f4',
  }
  const footerStyle: CSSProperties = {
    fontFamily: 'Arial',
    fontSize: 22,
    color: isMoody ? '#9dafbf' : '#536471',
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    paddingRight: 36,
  }

  return createElement(
    'div',
    { style: rootStyle },
    createElement(
      'div',
      { style: cardStyle },
      createElement(
        'div',
        { style: topRowStyle },
        createElement('div', { style: avatarStyle }, avatarInitials),
        createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column' } as CSSProperties },
          createElement('div', { style: nameStyle }, displayName),
          createElement('div', { style: handleStyle }, handle)
        )
      ),
      createElement('div', { style: quoteStyle }, quote),
      createElement('div', { style: timestampStyle }, '7:13 PM · May 26, 2026 · TweetDeck Web App'),
      createElement('div', { style: dividerStyle }),
      createElement(
        'div',
        { style: footerStyle },
        createElement('span', null, 'Reply 23'),
        createElement('span', null, 'Repost 12'),
        createElement('span', null, 'Likes 98'),
        createElement('span', null, 'Share')
      )
    )
  )
}

function renderTypedNote(quote: string, options: { ogTheme: OgTheme }): ReactElement {
  const isMoody = options.ogTheme === 'moody'
  const isVintage = options.ogTheme === 'vintage'
  const isElegant = options.ogTheme === 'elegant'
  const rootStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: isMoody ? '#1b1a19' : isVintage ? '#e7dbc3' : isElegant ? '#f4f0e8' : '#f4efe3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '130px 110px',
  }
  const paperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: isMoody ? '#2f2c28' : isVintage ? '#f0e2c8' : '#faf6eb',
    border: isMoody ? '1px solid rgba(255,245,222,0.18)' : '1px solid rgba(60,50,35,0.16)',
    boxShadow: isMoody ? '0 16px 36px rgba(0,0,0,0.36)' : '0 16px 36px rgba(0,0,0,0.13)',
    padding: '140px 110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  }
  const quoteStyle: CSSProperties = {
    fontFamily: 'Courier Prime',
    fontSize: 44,
    lineHeight: 1.45,
    color: isMoody ? '#eee4cf' : isElegant ? '#2b241c' : '#232323',
    whiteSpace: 'pre-wrap',
    letterSpacing: '0.01em',
  }

  return createElement(
    'div',
    { style: rootStyle },
    createElement(
      'div',
      { style: paperStyle },
      createElement('div', { style: quoteStyle }, quote)
    )
  )
}

function buildOgMarkup(
  format: Exclude<ArtifactFormat, 'handwritten'>,
  quote: string,
  attribution: string | undefined,
  highlightText: string | undefined,
  options: { ogTheme: OgTheme; floralAccent: boolean; overlayImageUrl?: string }
): ReactElement {
  if (format === 'book_page') return renderBookPage(quote, attribution, options)
  if (format === 'highlighted_book') return renderHighlightedBook(quote, attribution, highlightText, options)
  if (format === 'tweet') return renderTweet(quote, attribution, { ogTheme: options.ogTheme })
  return renderTypedNote(quote, { ogTheme: options.ogTheme })
}

async function renderOgPngWithFontFallback(
  format: Exclude<ArtifactFormat, 'handwritten'>,
  quote: string,
  attribution: string | undefined,
  highlightText: string | undefined,
  options: { ogTheme: OgTheme; floralAccent: boolean; overlayImageUrl?: string }
): Promise<Buffer> {
  const markup = buildOgMarkup(format, quote, attribution, highlightText, options)
  try {
    const ebGaramond = loadFontFromPublic('EBGaramond-Regular.ttf')
    const courierPrime = loadFontFromPublic('CourierPrime-Regular.ttf')
    const image = new ImageResponse(markup, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [
        {
          name: 'EB Garamond',
          data: ebGaramond,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Courier Prime',
          data: courierPrime,
          style: 'normal',
          weight: 400,
        },
      ],
    })
    return Buffer.from(await image.arrayBuffer())
  } catch (fontRenderError) {
    console.warn('[quotes/render-card] Custom font render failed, retrying with default fonts:', fontRenderError)
    const fallbackImage = new ImageResponse(markup, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    })
    return Buffer.from(await fallbackImage.arrayBuffer())
  }
}

function trimForHandwriting(quote: string): string {
  const words = quote.split(/\s+/).filter(Boolean)
  return words.length > 22 ? words.slice(0, 22).join(' ') : quote
}

function escapePromptText(value: string): string {
  return value.replace(/"/g, '\\"')
}

async function generateHandwrittenArtifact(quote: string, styleDetails?: string): Promise<string | null> {
  const promptBase =
    'A short handwritten note in blue ink on cream paper, neat cursive, photographed straight-on with soft natural light.'
  const styleLine = styleDetails?.trim()
    ? `Include these visual styling details if possible: ${escapePromptText(styleDetails.trim())}.`
    : ''
  const exactText = `The text reads exactly: "${escapePromptText(quote)}".`
  const constraints = 'No extra words, no logos, no watermarks, no hands, no decorations.'

  const firstAttemptPrompt = `${promptBase} ${styleLine} ${exactText} ${constraints}`
  const firstAttempt = await generateAndUploadTextArtifact(firstAttemptPrompt, {
    timeoutMs: 70000,
    quality: 'medium',
    size: '1024x1536',
  })
  if (firstAttempt) return firstAttempt

  const reducedQuote = trimForHandwriting(quote)
  const secondAttemptPrompt = `${promptBase} ${styleLine} The handwritten text should be only this sentence: "${escapePromptText(reducedQuote)}". ${constraints}`
  return generateAndUploadTextArtifact(secondAttemptPrompt, {
    timeoutMs: 50000,
    quality: 'low',
    size: '1024x1024',
  })
}

async function generateBookPagePhotoArtifact(
  quote: string,
  attribution?: string,
  styleDetails?: string
): Promise<string | null> {
  const quoteBody = trimForHandwriting(stripEnclosingQuotes(quote))
  const attributionLine = attribution?.trim() ? `Include a subtle attribution line: "— ${escapePromptText(attribution.trim())}".` : ''
  const styleLine = styleDetails?.trim()
    ? `Visual styling preference: ${escapePromptText(styleDetails.trim())}.`
    : ''
  const promptBase =
    'A realistic candid phone photo from first-person perspective: someone sitting with an open printed book in their hands, as if they are taking the photo while reading. Slight hand visibility, natural lighting, mild grain, unpolished snapshot look.'
  const exactText =
    `The visible printed text on the book page reads exactly: "${escapePromptText(quoteBody)}". ${attributionLine} ${styleLine}`
  const constraints =
    'No digital overlay text, no app UI, no logos, no watermarks, no extra unrelated words. Vertical composition.'

  const firstAttempt = await generateAndUploadTextArtifact(`${promptBase} ${exactText} ${constraints}`, {
    timeoutMs: 70000,
    quality: 'medium',
    size: '1024x1536',
  })
  if (firstAttempt) return firstAttempt

  return generateAndUploadTextArtifact(`${promptBase} ${exactText} ${constraints}`, {
    timeoutMs: 50000,
    quality: 'low',
    size: '1024x1024',
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RenderCardRequest
    const quote = body.quote?.trim() || ''
    const format = body.format
    const ogTheme = body.ogTheme || 'classic'
    const floralAccent = Boolean(body.floralAccent)
    const overlayDesign = body.overlayDesign || 'none'
    const attribution = body.attribution?.trim()
    const highlightText = body.highlightText?.trim()
    const styleDetails = body.styleDetails?.trim()
    const jobId = body.jobId?.trim() || ''

    if (!quote) {
      return NextResponse.json({ error: 'quote is required' }, { status: 400 })
    }
    if (
      !format ||
      !['book_page', 'highlighted_book', 'tweet', 'typed_note', 'handwritten', 'book_page_photo'].includes(format)
    ) {
      return NextResponse.json(
        { error: 'format must be one of book_page, highlighted_book, tweet, typed_note, handwritten, book_page_photo' },
        { status: 400 }
      )
    }
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }
    if (!['classic', 'elegant', 'moody', 'vintage'].includes(ogTheme)) {
      return NextResponse.json({ error: 'ogTheme must be one of classic, elegant, moody, vintage' }, { status: 400 })
    }
    if (!['none', 'windchime', 'olivebranch', 'coffee', 'moonphases', 'candle', 'whitecandle', 'goldcandle', 'blackcandle', 'blackolive', 'whiteolive', 'goldenolive', 'blackmoons', 'whitemoons', 'goldmoons', 'goldchimes', 'whitewindchimes', 'blackwindchimes', 'goldcoffee', 'whitecoffee', 'blackcoffee'].includes(overlayDesign)) {
      return NextResponse.json(
        { error: 'overlayDesign must be one of none, windchime, olivebranch, coffee, moonphases, candle, whitecandle, goldcandle, blackcandle, blackolive, whiteolive, goldenolive, blackmoons, whitemoons, goldmoons, goldchimes, whitewindchimes, blackwindchimes, goldcoffee, whitecoffee, blackcoffee' },
        { status: 400 }
      )
    }
    if (styleDetails && styleDetails.length > 240) {
      return NextResponse.json({ error: 'styleDetails must be 240 characters or fewer' }, { status: 400 })
    }

    const bucketName = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

    if (format === 'handwritten') {
      const handwrittenQuote = trimForHandwriting(quote)
      const generatedUrl = await generateHandwrittenArtifact(handwrittenQuote, styleDetails)
      if (!generatedUrl) {
        return NextResponse.json(
          { error: 'Failed to generate handwritten card with gpt-image-2 after retries' },
          { status: 502 }
        )
      }

      const key = parseS3KeyFromUrl(generatedUrl)
      if (!key) {
        return NextResponse.json(
          { error: 'Generated handwritten URL did not include a valid S3 key', details: generatedUrl },
          { status: 500 }
        )
      }

      const presignedUrl = await presignGetUrl(bucketName, key)
      return NextResponse.json({ key, url: presignedUrl })
    }

    if (format === 'book_page_photo') {
      const generatedUrl = await generateBookPagePhotoArtifact(quote, attribution, styleDetails)
      if (!generatedUrl) {
        return NextResponse.json(
          { error: 'Failed to generate book page photo card with gpt-image-2 after retries' },
          { status: 502 }
        )
      }

      const key = parseS3KeyFromUrl(generatedUrl)
      if (!key) {
        return NextResponse.json(
          { error: 'Generated book page photo URL did not include a valid S3 key', details: generatedUrl },
          { status: 500 }
        )
      }

      const presignedUrl = await presignGetUrl(bucketName, key)
      return NextResponse.json({ key, url: presignedUrl })
    }

    const overlayFileName = overlayDesignFileName(overlayDesign)
    const overlayImageUrl = overlayFileName
      ? `${request.nextUrl.origin}/quote-overlays/${overlayFileName}`
      : undefined

    const pngBuffer = await renderOgPngWithFontFallback(format, quote, attribution, highlightText, {
      ogTheme,
      floralAccent,
      overlayImageUrl,
    })
    const key = `quote-cards/${jobId}/${uuidv4()}.png`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: pngBuffer,
        ContentType: 'image/png',
      })
    )

    const presignedUrl = await presignGetUrl(bucketName, key)
    return NextResponse.json({ key, url: presignedUrl })
  } catch (error) {
    console.error('[quotes/render-card] Failed to render card:', error)
    return NextResponse.json(
      {
        error: 'Failed to render quote card',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/quotes/render-card',
    method: 'POST',
    body: {
      format: "'book_page' | 'highlighted_book' | 'tweet' | 'typed_note' | 'handwritten' | 'book_page_photo' (required)",
      ogTheme: "'classic' | 'elegant' | 'moody' | 'vintage' (optional, OG formats)",
      floralAccent: 'boolean (optional, book_page/highlighted_book)',
      overlayDesign: "'none' | 'windchime' | 'olivebranch' | 'coffee' | 'moonphases' | 'candle' | 'whitecandle' | 'goldcandle' | 'blackcandle' | 'blackolive' | 'whiteolive' | 'goldenolive' | 'blackmoons' | 'whitemoons' | 'goldmoons' | 'goldchimes' | 'whitewindchimes' | 'blackwindchimes' | 'goldcoffee' | 'whitecoffee' | 'blackcoffee' (optional, book_page/highlighted_book)",
      quote: 'string (required)',
      attribution: 'string (optional)',
      highlightText: 'string (optional, highlighted_book only)',
      styleDetails: 'string (optional, handwritten/book_page_photo only, max 240 chars)',
      jobId: 'string (required)',
    },
  })
}
