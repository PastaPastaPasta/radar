import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import {
  contestRef,
  DPNS,
  isContestedLabel,
  labelOf,
  labelProblem,
  normalizeLabel,
  type ContestRef,
  type LabelProblem,
} from '@/data/query/prefetch/p-vote'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, IdentityRef, PageFrame, PageLink, useNetwork } from '@/features/entity'
import { systemContract } from '@/lib/well-known'
import { endOf, pollEnds, useUpcomingPolls } from '../contest/shared'
import type { ContestVoteStateDto } from '@/data/sdk/methods/p-vote'
import { Badge, Card, Empty, JsonView, KeyValue, LinkOut, Time } from '@/ui'

export function NamePage({ label: raw }: { label: string }) {
  const { t } = useLingui()
  const label = labelOf(raw)
  const problem = labelProblem(label)
  return (
    <PageFrame
      path="/name/$label"
      title={t`Name`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={<span data-name-label>{`${label}.${DPNS.tld}`}</span>}
    >
      {problem ? <Invalid label={label} problem={problem} /> : <NameStatus label={label} />}
    </PageFrame>
  )
}

function useProblemText() {
  const { t } = useLingui()
  return (problem: LabelProblem): string => {
    switch (problem) {
      case 'empty':
        return t`Enter a name such as alice.dash.`
      case 'too-short':
        return t`A name needs at least 3 characters.`
      case 'too-long':
        return t`A name can be at most 63 characters.`
      case 'characters':
        return t`A name may hold only the letters a–z, the digits 0–9 and hyphens.`
      case 'hyphen-edge':
        return t`A name can’t start or end with a hyphen.`
    }
  }
}

function Invalid({ label, problem }: { label: string; problem: LabelProblem }) {
  const { t } = useLingui()
  const why = useProblemText()
  return (
    <Card layer="platform" id="name-status" title={t`Status`}>
      <p data-status="invalid">
        <Badge tone="danger">
          {t`Invalid`}
        </Badge>
      </p>
      <Empty
        kind="not-found"
        title={t`${label} can’t be a DPNS name.`}
        body={why(problem)}
        action={<PageLink to="/names">{t`Search names`}</PageLink>}
      />
    </Card>
  )
}

function NameStatus({ label }: { label: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const safe = normalizeLabel(label)
  const contestedRule = isContestedLabel(label)
  const owner = useQuery(sdkQueries['dpns.getUsernameByName'](net, { name: `${label}.dash` }))
  const registered = owner.data?.data ?? null
  const ref = contestRef(label, {})
  const contest = useQuery({
    ...sdkQueries['voting.contestedResourceVoteState'](net, {
      contractId: ref.contractId,
      type: ref.type,
      index: ref.index,
      indexValues: ref.indexValues,
    }),
    enabled: contestedRule && owner.isSuccess && !registered,
  })
  const state = contest.data?.data
  const inContest =
    contestedRule && state !== undefined && (state.contenders.length > 0 || state.winner !== null)

  const status = owner.isPending
    ? 'loading'
    : owner.isError
      ? 'error'
      : registered
        ? 'registered'
        : !contestedRule
          ? 'available'
          : contest.isPending
            ? 'loading'
            : contest.isError
              ? 'error'
              : inContest
                ? 'contested'
                : 'available'

  const stamp = owner.data ? stampOf(owner.data) : undefined
  return (
    <>
      <Card
        layer="platform"
        id="name-status"
        title={t`Status`}
        state={status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'ready'}
        error={owner.error ?? contest.error}
        onRetry={() => {
          void owner.refetch()
          void contest.refetch()
        }}
        source={stamp}
      >
        {status === 'registered' && registered ? (
          <Registered
            label={label}
            owner={registered.identityId}
            documentId={registered.documentId}
          />
        ) : status === 'contested' && state ? (
          <Contested label={label} ref_={ref} state={state} />
        ) : status === 'available' ? (
          <Available label={label} contestedRule={contestedRule} />
        ) : null}
      </Card>
      {safe !== label.toLowerCase() ? (
        <p className="rx-dim" data-safe-form>
          {t`DPNS stores this name as ${safe}: o is kept as 0, and i and l as 1, so look-alike names can’t be registered.`}
        </p>
      ) : null}
    </>
  )
}

function Available({ label, contestedRule }: { label: string; contestedRule: boolean }) {
  const { t } = useLingui()
  return (
    <>
      <p data-status="available">
        <Badge tone="success">
          {t`Available`}
        </Badge>
      </p>
      <p>
        {contestedRule
          ? t`Nobody owns ${label}.dash and no contest is open for it. Registering it starts a contest that masternodes vote on.`
          : t`Nobody owns ${label}.dash yet; it can be registered directly.`}
      </p>
    </>
  )
}

function Contested({
  label,
  ref_,
  state,
}: {
  label: string
  ref_: ContestRef
  state: ContestVoteStateDto
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const polls = useUpcomingPolls()
  const end = polls.data ? endOf(pollEnds(polls.data.data), ref_) : undefined
  const leader = [...state.contenders].sort((a, b) => (b.voteTally ?? 0) - (a.voteTally ?? 0))[0]
  const decided = state.winner !== null
  return (
    <>
      <p data-status="contested">
        <Badge tone="warning">
          {decided
            ? state.winner?.kind === 'locked'
              ? t`Contested: locked`
              : t`Contested: decided`
            : t`Contested`}
        </Badge>
      </p>
      <KeyValue
        columns={2}
        items={[
          {
            label: t`Contest`,
            value: (
              <Entity kind="contest" id={label} label={t`Open the contest for ${label}.dash`} />
            ),
          },
          {
            label: t`Leading`,
            value:
              leader && (leader.voteTally ?? 0) > 0 ? (
                <span data-field="leader">
                  <IdentityRef id={leader.identityId} /> · {leader.voteTally}
                </span>
              ) : (
                t`No votes yet`
              ),
          },
          {
            label: t`Voting ends`,
            value: decided ? (
              t`Decided`
            ) : end !== undefined ? (
              <Time ms={end} mode="both" />
            ) : polls.isPending ? (
              t`Loading…`
            ) : (
              '—'
            ),
          },
        ]}
      />
      <p>
        <LinkOut to={{ app: 'gov', action: 'contest-vote', label, net }}>
          {t`Vote in Governance`}
        </LinkOut>
      </p>
    </>
  )
}

function Registered({
  label,
  owner,
  documentId,
}: {
  label: string
  owner: string
  documentId: string
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const dpns = systemContract('dpns').id
  const doc = useQuery(
    sdkQueries['documents.get'](net, { contractId: dpns, type: DPNS.type, id: documentId }),
  )
  const d = doc.data?.data
  const records = d?.data.records
  return (
    <>
      <p data-status="registered">
        <Badge tone="info">
          {t`Registered`}
        </Badge>
      </p>
      <KeyValue
        columns={2}
        items={[
          { label: t`Owner`, value: <IdentityRef id={owner} /> },
          {
            label: t`Document`,
            value: (
              <Entity
                kind="document"
                id={`${dpns}/${DPNS.type}/${documentId}`}
                label={documentId}
              />
            ),
          },
          {
            label: t`Created`,
            value: d?.createdAt ? (
              <Time ms={d.createdAt} mode="both" />
            ) : doc.isPending ? (
              t`Loading…`
            ) : (
              '—'
            ),
            source: doc.data ? stampOf(doc.data) : undefined,
          },
          {
            label: t`Updated`,
            value: d?.updatedAt ? (
              <Time ms={d.updatedAt} mode="both" />
            ) : doc.isPending ? (
              t`Loading…`
            ) : (
              '—'
            ),
          },
        ]}
      />
      <h3 className="rx-h3">{t`Records`}</h3>
      {records && typeof records === 'object' && Object.keys(records).length > 0 ? (
        <JsonView value={records} collapsedDepth={2} label={t`Records of ${label}.dash`} />
      ) : (
        <p className="rx-dim">{doc.isPending ? t`Loading…` : t`This name has no records.`}</p>
      )}
      <p>
        <LinkOut
          to={{ app: 'bridge', action: 'name', id: owner, net }}
        >{t`Manage in Bridge`}</LinkOut>
      </p>
    </>
  )
}
