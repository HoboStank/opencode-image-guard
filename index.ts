/**
 * opencode-image-guard
 *
 * Keeps OpenCode model requests under a provider's per-request image limit by
 * replacing the oldest image parts with a short text marker. The persisted
 * session history is never modified; only the outgoing request is pruned.
 *
 * Tested with OpenCode 2.1.2 (V2 plugin API).
 */

const DEFAULT_MAX_IMAGES = 24
const DEFAULT_PROVIDER_ID = "opencode-go"
const OMITTED_TEXT =
  "[an older image was omitted from this request to stay within the model's image limit]"

export type ImageGuardOptions = {
  /** Maximum image parts kept per request. `0` disables the guard. Default: 24. */
  maxImages?: number
  /** Provider to guard. Use `false` to guard every provider. Default: "opencode-go". */
  providerID?: string | false
  /** Log pruning decisions with console.error. Default: false. */
  debug?: boolean
}

type NormalizedOptions = {
  maxImages: number
  providerID: string | false
  debug: boolean
}

type HookEvent = {
  messages?: unknown
}

type HookContext = {
  options?: unknown
  session: {
    hook(
      name: "context" | "compaction" | "title",
      handler: (event: HookEvent) => void,
      options?: { providerID?: string },
    ): Promise<unknown>
  }
}

export function normalizeOptions(input?: unknown): NormalizedOptions {
  const raw = (input && typeof input === "object" ? input : {}) as ImageGuardOptions
  const requested = Number(raw.maxImages)
  const maxImages = Number.isFinite(requested)
    ? Math.max(0, Math.floor(requested))
    : DEFAULT_MAX_IMAGES
  const providerID =
    raw.providerID === false
      ? false
      : typeof raw.providerID === "string" && raw.providerID.trim()
        ? raw.providerID.trim()
        : DEFAULT_PROVIDER_ID

  return { maxImages, providerID, debug: raw.debug === true }
}

/** True when a message content part is an image carried as a `media` part. */
export function isImagePart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false
  const candidate = part as { type?: unknown; media?: { mediaType?: unknown } }
  if (candidate.type !== "media") return false
  return (
    typeof candidate.media?.mediaType === "string" &&
    candidate.media.mediaType.toLowerCase().startsWith("image/")
  )
}

/** Count image parts across a message list. */
export function countImages(messages: readonly unknown[]): number {
  let count = 0
  for (const message of messages) {
    const content = (message as { content?: unknown } | null)?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (isImagePart(part)) count++
    }
  }
  return count
}

/**
 * Keep the newest `maxImages` image parts and replace older ones with a text
 * marker. Walks from newest to oldest so the images closest to the current
 * turn always survive. Returns the number of image parts replaced.
 */
export function pruneImages(messages: any[], maxImages: number): number {
  let kept = 0
  let removed = 0

  for (let m = messages.length - 1; m >= 0; m--) {
    const content = messages[m]?.content
    if (!Array.isArray(content)) continue

    for (let i = content.length - 1; i >= 0; i--) {
      if (!isImagePart(content[i])) continue
      kept++
      if (kept <= maxImages) continue

      content.splice(i, 1, { type: "text", text: OMITTED_TEXT })
      removed++
    }
  }

  return removed
}

export default {
  id: "image-guard",
  async setup(ctx: HookContext) {
    const options = normalizeOptions(ctx.options)
    if (options.maxImages === 0) return

    const log = (message: string) => {
      if (options.debug) console.error(`[image-guard] ${message}`)
    }

    const handler = (event: HookEvent) => {
      try {
        const messages = event?.messages
        if (!Array.isArray(messages)) return

        const before = countImages(messages)
        if (before <= options.maxImages) return

        const removed = pruneImages(messages, options.maxImages)
        if (removed > 0) {
          log(
            `request had ${before} images; replaced ${removed}, kept ${before - removed} (max ${options.maxImages})`,
          )
        }
      } catch (error) {
        // A pruning failure must never block the model request.
        log(`pruning failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const scope = options.providerID ? { providerID: options.providerID } : undefined

    // Compaction and title requests replay the transcript too, so they can hit
    // the same provider wall. Guard every model request OpenCode assembles.
    await ctx.session.hook("context", handler, scope)
    await ctx.session.hook("compaction", handler, scope)
    await ctx.session.hook("title", handler, scope)

    log(`registered maxImages=${options.maxImages} providerID=${options.providerID || "all"}`)
  },
}
