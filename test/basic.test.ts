import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStats, computeRate, map2obj, computePacketLossRate } from '../src/utils.ts'

/** Minimal RTCStatsReport-like map (values + get + forEach for map2obj) */
function mockStatsMap (reports: Record<string, any>) {
  const m = new Map(Object.entries(reports))
  return {
    values: () => m.values(),
    get: (id: string) => m.get(id),
    forEach: (fn: (v: any, k: any) => void) => m.forEach(fn)
  }
}

test('computeRate: byte delta per second', () => {
  const prev = { timestamp: 1000, bytesReceived: 100 }
  const next = { timestamp: 2000, bytesReceived: 600 }
  assert.equal(computeRate(next as any, prev as any, 'bytesReceived'), 500)
})

test('computeRate: null when timestamps identical (no NaN)', () => {
  const prev = { timestamp: 1000, bytesReceived: 100 }
  const next = { timestamp: 1000, bytesReceived: 200 }
  assert.equal(computeRate(next as any, prev as any, 'bytesReceived'), null)
})

test('computeRate: null when counter regressed (ICE restart / renegotiation)', () => {
  const prev = { timestamp: 1000, bytesReceived: 500 }
  const next = { timestamp: 2000, bytesReceived: 100 }
  assert.equal(computeRate(next as any, prev as any, 'bytesReceived'), null)
})

test('computeRate: tolerates BigInt-like counters via Number()', () => {
  const prev = { timestamp: 1000, bytesReceived: BigInt(100) } as any
  const next = { timestamp: 2000, bytesReceived: BigInt(600) } as any
  assert.equal(computeRate(next, prev, 'bytesReceived'), 500)
})

test('computePacketLossRate: clamps to [0, 1] and returns 0 when no loss', () => {
  const prev = { timestamp: 1000, packetsReceived: 100, packetsLost: 0 }
  const next = { timestamp: 2000, packetsReceived: 200, packetsLost: 0 }
  assert.equal(computePacketLossRate(next as any, prev as any), 0)
})

test('computePacketLossRate: fraction of dropped packets between samples', () => {
  const prev = { timestamp: 1000, packetsReceived: 100, packetsLost: 0 }
  const next = { timestamp: 2000, packetsReceived: 190, packetsLost: 10 }
  assert.equal(computePacketLossRate(next as any, prev as any), 10 / 100)
})

test('computePacketLossRate: treats small negative lost delta as zero (late arrivals)', () => {
  const prev = { timestamp: 1000, packetsReceived: 100, packetsLost: 5 }
  const next = { timestamp: 2000, packetsReceived: 200, packetsLost: 3 }
  assert.equal(computePacketLossRate(next as any, prev as any), 0)
})

test('computePacketLossRate: null with no previous sample', () => {
  const next = { timestamp: 2000, packetsReceived: 190, packetsLost: 10 }
  assert.equal(computePacketLossRate(next as any, null as any), null)
})

test('map2obj: Map to plain object', () => {
  const m = new Map<string, number>([['k', 1]])
  assert.equal((map2obj(m) as any).k, 1)
})

test('parseStats: inbound audio row + codec merge', () => {
  const inbound = {
    id: 'in-audio',
    type: 'inbound-rtp',
    timestamp: 5000,
    kind: 'audio',
    bytesReceived: 100,
    packetsReceived: 1,
    codecId: 'codec1'
  }
  const codec = {
    id: 'codec1',
    type: 'codec',
    clockRate: 48000,
    mimeType: 'audio/opus',
    payloadType: 111
  }
  const stats = mockStatsMap({ 'in-audio': inbound, codec1: codec })
  const out = parseStats(stats, null)
  assert.equal(out!.audio.inbound.length, 1)
  assert.equal(out!.audio.inbound[0].mimeType, 'audio/opus')
})

const peerConnectionReport = {
  id: 'peer',
  type: 'peer-connection',
  dataChannelsOpened: 3,
  dataChannelsClosed: 0
}
const selectedPairReports = {
  pair: {
    id: 'pair',
    type: 'candidate-pair',
    nominated: true,
    state: 'succeeded',
    localCandidateId: 'local',
    remoteCandidateId: 'remote'
  },
  local: { id: 'local', type: 'local-candidate' },
  remote: { id: 'remote', type: 'remote-candidate' },
  transport: { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }
}

test('parseStats: data-channel counters survive candidate-pair fallback', () => {
  const stats = mockStatsMap({ ...selectedPairReports, peer: peerConnectionReport })
  const { connection } = parseStats(stats, null)
  assert.equal(connection.id, 'pair')
  assert.deepEqual(connection.local, selectedPairReports.local)
  assert.deepEqual(connection.remote, selectedPairReports.remote)
  assert.equal(connection.dataChannelsOpened, 3)
  assert.equal(connection.dataChannelsClosed, 0)
})

for (const rtpType of ['inbound-rtp', 'remote-inbound-rtp']) {
  test(`parseStats: data-channel counters survive ${rtpType} candidate-pair selection in either report order`, () => {
    const rtp = { id: 'rtp', type: rtpType, kind: 'audio', transportId: 'transport' }
    const fallbackPair = { ...selectedPairReports.pair, id: 'fallbackPair' }
    const reports = [
      { peer: peerConnectionReport, rtp },
      { rtp, peer: peerConnectionReport }
    ]

    for (const reportOrder of reports) {
      const stats = mockStatsMap({ ...reportOrder, ...selectedPairReports, fallbackPair })
      const { connection } = parseStats(stats, null, { remote: true })
      assert.equal(connection.id, 'pair')
      assert.equal(connection.dataChannelsOpened, 3)
      assert.equal(connection.dataChannelsClosed, 0)
    }
  })
}

test('parseStats: bitrate on second sample (local + remote)', () => {
  const base = {
    id: 'r1',
    type: 'inbound-rtp',
    kind: 'audio',
    bytesReceived: 1000,
    packetsReceived: 10
  }
  const remoteBase = {
    id: 'r2',
    type: 'remote-inbound-rtp',
    kind: 'audio',
    bytesReceived: 100,
    packetsReceived: 1
  }
  const map1 = mockStatsMap({
    r1: { ...base, timestamp: 1000 },
    r2: { ...remoteBase, timestamp: 1000 }
  })
  const first = parseStats(map1, null, { remote: true })

  const map2 = mockStatsMap({
    r1: { ...base, timestamp: 2000, bytesReceived: 5000, packetsReceived: 50 },
    r2: { ...remoteBase, timestamp: 2000, bytesReceived: 500, packetsReceived: 5 }
  })
  const second = parseStats(map2, first, { remote: true })

  const localBr = second!.audio.inbound[0].bitrate
  assert.ok(typeof localBr === 'number' && localBr > 0, 'local inbound bitrate')

  const remoteBr = second!.remote!.audio.inbound[0].bitrate
  assert.ok(typeof remoteBr === 'number' && remoteBr > 0, 'remote inbound bitrate')
})

test('parseStats: inbound rows get packetLossRate in [0, 1] on second sample', () => {
  const base = {
    id: 'in1',
    type: 'inbound-rtp',
    kind: 'video',
    bytesReceived: 1000,
    packetsReceived: 100,
    packetsLost: 0
  }
  const first = parseStats(
    mockStatsMap({ in1: { ...base, timestamp: 1000 } }),
    null
  )
  const second = parseStats(
    mockStatsMap({
      in1: { ...base, timestamp: 2000, bytesReceived: 5000, packetsReceived: 190, packetsLost: 10 }
    }),
    first
  )
  const row = second!.video.inbound[0]
  assert.ok(row.packetLossRate != null, 'packetLossRate is computed')
  assert.ok(row.packetLossRate! >= 0 && row.packetLossRate! <= 1, 'packetLossRate is within [0, 1]')
  assert.equal(row.packetLossRate, 10 / 100)
})
