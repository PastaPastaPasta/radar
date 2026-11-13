import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

/** The draft of a one-field lookup and its submit, which writes the trimmed draft to the page's `key` search param. */
export function useLookupForm(
  to: '/credits' | '/shielded',
  key: 'id' | 'nf',
  current: string | undefined,
) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(current ?? '')
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = draft.trim()
    void navigate({
      to,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [key]: value === '' ? undefined : value,
      })) as never,
    })
  }
  return { draft, setDraft, submit }
}
