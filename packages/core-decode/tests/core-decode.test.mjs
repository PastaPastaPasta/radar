import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSync, decodeBlock, decodeTx } from '../dist/core_decode.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'tests', 'fixtures')
const vectors = path.join(root, 'tests', 'vectors')
initSync({ module: readFileSync(path.join(root, 'dist', 'core_decode_bg.wasm')) })

const hexBytes = (f) => Buffer.from(readFileSync(f, 'utf8').trim(), 'hex')
const manifest = JSON.parse(readFileSync(path.join(fixtures, 'manifest.json'), 'utf8'))
const insight = (f) => JSON.parse(readFileSync(path.join(fixtures, f), 'utf8'))
const duffs = (s) => Math.round(Number(s) * 1e8)

// ---- shape check against the hand-written typings -------------------------------------------

const dts = readFileSync(path.join(root, 'dist', 'core_decode.d.ts'), 'utf8')
const interfaces = {}
for (const m of dts.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)) {
  const fields = {}
  for (const f of m[2].matchAll(/^ {2}(\w+): (.+?);?$/gm)) fields[f[1]] = f[2]
  interfaces[m[1]] = fields
}
const kindToInterface = (kind) => kind[0].toUpperCase() + kind.slice(1) + 'Payload'
const aliases = { Hex: 'string', Network: 'string', ScriptType: 'string', TxTypeName: 'string' }

function checkType(value, type, where) {
  const nullable = / \| null$/.test(type)
  const t = type.replace(/ \| null$/, '')
  if (value === null) return assert.ok(nullable, `${where}: null where typings say ${type}`)
  assert.notEqual(value, undefined, `${where}: undefined`)
  if (t.endsWith('[]')) {
    assert.ok(Array.isArray(value), `${where}: expected array`)
    value.forEach((v, i) => checkType(v, t.slice(0, -2), `${where}[${i}]`))
  } else if (t === 'TxPayload') {
    checkObject(value, kindToInterface(value.kind), where)
  } else if (interfaces[t]) {
    checkObject(value, t, where)
  } else if (t === 'number' || t === 'boolean' || t === 'string') {
    assert.equal(typeof value, t, `${where}: expected ${t}`)
  } else if (aliases[t]) {
    assert.equal(typeof value, 'string', `${where}: expected string`)
  } else if (/^["']/.test(t)) {
    const allowed = t.split('|').map((x) => x.trim().replace(/["']/g, ''))
    assert.ok(allowed.includes(value), `${where}: ${value} not in ${t}`)
  } else {
    assert.fail(`${where}: typings use unsupported type ${type}`)
  }
}

function checkObject(obj, iface, where) {
  const fields = interfaces[iface]
  assert.ok(fields, `${where}: no interface ${iface} in typings`)
  const actual = Object.keys(obj).sort()
  const declared = Object.keys(fields).sort()
  assert.deepEqual(actual, declared, `${where}: keys differ from interface ${iface}`)
  for (const k of declared) checkType(obj[k], fields[k], `${where}.${k}`)
}

const seenKinds = new Set()
function checkTx(tx, where) {
  checkObject(tx, 'DecodedTx', where)
  if (tx.payload) seenKinds.add(tx.payload.kind)
}
function checkBlock(b, where) {
  checkObject(b, 'DecodedBlock', where)
  b.txs.forEach((t) => t.payload && seenKinds.add(t.payload.kind))
}

const addr = (k) => k.address
// Insight's decoded special-tx fields, compared with ours.
const payloadChecks = {
  cbTx: (p, r) => {
    assert.equal(p.version, r.cbTx.version)
    assert.equal(p.height, r.cbTx.height)
    assert.equal(p.merkleRootMnList, r.cbTx.merkleRootMNList)
    assert.equal(p.merkleRootQuorums, r.cbTx.merkleRootQuorums)
    assert.equal(p.bestClHeightDiff, r.cbTx.bestCLHeightDiff)
    assert.equal(p.bestClSignature, r.cbTx.bestCLSignature)
    assert.equal(p.creditPoolBalance, duffs(r.cbTx.creditPoolBalance))
  },
  proRegTx: (p, r) => {
    const c = r.proRegTx
    assert.equal(p.version, c.version)
    assert.equal(p.collateralOutpoint.txid, c.collateralHash)
    assert.equal(p.collateralOutpoint.vout, c.collateralIndex)
    assert.equal(p.service.address, c.service)
    assert.equal(addr(p.ownerKey), c.ownerAddress)
    assert.equal(addr(p.votingKey), c.votingAddress)
    assert.equal(p.scriptPayout.address, c.payoutAddress)
    assert.equal(p.operatorPublicKey, c.pubKeyOperator)
    assert.equal(p.operatorReward, c.operatorReward)
    assert.equal(p.inputsHash, c.inputsHash)
  },
  proUpServTx: (p, r) => {
    assert.equal(p.version, r.proUpServTx.version)
    assert.equal(p.proTxHash, r.proUpServTx.proTxHash)
    assert.equal(p.service.address, r.proUpServTx.service)
    assert.equal(p.inputsHash, r.proUpServTx.inputsHash)
  },
  proUpRegTx: (p, r) => {
    const c = r.proUpRegTx
    assert.equal(p.proTxHash, c.proTxHash)
    assert.equal(p.operatorPublicKey, c.pubKeyOperator)
    assert.equal(addr(p.votingKey), c.votingAddress)
    assert.equal(p.scriptPayout.address, c.payoutAddress)
    assert.equal(p.inputsHash, c.inputsHash)
  },
  proUpRevTx: (p, r) => {
    assert.equal(p.proTxHash, r.proUpRevTx.proTxHash)
    assert.equal(p.reason, r.proUpRevTx.reason)
    assert.equal(p.inputsHash, r.proUpRevTx.inputsHash)
  },
  qcTx: (p, r) => {
    const c = r.qcTx.commitment
    assert.equal(p.version, r.qcTx.version)
    assert.equal(p.height, r.qcTx.height)
    assert.equal(p.commitment.version, c.version)
    assert.equal(p.commitment.llmqType, c.llmqType)
    assert.equal(p.commitment.quorumHash, c.quorumHash)
    // Core prints 0 for non-indexed (version 1 / 3) commitments, where the field is not on the wire.
    assert.equal(p.commitment.quorumIndex ?? 0, c.quorumIndex ?? 0)
    assert.equal(p.commitment.signersCount, c.signersCount)
    assert.equal(p.commitment.validMembersCount, c.validMembersCount)
    assert.equal(p.commitment.quorumPublicKey, c.quorumPublicKey)
    assert.equal(p.commitment.quorumVvecHash, c.quorumVvecHash)
    assert.equal(p.commitment.thresholdSig, c.quorumSig)
    assert.equal(p.commitment.allCommitmentAggregatedSignature, c.membersSig)
  },
}

// ---- real mainnet fixtures vs Insight's own JSON -------------------------------------------

test('mainnet block decodes and matches Insight', () => {
  const { hash } = manifest.block
  const bytes = hexBytes(path.join(fixtures, `block-${hash}.hex`))
  const b = decodeBlock(bytes, 'mainnet')
  checkBlock(b, 'block')
  assert.equal(b.hash, hash)
  assert.equal(b.size, bytes.length)
  const ref = insight(`block-${hash}.insight.json`)
  assert.equal(b.version, ref.version)
  assert.equal(b.prevBlockHash, ref.previousblockhash)
  assert.equal(b.merkleRoot, ref.merkleroot)
  assert.equal(b.time, ref.time)
  assert.equal(b.nonce, ref.nonce)
  assert.equal(b.bits.toString(16).padStart(8, '0'), ref.bits)
  assert.equal(b.size, ref.size)
  assert.deepEqual(
    b.txs.map((t) => t.txid),
    ref.tx,
  )
  assert.equal(b.txCount, ref.tx.length)
  assert.equal(b.txs[0].isCoinbase, true)
  assert.equal(b.txs[0].txTypeName, 'cbTx')
  assert.ok(b.coinbase.text.length > 0)
  assert.equal(
    b.txs.slice(1).some((t) => t.isCoinbase),
    false,
  )
  assert.equal(b.txs[0].payload.height, ref.height)
  assert.equal(
    b.txs.reduce((n, t) => n + t.size, 0) + 80 + (b.txCount < 253 ? 1 : b.txCount < 65536 ? 3 : 5),
    b.size,
  )
})

for (const [type, info] of Object.entries(manifest.txs)) {
  test(`mainnet ${type} ${info.txid.slice(0, 12)} decodes and matches Insight`, () => {
    const bytes = hexBytes(path.join(fixtures, `tx-${type}-${info.txid}.hex`))
    const tx = decodeTx(bytes, 'mainnet')
    checkTx(tx, type)
    assert.equal(tx.txid, info.txid)
    assert.equal(tx.txTypeName, type)
    assert.equal(tx.payload.kind, type)
    assert.equal(tx.size, bytes.length)
    const ref = insight(`tx-${type}-${info.txid}.insight.json`)
    assert.equal(tx.lockTime, ref.locktime)
    assert.equal(tx.version, ref.version & 0xffff)
    assert.equal(tx.inputs.length, ref.vin.length)
    tx.inputs.forEach((i, n) => {
      if (ref.vin[n].coinbase) return assert.equal(i.scriptSigHex, ref.vin[n].coinbase)
      assert.equal(i.prevTxid, ref.vin[n].txid)
      assert.equal(i.vout, ref.vin[n].vout)
      assert.equal(i.sequence, ref.vin[n].sequence)
    })
    payloadChecks[type]?.(tx.payload, ref)
    assert.ok(
      bytes.toString('hex').includes(ref.extraPayload),
      "Insight's extraPayload appears verbatim in the tx bytes",
    )
    assert.equal(tx.outputs.length, ref.vout.length)
    tx.outputs.forEach((o, n) => {
      assert.equal(o.value, duffs(ref.vout[n].value))
      assert.equal(o.scriptPubKeyHex, ref.vout[n].scriptPubKey.hex)
      assert.equal(o.address, ref.vout[n].scriptPubKey.addresses?.[0] ?? null)
    })
  })
}

test('mainnet payload specifics', () => {
  const load = (type) => {
    const info = manifest.txs[type]
    return info && decodeTx(hexBytes(path.join(fixtures, `tx-${type}-${info.txid}.hex`)), 'mainnet')
  }
  const cb = load('cbTx')
  if (cb) {
    const p = cb.payload
    assert.ok(p.version >= 2)
    assert.equal(p.merkleRootMnList.length, 64)
    if (p.version >= 3) {
      assert.equal(p.bestClHeight, p.height - 1 - p.bestClHeightDiff)
      assert.equal(p.bestClSignature.length, 192)
      assert.ok(p.creditPoolBalance > 0)
    }
  }
  const al = load('assetLockTx')
  if (al) {
    assert.equal(
      al.payload.totalCredit,
      al.payload.creditOutputs.reduce((n, o) => n + o.value, 0),
    )
    assert.ok(
      al.payload.creditOutputs.every((o) => o.address === null || o.address.startsWith('X')),
    )
  }
  const au = load('assetUnlockTx')
  if (au) {
    assert.equal(au.inputs.length, 0)
    assert.equal(au.payload.quorumSig.length, 192)
    assert.ok(au.payload.fee > 0)
  }
  const qc = load('qcTx')
  if (qc) {
    const c = qc.payload.commitment
    assert.equal(c.signers.length, c.validMembers.length)
    assert.equal(c.signersCount, [...c.signers].filter((x) => x === '1').length)
    assert.equal(c.quorumPublicKey.length, 96)
  }
  const ps = load('proUpServTx')
  if (ps) {
    assert.match(ps.payload.service.address ?? '', /^[\d.]+:\d+$|^\[.*\]:\d+$/)
    assert.equal(ps.payload.proTxHash.length, 64)
  }
})

// ---- rust-dashcore vectors (testnet / devnet / mainnet) through wasm -------------------------

test('rust-dashcore vectors decode through wasm and match the typings', () => {
  const nets = {
    'block_13b8a.hex': 'mainnet',
    'cbtx_mainnet_block_27facf.hex': 'mainnet',
    'assetlock_mainnet_core.hex': 'mainnet',
  }
  let n = 0
  for (const f of readdirSync(vectors)) {
    if (f === 'README.md') continue
    const isBlock = /^(block_|testnet_block_)/.test(f)
    const bytes = f.endsWith('.raw')
      ? readFileSync(path.join(vectors, f))
      : hexBytes(path.join(vectors, f))
    const net = nets[f] ?? (f.startsWith('testnet') || f.includes('testnet') ? 'testnet' : 'devnet')
    if (isBlock) checkBlock(decodeBlock(bytes, net), f)
    else checkTx(decodeTx(bytes, net), f)
    n++
  }
  assert.ok(n >= 17)
})

test('devnet vectors: v3 ProRegTx / ProUpServTx / ProUpRegTx / quorum commitment values', () => {
  const tx = (f, net = 'devnet') => decodeTx(hexBytes(path.join(vectors, f)), net)
  const reg = tx('pro_reg_tx_v3_two_payouts.hex')
  assert.deepEqual(
    reg.payload.payouts.map((p) => p.reward),
    [6000, 4000],
  )
  const serv = tx('evo_pro_up_serv_tx_v3.hex')
  assert.equal(serv.payload.service.address, '68.67.122.237:20001')
  assert.equal(serv.payload.platformNodeId, 'f958365178aaf234a101db3a34025bdf5f6ed315')
  const upreg = tx('pro_up_reg_tx_v3.hex')
  assert.equal(upreg.payload.payouts[0].script.address, 'yT7ShTqEqPBskpTAiHzWaAggFmD4j1MCT3')
  const blk = decodeBlock(hexBytes(path.join(vectors, 'block_15000.hex')), 'devnet')
  assert.deepEqual(
    blk.txs.map((t) => t.txTypeName),
    ['cbTx', 'qcTx', 'qcTx'],
  )
})

// ---- synthetic wire-format checks for types without a mainnet / upstream full-tx vector -------

const le = (n, bytes) => {
  const b = Buffer.alloc(bytes)
  let v = BigInt(n)
  for (let i = 0; i < bytes; i++, v >>= 8n) b[i] = Number(v & 0xffn)
  return b
}
const rev = (hex) => Buffer.from(hex, 'hex').reverse()
const oneInput = Buffer.concat([
  Buffer.from([1]),
  Buffer.alloc(32, 0x33),
  le(1, 4),
  Buffer.from([0]),
  le(0xfffffffe, 4),
])
function specialTx(type, payload, outputs = Buffer.from([0]), inputs = Buffer.from([0])) {
  return Buffer.concat([
    Buffer.from([3, 0, type, 0]),
    inputs,
    outputs,
    Buffer.alloc(4),
    Buffer.from([payload.length]),
    payload,
  ])
}

test('synthetic ProUpRevTx, MNHF and AssetUnlock follow DIP wire layouts', () => {
  const hash = Array.from({ length: 32 }, (_, i) => (i * 7 + 1).toString(16).padStart(2, '0')).join(
    '',
  )
  const sig = Buffer.alloc(96, 0xab)
  // ProUpRevTx: u16 version, hash, u16 reason, inputsHash, BLS sig
  let tx = decodeTx(
    specialTx(
      4,
      Buffer.concat([le(1, 2), rev(hash), le(3, 2), Buffer.alloc(32, 5), sig]),
      Buffer.from([0]),
      oneInput,
    ),
    'mainnet',
  )
  checkTx(tx, 'proUpRevTx')
  assert.equal(tx.txTypeName, 'proUpRevTx')
  assert.equal(tx.payload.reason, 3)
  assert.equal(tx.payload.proTxHash, hash)
  assert.equal(tx.payload.inputsHash, '05'.repeat(32))
  assert.equal(tx.inputs[0].prevTxid, '33'.repeat(32))
  assert.equal(tx.inputs[0].vout, 1)
  assert.equal(tx.payload.payloadSig, 'ab'.repeat(96))
  // MNHF: u8 version, u8 versionBit, quorumHash, BLS sig
  tx = decodeTx(specialTx(7, Buffer.concat([Buffer.from([1, 10]), rev(hash), sig])), 'mainnet')
  checkTx(tx, 'mnhfTx')
  assert.equal(tx.payload.versionBit, 10)
  assert.equal(tx.payload.quorumHash, hash)
  // AssetUnlock: u8 version, u64 index, u32 fee, u32 requestHeight, quorumHash, BLS sig; one P2PKH output
  const out = Buffer.concat([
    Buffer.from([1]),
    le(123456789, 8),
    Buffer.from([0x19]),
    Buffer.from('76a914' + '22'.repeat(20) + '88ac', 'hex'),
  ])
  tx = decodeTx(
    specialTx(
      9,
      Buffer.concat([Buffer.from([1]), le(77, 8), le(4000, 4), le(2000000, 4), rev(hash), sig]),
      out,
    ),
    'mainnet',
  )
  checkTx(tx, 'assetUnlockTx')
  assert.equal(tx.payload.index, 77)
  assert.equal(tx.payload.fee, 4000)
  assert.equal(tx.payload.requestHeight, 2000000)
  assert.equal(tx.outputs[0].value, 123456789)
  assert.equal(tx.outputs[0].address, 'XdoKhQE8njcWL8gXfUVXnYf2ejpHSdUeQa')
  const testnet = decodeTx(
    specialTx(
      9,
      Buffer.concat([Buffer.from([1]), le(77, 8), le(4000, 4), le(2000000, 4), rev(hash), sig]),
      out,
    ),
    'testnet',
  )
  assert.equal(testnet.outputs[0].address, 'yPRviMJaEHGafsc5EKovpa5Nw2Jewo9mdj')
})

test('a payload layout the decoder does not know comes back raw, not as a throw', () => {
  const cb = Buffer.concat([
    Buffer.from([3, 0, 5, 0, 1]),
    Buffer.alloc(32),
    le(0xffffffff, 4),
    Buffer.from([2, 0x51, 0x51]),
    le(0xffffffff, 4),
    Buffer.from([1]),
    le(5000, 8),
    Buffer.from([0]),
    Buffer.alloc(4),
  ])
  const payload = Buffer.concat([le(99, 2), Buffer.from('deadbeef', 'hex')])
  const tx = decodeTx(Buffer.concat([cb, Buffer.from([payload.length]), payload]), 'mainnet')
  checkTx(tx, 'rawCb')
  assert.equal(tx.txTypeName, 'cbTx')
  assert.equal(tx.payload.kind, 'raw')
  assert.equal(tx.payload.txType, 5)
})

test('errors are thrown as Errors', () => {
  assert.throws(() => decodeTx(Buffer.from([1, 2, 3]), 'mainnet'), Error)
  assert.throws(() => decodeBlock(Buffer.alloc(80), 'mainnet'), Error)
  assert.throws(() => decodeTx(Buffer.alloc(10), 'moon'), /unknown network/)
  const good = hexBytes(path.join(vectors, 'block_13b8a.hex'))
  assert.throws(() => decodeBlock(good.subarray(0, good.length - 1), 'mainnet'), Error)
})

test('every payload kind seen is declared in the typings', () => {
  for (const k of seenKinds) assert.ok(interfaces[kindToInterface(k)], `typings lack ${k}`)
  assert.ok(seenKinds.has('proRegTx') && seenKinds.has('cbTx') && seenKinds.has('qcTx'))
})
