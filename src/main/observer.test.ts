import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMacAvailableMemoryMb, parseMacProcesses } from './observer'

test('macOS process parsing preserves executable names with spaces and window eligibility', () => {
  const processes = parseMacProcesses([
    '  101   204800  1.5 /Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    '  202    51200  0.0 /usr/libexec/helper'
  ].join('\n'), new Set([101]))
  assert.deepEqual(processes, [
    { pid: 101, name: 'Electron', memoryMb: 200, cpu: 1.5, hasWindow: true },
    { pid: 202, name: 'helper', memoryMb: 50, cpu: null, hasWindow: false }
  ])
})

test('macOS available memory includes reclaimable inactive and speculative pages', () => {
  const vmStat = [
    'Mach Virtual Memory Statistics: (page size of 4096 bytes)',
    'Pages free:                               1000.',
    'Pages active:                             9000.',
    'Pages inactive:                           2000.',
    'Pages speculative:                        1000.'
  ].join('\n')
  assert.equal(parseMacAvailableMemoryMb(vmStat), 16)
})
