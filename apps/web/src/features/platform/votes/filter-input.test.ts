import { describe, expect, it } from 'vitest'
import { classifyIdentityInput } from './filter-input'

describe('classifyIdentityInput @PE-21', () => {
  it('tells an identity ID from a ProTx hash and from anything else', () => {
    expect(classifyIdentityInput('  ')).toBe('empty')
    expect(classifyIdentityInput('HQU9pQPmDRVmGqhHEoucD93DXZwARJdfHMY2EhmU8HeK')).toBe('identity')
    expect(
      classifyIdentityInput('EE22F5BCE3B6F8734A664BA7BE36B1BAB218EDA764136691E8B506003A7BB662'),
    ).toBe('protx')
    expect(
      classifyIdentityInput('ee22f5bce3b6f8734a664ba7be36b1bab218eda764136691e8b506003a7bb662'),
    ).toBe('protx')
    expect(classifyIdentityInput('hello')).toBe('invalid')
  })
})
