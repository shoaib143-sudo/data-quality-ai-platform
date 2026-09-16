import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeTextBytes } from '../lib/profiling/text-decoding.ts'

function utf16Le(text) {
  const body = Buffer.from(text, 'utf16le')
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), body]))
}

function utf16Be(text) {
  const le = Buffer.from(text, 'utf16le')
  const be = Buffer.alloc(le.length)
  for (let index = 0; index < le.length; index += 2) {
    be[index] = le[index + 1]
    be[index + 1] = le[index]
  }
  return new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))
}

test('UTF-8 BOM is stripped without changing text', () => {
  const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('id,name\n1,Alice\n', 'utf8')]))
  assert.deepEqual(decodeTextBytes(bytes), {
    text: 'id,name\n1,Alice\n',
    encoding: 'utf-8',
    hadBom: true,
  })
})

test('UTF-16 LE BOM text decodes losslessly', () => {
  assert.deepEqual(decodeTextBytes(utf16Le('id,name\n1,Alice\n')), {
    text: 'id,name\n1,Alice\n',
    encoding: 'utf-16le',
    hadBom: true,
  })
})

test('UTF-16 BE BOM text decodes losslessly', () => {
  assert.deepEqual(decodeTextBytes(utf16Be('id,name\n1,Alice\n')), {
    text: 'id,name\n1,Alice\n',
    encoding: 'utf-16be',
    hadBom: true,
  })
})

test('BOM-less input remains UTF-8 for backward compatibility', () => {
  assert.deepEqual(decodeTextBytes(new Uint8Array(Buffer.from('plain text', 'utf8'))), {
    text: 'plain text',
    encoding: 'utf-8',
    hadBom: false,
  })
})
