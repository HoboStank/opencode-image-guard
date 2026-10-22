import { describe, expect, test } from "bun:test"
import {
  countImages,
  isImagePart,
  normalizeOptions,
  pruneImages,
} from "../index"

const image = (id: number) => ({
  type: "media",
  media: {
    mediaType: "image/png",
    source: { type: "bytes", data: new Uint8Array([id]), mediaType: "image/png" },
  },
})

const audio = () => ({
  type: "media",
  media: {
    mediaType: "audio/wav",
    source: { type: "base64", data: "AAAA", mediaType: "audio/wav" },
  },
})

const text = (value: string) => ({ type: "text", text: value })
const message = (content: unknown[]) => ({ role: "user", content })

describe("isImagePart", () => {
  test("accepts image media parts", () => {
    expect(isImagePart(image(1))).toBe(true)
    expect(
      isImagePart({ type: "media", media: { mediaType: "IMAGE/JPEG" } }),
    ).toBe(true)
  })

  test("rejects text, audio, and malformed parts", () => {
    expect(isImagePart(text("hello"))).toBe(false)
    expect(isImagePart(audio())).toBe(false)
    expect(isImagePart({ type: "media" })).toBe(false)
    expect(isImagePart(null)).toBe(false)
    expect(isImagePart("image/png")).toBe(false)
  })
})

describe("countImages", () => {
  test("counts only image parts", () => {
    const messages = [
      message([text("before"), image(1), audio()]),
      { role: "assistant", content: [image(2), image(3)] },
      { role: "tool" },
    ]
    expect(countImages(messages)).toBe(3)
  })

  test("tolerates messages without content", () => {
    expect(countImages([{}, { content: null }, { content: "nope" }])).toBe(0)
  })
})

describe("pruneImages", () => {
  test("keeps the newest images and replaces the oldest", () => {
    const messages = Array.from({ length: 39 }, (_, index) =>
      message([text(`shot ${index}`), image(index)]),
    )

    expect(countImages(messages)).toBe(39)
    expect(pruneImages(messages, 24)).toBe(15)
    expect(countImages(messages)).toBe(24)

    const newest = messages[38].content[1] as { type: string }
    expect(newest.type).toBe("media")

    const oldest = messages[0].content[1] as { type: string }
    expect(oldest.type).toBe("text")
  })

  test("preserves message and content shape", () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message([image(index), text(`caption ${index}`)]),
    )

    pruneImages(messages, 10)

    expect(messages).toHaveLength(30)
    expect(messages.every((entry) => entry.content.length === 2)).toBe(true)
  })

  test("does nothing when the request is already under the limit", () => {
    const messages = [message([image(1)]), message([image(2)])]
    expect(pruneImages(messages, 24)).toBe(0)
    expect(countImages(messages)).toBe(2)
  })

  test("handles a single message with too many images", () => {
    const messages = [message(Array.from({ length: 35 }, (_, index) => image(index)))]
    expect(pruneImages(messages, 20)).toBe(15)
    expect(countImages(messages)).toBe(20)
    expect((messages[0].content[34] as { type: string }).type).toBe("media")
    expect((messages[0].content[0] as { type: string }).type).toBe("text")
  })
})

describe("normalizeOptions", () => {
  test("applies defaults", () => {
    expect(normalizeOptions(undefined)).toEqual({
      maxImages: 24,
      providerID: "opencode-go",
      debug: false,
    })
  })

  test("accepts overrides and disables via zero", () => {
    expect(normalizeOptions({ maxImages: "29", providerID: false, debug: true })).toEqual({
      maxImages: 29,
      providerID: false,
      debug: true,
    })
    expect(normalizeOptions({ maxImages: 0 }).maxImages).toBe(0)
  })

  test("ignores invalid values", () => {
    expect(normalizeOptions({ maxImages: Number.NaN }).maxImages).toBe(24)
    expect(normalizeOptions({ maxImages: -5 }).maxImages).toBe(0)
  })
})
