export type DecodedText = {
  text: string
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be'
  hadBom: boolean
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const
const UTF16_LE_BOM = [0xff, 0xfe] as const
const UTF16_BE_BOM = [0xfe, 0xff] as const

function startsWithBytes(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((value, index) => bytes[index] === value)
}

function decodeUtf16Be(bytes: Uint8Array) {
  const swapped = new Uint8Array(bytes.length)
  const evenLength = bytes.length - (bytes.length % 2)
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = bytes[index + 1]
    swapped[index + 1] = bytes[index]
  }
  if (bytes.length % 2) swapped[bytes.length - 1] = bytes[bytes.length - 1]
  return new TextDecoder('utf-16le', { fatal: false }).decode(swapped)
}

export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (startsWithBytes(bytes, UTF8_BOM)) {
    return {
      text: new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3)),
      encoding: 'utf-8',
      hadBom: true,
    }
  }

  if (startsWithBytes(bytes, UTF16_LE_BOM)) {
    return {
      text: new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2)),
      encoding: 'utf-16le',
      hadBom: true,
    }
  }

  if (startsWithBytes(bytes, UTF16_BE_BOM)) {
    return {
      text: decodeUtf16Be(bytes.subarray(2)),
      encoding: 'utf-16be',
      hadBom: true,
    }
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
    encoding: 'utf-8',
    hadBom: false,
  }
}
