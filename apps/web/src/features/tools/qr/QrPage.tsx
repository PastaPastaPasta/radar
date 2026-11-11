import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { local } from '@/data/envelope'
import { useDocumentTitle, useNetwork } from '@/features/entity'
import { Card, Empty, SourceLine } from '@/ui'
import { interpretScan, type ScanOutcome } from './interpret'
import { readQr } from './scan'

type Camera = 'off' | 'starting' | 'on' | 'denied' | 'unavailable'
type Notice = Exclude<ScanOutcome, { kind: 'search' }> | { kind: 'none-found' } | { kind: 'failed' }

const FRAME_MS = 250

export function QrPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  useDocumentTitle(t`QR reader`)
  const fileId = useId()
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const session = useRef(0)
  const [camera, setCamera] = useState<Camera>('off')
  const [notice, setNotice] = useState<Notice | undefined>()
  const [busy, setBusy] = useState(false)
  const [stamp] = useState(() => local(null))

  const stop = useCallback(() => {
    session.current += 1
    window.clearInterval(timer.current)
    stream.current?.getTracks().forEach((track) => {
      track.stop()
    })
    stream.current = null
    setCamera((c) => (c === 'on' || c === 'starting' ? 'off' : c))
  }, [])

  useEffect(() => stop, [stop])

  const handle = useCallback(
    (text: string | undefined) => {
      if (text === undefined) return false
      const outcome = interpretScan(text, net)
      if (outcome.kind === 'search') {
        stop()
        void navigate({ to: '/search', search: { q: outcome.query } as never })
        return true
      }
      setNotice(outcome)
      return outcome.kind === 'refused'
    },
    [net, navigate, stop],
  )

  async function start() {
    setNotice(undefined)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable')
      return
    }
    window.clearInterval(timer.current)
    const mine = ++session.current
    setCamera('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      if (session.current !== mine) {
        media.getTracks().forEach((track) => {
          track.stop()
        })
        return
      }
      stream.current = media
      const el = video.current
      if (el) {
        el.srcObject = media
        await el.play().catch(() => undefined)
      }
      if (session.current !== mine) return
      setCamera('on')
      const canvas = document.createElement('canvas')
      let reading = false
      timer.current = window.setInterval(() => {
        const v = video.current
        if (reading || !v || v.videoWidth === 0) return
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(v, 0, 0)
        reading = true
        readQr(context.getImageData(0, 0, canvas.width, canvas.height))
          .then((text) => {
            if (session.current === mine && handle(text)) stop()
          })
          .catch(() => undefined)
          .finally(() => {
            reading = false
          })
      }, FRAME_MS)
    } catch (e) {
      if (session.current !== mine) return
      const denied =
        e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setCamera(denied ? 'denied' : 'unavailable')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setNotice(undefined)
    setBusy(true)
    try {
      const text = await readQr(file)
      if (text === undefined) setNotice({ kind: 'none-found' })
      else handle(text)
    } catch {
      setNotice({ kind: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article data-page="/tools/qr" data-layer="core" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`Tools`}
        </p>
        <h1 className="text-3xl font-semibold">{t`QR reader`}</h1>
        <p className="text-[var(--dh-ink-2,inherit)]">
          {t`Read a QR code with your camera or from a picture, and look up what it holds. The image is read in this browser and is not uploaded.`}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t`Camera`} layer="core" source={stamp}>
          <div className="grid gap-3">
            <video
              ref={video}
              className="w-full rounded bg-black"
              playsInline
              muted
              aria-label={t`Camera preview`}
              hidden={camera !== 'on'}
              data-camera={camera}
            />
            {camera === 'on' ? (
              <div className="flex flex-wrap items-center gap-3">
                <p role="status">{t`Point the camera at a QR code.`}</p>
                <button type="button" className="dh-btn" onClick={stop}>
                  {t`Stop the camera`}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dh-btn dh-btn--primary justify-self-start"
                disabled={camera === 'starting'}
                onClick={() => void start()}
              >
                {camera === 'starting' ? t`Waiting for the camera…` : t`Use the camera`}
              </button>
            )}
            {camera === 'denied' ? (
              <p role="alert" data-camera-problem="denied">
                {t`The browser didn’t give Radar the camera. Allow it in the site settings, or choose a picture instead.`}
              </p>
            ) : null}
            {camera === 'unavailable' ? (
              <p role="alert" data-camera-problem="unavailable">
                {t`No camera could be opened here. Choose a picture instead.`}
              </p>
            ) : null}
          </div>
        </Card>

        <Card title={t`Picture`} layer="core" source={stamp}>
          <div className="grid gap-3">
            <label htmlFor={fileId} className="font-medium">
              {t`Choose a picture with a QR code`}
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                void onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {busy ? <p role="status">{t`Reading the picture…`}</p> : null}
          </div>
        </Card>
      </div>

      <div role="status" aria-live="polite">
        {notice ? <Problem notice={notice} /> : null}
      </div>
      <SourceLine stamp={stamp} compact />
    </article>
  )
}

function Problem({ notice }: { notice: Notice }) {
  const { t } = useLingui()
  switch (notice.kind) {
    case 'refused':
      return (
        <Empty
          kind="blocked"
          title={t`That QR code holds a private key or a recovery phrase.`}
          body={t`Radar didn’t keep it, show it or search for it. Radar never needs a key: if this one is yours, treat it as exposed.`}
        />
      )
    case 'unreadable':
      return (
        <Empty
          kind="no-match"
          title={t`That QR code isn’t something Radar can look up.`}
          body={t`Radar looks up addresses, blocks, transactions, names, masternodes and the like.`}
        />
      )
    case 'none-found':
      return (
        <Empty
          kind="no-match"
          title={t`No QR code found in that picture.`}
          body={t`Try a sharper picture, with the whole code in view.`}
        />
      )
    case 'failed':
      return (
        <Empty
          kind="no-match"
          title={t`That picture couldn’t be read.`}
          body={t`Choose a PNG or JPEG image.`}
        />
      )
  }
}
