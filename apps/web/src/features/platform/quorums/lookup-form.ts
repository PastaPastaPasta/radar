import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

/**
 * The draft of a one-field lookup and its submit, which writes the trimmed draft to the page's `key` search param.
 * `blank` is set when the field was submitted empty, until the next keystroke.
 */
export function useLookupForm(
  to: '/credits' | '/shielded',
  key: 'id' | 'nf',
  current: string | undefined,
) {
  const navigate = useNavigate()
  const [draft, setDraftText] = useState(current ?? '')
  const [blank, setBlank] = useState(false)
  const setDraft = (text: string) => {
    setDraftText(text)
    setBlank(false)
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = draft.trim()
    setBlank(value === '')
    void navigate({
      to,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [key]: value === '' ? undefined : value,
      })) as never,
    })
  }
  return { draft, setDraft, submit, blank }
}
