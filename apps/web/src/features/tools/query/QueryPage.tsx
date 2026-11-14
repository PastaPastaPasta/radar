import { useLingui } from '@lingui/react/macro'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { isSourceError } from '@/data/errors'
import { PageFrame, useNetwork } from '@/features/entity'
import { wellKnownContracts } from '@/lib/well-known'
import { Card, announce } from '@/ui'
import { copyText } from '@/ui/clipboard'
import { lineColumn } from './highlight'
import { explainFailure } from './parse-messages'
import { queryPresets } from './presets'
import { QueryEditor } from './QueryEditor'
import { ResultsPanel } from './ResultsPanel'
import { MAX_STATEMENTS, planQuery, runStatement, type PlanResult, type StatementRun } from './run'
import { useSavedQueries } from './saved-queries'
import { SchemaPanel } from './SchemaPanel'

const CONTRACT_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const OTHER = '__other__'

export function QueryPage() {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const search = useSearch({ from: '/query' })
  const navigate = useNavigate()
  const presets = useMemo(() => queryPresets(net), [net])
  const known = wellKnownContracts(net)
  const first = presets[0]!

  const [sql, setSql] = useState(search.q ?? first.sql)
  const [contractId, setContractId] = useState(search.contract ?? first.contractId)
  const [customId, setCustomId] = useState(
    search.contract && !known.some((c) => c.id === search.contract) ? search.contract : '',
  )
  const picked = known.some((c) => c.id === contractId) ? contractId : OTHER
  const validContract = CONTRACT_ID.test(contractId)

  const [runs, setRuns] = useState<StatementRun[]>([])
  const [running, setRunning] = useState(false)
  const [problem, setProblem] = useState<Exclude<PlanResult, { ok: true }> | undefined>()
  const controller = useRef<AbortController | undefined>(undefined)
  const ids = { contract: useId(), custom: useId(), name: useId(), problem: useId() }

  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )
  useEffect(() => {
    controller.current?.abort()
    setRuns([])
    setProblem(undefined)
    setRunning(false)
  }, [net])

  const syncUrl = useCallback(
    (nextSql: string, nextContract: string) => {
      void navigate({
        to: '/query',
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          q: nextSql,
          contract: nextContract,
        })) as never,
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )

  const execute = useCallback(async () => {
    const plan = planQuery(sql, validContract ? contractId : undefined)
    if (!plan.ok) {
      controller.current?.abort()
      setRuns([])
      setRunning(false)
      setProblem(plan)
      return
    }
    setProblem(undefined)
    syncUrl(sql, contractId)
    controller.current?.abort()
    const mine = new AbortController()
    controller.current = mine
    const live = () => controller.current === mine
    setRuns(plan.statements.map((s) => ({ ...s })))
    setRunning(true)
    for (const [i, statement] of plan.statements.entries()) {
      try {
        const result = await runStatement(net, statement, mine.signal)
        if (!live()) return
        setRuns((all) => all.map((r, j) => (j === i ? { ...r, result } : r)))
      } catch (error) {
        if (!live()) return
        setRuns((all) => all.map((r, j) => (j === i ? { ...r, error } : r)))
        if (isSourceError(error) && error.kind === 'aborted') break
      }
    }
    if (live()) setRunning(false)
  }, [sql, contractId, validContract, net, syncUrl])

  const cancel = () => {
    controller.current?.abort()
    setRuns((all) =>
      all.map((r) =>
        r.result || r.error
          ? r
          : { ...r, error: new DOMException('Cancelled', 'AbortError'), cancelled: true },
      ),
    )
    setRunning(false)
  }

  const more = useCallback(
    async (index: number) => {
      const run = runs[index]
      if (run?.result?.kind !== 'documents') return
      const last = run.result.rows.at(-1)
      if (!last) return
      const mine = new AbortController()
      controller.current = mine
      setRunning(true)
      try {
        const next = await runStatement(net, run, mine.signal, last.id)
        if (controller.current !== mine) return
        setRuns((all) =>
          all.map((r, j) => {
            if (j !== index || r.result?.kind !== 'documents' || next.kind !== 'documents') return r
            return { ...r, result: { ...next, rows: [...r.result.rows, ...next.rows] } }
          }),
        )
      } catch (error) {
        if (controller.current !== mine) return
        setRuns((all) => all.map((r, j) => (j === index ? { ...r, error } : r)))
      }
      if (controller.current === mine) setRunning(false)
    },
    [runs, net],
  )

  const saved = useSavedQueries(net, contractId)
  const [saveName, setSaveName] = useState('')
  const [saveNote, setSaveNote] = useState<string | undefined>()

  const failure = problem?.problem === 'parse' ? problem.failure : undefined
  const explained = failure ? explainFailure(failure) : undefined
  const place = failure ? lineColumn(sql, failure.position) : undefined

  return (
    <PageFrame
      path="/query"
      title={t`Query`}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={t`Run read-only SQL over the documents of a contract. Every answer is checked against a proof in this browser.`}
    >
      <Card title={t`Query`} layer="platform" id="query-editor">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <label htmlFor={ids.contract} className="font-medium">
              {t`Contract`}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id={ids.contract}
                className="dh-input"
                value={picked}
                onChange={(e) => {
                  setContractId(e.target.value === OTHER ? customId : e.target.value)
                }}
              >
                {known.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={OTHER}>{t`Another contract…`}</option>
              </select>
              {picked === OTHER ? (
                <>
                  <label htmlFor={ids.custom} className="sr-only">
                    {t`Contract ID`}
                  </label>
                  <input
                    id={ids.custom}
                    className="dh-input rx-mono min-w-0 flex-1"
                    placeholder={t`Contract ID`}
                    autoComplete="off"
                    spellCheck={false}
                    value={customId || contractId}
                    aria-invalid={contractId !== '' && !validContract ? true : undefined}
                    onChange={(e) => {
                      setCustomId(e.target.value.trim())
                      setContractId(e.target.value.trim())
                    }}
                  />
                </>
              ) : null}
            </div>
            <p className="text-sm text-[var(--dh-ink-2)]">
              {t`A statement can name a contract itself, as in FROM dpns.domain.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-presets>
            <span className="text-sm text-[var(--dh-ink-2)]">{t`Presets`}</span>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="dh-btn dh-btn--sm"
                data-preset={p.id}
                onClick={() => {
                  setSql(p.sql)
                  setContractId(p.contractId)
                  setCustomId('')
                  setProblem(undefined)
                }}
              >
                {i18n._(p.title)}
              </button>
            ))}
          </div>

          <QueryEditor
            value={sql}
            onChange={setSql}
            onRun={() => {
              if (!running) void execute()
            }}
            label={t`SQL query`}
            invalid={problem !== undefined}
            {...(problem ? { errorId: ids.problem } : {})}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="dh-btn dh-btn--primary"
              disabled={running}
              onClick={() => {
                void execute()
              }}
            >
              {t`Run`}
            </button>
            <button type="button" className="dh-btn" disabled={!running} onClick={cancel}>
              {t`Cancel`}
            </button>
            <button
              type="button"
              className="dh-btn"
              onClick={() => {
                const url = new URL(window.location.href)
                url.searchParams.set('q', sql)
                url.searchParams.set('contract', contractId)
                void copyText(url.href).then((ok) => {
                  if (ok) announce(t`Query link copied`)
                })
              }}
            >
              {t`Copy query link`}
            </button>
          </div>

          {problem ? (
            <div
              id={ids.problem}
              role="alert"
              data-query-problem={problem.problem === 'parse' ? failure?.code : problem.problem}
              className="grid gap-1 rounded-[var(--dh-r2)] border border-[var(--dh-bad)] p-3"
            >
              {explained && place ? (
                <>
                  <p className="font-semibold">
                    {i18n._(explained.found)}{' '}
                    <span className="font-normal text-[var(--dh-ink-2)]">
                      {t`Line ${place.line}, column ${place.column}.`}
                    </span>
                  </p>
                  {explained.rule ? <p>{i18n._(explained.rule)}</p> : null}
                </>
              ) : null}
              {problem.problem === 'too-many' ? (
                <p className="font-semibold">
                  {t`Up to ${MAX_STATEMENTS} statements run at once; this has ${problem.count}.`}
                </p>
              ) : null}
              {problem.problem === 'no-contract' ? (
                <p className="font-semibold">
                  {problem.alias
                    ? t`Statement ${problem.statement} names the contract “${problem.alias}”, which Radar doesn't know. Use dpns, dashpay or another system contract, or pick a contract above and leave the name out.`
                    : t`Pick a contract above, or write its name before the type, as in FROM dpns.domain.`}
                </p>
              ) : null}
              <p className="text-sm text-[var(--dh-ink-2)]">{t`Nothing was sent.`}</p>
            </div>
          ) : null}
        </div>
      </Card>

      {runs.length > 0 ? (
        <section className="grid gap-4" aria-label={t`Results`} data-results>
          {runs.map((run, i) => (
            <ResultsPanel
              key={i}
              run={run}
              index={i}
              net={net}
              running={running}
              onMore={(n) => {
                void more(n)
              }}
            />
          ))}
        </section>
      ) : null}

      <Card title={t`Saved queries`} layer="platform" id="query-saved">
        <div className="grid gap-3">
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`Saved in this browser only, for this network and contract.`}
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!saveName.trim()) return
              const outcome = saved.save(saveName, sql)
              if (outcome === 'saved') {
                setSaveNote(undefined)
                setSaveName('')
                announce(t`Query saved`)
              } else {
                setSaveNote(
                  outcome === 'limit'
                    ? t`You can keep up to 20 queries here. Delete one first.`
                    : t`This browser won't store the query.`,
                )
              }
            }}
          >
            <label htmlFor={ids.name} className="sr-only">
              {t`Name for this query`}
            </label>
            <input
              id={ids.name}
              className="dh-input min-w-0 flex-1"
              placeholder={t`Name for this query`}
              maxLength={80}
              autoComplete="off"
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value)
              }}
            />
            <button type="submit" className="dh-btn" disabled={!saveName.trim()}>
              {t`Save`}
            </button>
          </form>
          {saveNote ? (
            <p role="status" className="text-sm">
              {saveNote}
            </p>
          ) : null}
          {saved.queries.length === 0 ? (
            <p className="text-sm text-[var(--dh-ink-2)]">{t`No saved queries yet.`}</p>
          ) : (
            <ul className="grid gap-1" data-saved-queries>
              {saved.queries.map((q) => (
                <li key={q.name} className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="dh-btn dh-btn--link"
                    onClick={() => {
                      setSql(q.sql)
                      setProblem(undefined)
                    }}
                  >
                    {q.name}
                  </button>
                  <button
                    type="button"
                    className="dh-btn dh-btn--sm"
                    aria-label={t`Delete ${q.name}`}
                    onClick={() => {
                      saved.remove(q.name)
                    }}
                  >
                    {t`Delete`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {validContract ? (
        <SchemaPanel
          net={net}
          contractId={contractId}
          onUseType={(type) => {
            setSql(
              `SELECT * FROM ${/^[A-Za-z_$][\w$]*$/.test(type) ? type : `\`${type}\``}\nLIMIT 25`,
            )
            setProblem(undefined)
          }}
        />
      ) : null}
    </PageFrame>
  )
}
