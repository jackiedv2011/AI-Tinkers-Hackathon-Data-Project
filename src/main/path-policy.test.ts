import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyDisposablePath, importanceScore, isInside, shouldSkipPath } from './path-policy'

const home = 'C:\\Users\\alex'
const quarantine = 'C:\\Users\\alex\\AppData\\Roaming\\Lifeguard\\Quarantine'

test('path containment cannot be fooled by a sibling prefix', () => {
  assert.equal(isInside('C:\\Users\\alex\\Projects\\app', 'C:\\Users\\alex\\Projects'), true)
  assert.equal(isInside('C:\\Users\\alex\\Projects-old\\app', 'C:\\Users\\alex\\Projects'), false)
})

test('system, application, protected, and quarantine paths are excluded', () => {
  assert.equal(shouldSkipPath('C:\\Windows\\Temp\\large.tmp', home, [], quarantine, 'win32'), true)
  assert.equal(shouldSkipPath('C:\\Program Files\\Tool\\data.bin', home, [], quarantine, 'win32'), true)
  assert.equal(shouldSkipPath('C:\\Users\\alex\\Projects\\active\\build.zip', home, ['C:\\Users\\alex\\Projects'], quarantine, 'win32'), true)
  assert.equal(shouldSkipPath(`${quarantine}\\held.zip`, home, [], quarantine, 'win32'), true)
})

test('only recognized user cache and temp trees bypass the AppData exclusion', () => {
  assert.equal(classifyDisposablePath('C:\\Users\\alex\\AppData\\Local\\Temp\\old.tmp', home, 'win32'), 'temp')
  assert.equal(classifyDisposablePath('C:\\Users\\alex\\AppData\\Local\\Discord\\Cache\\old.bin', home, 'win32'), 'cache')
  assert.equal(shouldSkipPath('C:\\Users\\alex\\AppData\\Local\\Discord\\settings.json', home, [], quarantine, 'win32'), true)
  assert.equal(shouldSkipPath('C:\\Users\\alex\\AppData\\Local\\Discord\\Cache', home, [], quarantine, 'win32'), false)
  assert.equal(shouldSkipPath('C:\\Users\\alex\\AppData\\Local\\Discord\\Cache\\old.bin', home, [], quarantine, 'win32'), false)
})

test('importance model protects recent and personal work while lowering disposable files', () => {
  const now = Date.now()
  assert.ok(importanceScore('C:\\Users\\alex\\Documents\\report.md', now, now, [], null, now) >= 100)
  assert.ok(importanceScore('C:\\Users\\alex\\AppData\\Local\\Temp\\old.tmp', now - 100 * 86_400_000, now - 100 * 86_400_000, [], 'temp', now) < 0)
  assert.equal(importanceScore('C:\\Users\\alex\\Projects\\secret.txt', 0, 0, ['C:\\Users\\alex\\Projects'], null, now), 1000)
})
