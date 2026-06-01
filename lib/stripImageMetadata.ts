import sharp from 'sharp'

// ═══════════════════════════════════════════════════════════════════════════
// STRIP IMAGE METADATA (C2PA / content credentials + EXIF/XMP/ICC)
//
// AI image models (OpenAI gpt-image-2, Google Gemini) embed C2PA provenance
// metadata in their output — a `caBX` JUMBF chunk in PNG, an APP11 marker in
// JPEG. We re-encode every generated image through sharp before it ever lands
// in S3. sharp does NOT carry embedded metadata into its output unless it is
// explicitly told to (via keepMetadata/withMetadata), so the re-encoded bytes
// are clean: no C2PA, no EXIF, no XMP, no ICC.
//
// PNG output is lossless, so this is pixel-for-pixel identical to the input.
// On any failure we fall back to the original buffer so generation is never
// blocked by a strip error.
// ═══════════════════════════════════════════════════════════════════════════

export async function stripImageMetadata(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input).png({ compressionLevel: 9 }).toBuffer()
  } catch (error) {
    console.warn('[strip-metadata] Failed to strip image metadata; using original buffer', error)
    return input
  }
}
