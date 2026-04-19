import { describe, it, expect } from 'vitest'
import { buildOpenUri } from './obsidianUri'

describe('buildOpenUri', () => {
  it('encodes vault name and relative path', () => {
    const uri = buildOpenUri('MyVault', 'notes/hello world.md')
    expect(uri).toBe('obsidian://open?vault=MyVault&file=notes%2Fhello%20world')
  })

  it('strips leading slash from relative path', () => {
    const uri = buildOpenUri('Vault', '/notes/test.md')
    expect(uri).toBe('obsidian://open?vault=Vault&file=notes%2Ftest')
  })

  it('strips .md extension', () => {
    const uri = buildOpenUri('Vault', 'projects/work.md')
    expect(uri).toBe('obsidian://open?vault=Vault&file=projects%2Fwork')
  })

  it('handles vault name with spaces', () => {
    const uri = buildOpenUri('My Vault', 'note.md')
    expect(uri).toBe('obsidian://open?vault=My%20Vault&file=note')
  })

  it('handles plain filename without extension', () => {
    const uri = buildOpenUri('Vault', 'note')
    expect(uri).toBe('obsidian://open?vault=Vault&file=note')
  })
})
