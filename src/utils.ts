import {StatsObject, CodecInfo, TrackReport, ParseStatsOptions} from './types/index'

/**
 * A set of methods used to parse the rtc stats
 */

/** Inbound/outbound RTP rows: add bitrate + packetRate from delta vs previous sample */
function addDerivedRatesForMedia (
  current: StatsObject['audio'],
  previous: StatsObject['audio']
): void {
  current.inbound.forEach((report) => {
    const prev = previous.inbound.find(r => r.id === report.id)
    report.bitrate = computeBitrate(report, prev, 'bytesReceived')
    report.packetRate = computeRate(report, prev, 'packetsReceived')
    report.packetLossRate = computePacketLossRate(report, prev)
  })
  current.outbound.forEach((report) => {
    const prev = previous.outbound.find(r => r.id === report.id)
    report.bitrate = computeBitrate(report, prev, 'bytesSent')
    report.packetRate = computeRate(report, prev, 'packetsSent')
  })
}

function addAdditionalData (currentStats: StatsObject, previousStats?: StatsObject) {
  if (!previousStats) return currentStats

  addDerivedRatesForMedia(currentStats.audio, previousStats.audio)
  addDerivedRatesForMedia(currentStats.video, previousStats.video)

  if (currentStats.remote && previousStats.remote) {
    addDerivedRatesForMedia(currentStats.remote.audio, previousStats.remote.audio)
    addDerivedRatesForMedia(currentStats.remote.video, previousStats.remote.video)
  }

  return currentStats
}

function getCandidatePairInfo (candidatePair, stats) {
  if (!candidatePair || !stats) return {}

  const connection = {...candidatePair}

  if (connection.localCandidateId) {
    const localCandidate = stats.get(connection.localCandidateId)
    connection.local = {...localCandidate}
  }

  if (connection.remoteCandidateId) {
    const remoteCandidate = stats.get(connection.remoteCandidateId)
    connection.remote = {...remoteCandidate}
  }

  return connection
}

/**
 * Rate per second between two counter readings in two stats reports.
 *
 * Returns `null` (never `NaN`) when:
 *  - `oldReport` is missing (first sample),
 *  - either counter is missing or non-numeric,
 *  - the timestamp delta is zero or negative (stale / duplicated samples),
 *  - the counter regressed (ICE restart, renegotiation, clock skew) — a negative
 *    rate would be misleading.
 *
 * Counters are cast via `Number(...)` so future browsers returning `BigInt`
 * (spec: unsigned long long) do not throw inside the subtraction.
 */
export function computeRate (newReport: TrackReport, oldReport: TrackReport, statName: string): number | null {
  if (!oldReport) return null
  const newVal = newReport[statName]
  const oldVal = oldReport[statName]
  if (newVal == null || oldVal == null) return null
  const n = Number(newVal)
  const o = Number(oldVal)
  if (Number.isNaN(n) || Number.isNaN(o)) return null
  const dt = newReport.timestamp - oldReport.timestamp
  if (!(dt > 0)) return null
  const delta = n - o
  if (delta < 0) return null
  return (delta / dt) * 1000
}

// Convert a byte rate to a bit rate.
export function computeBitrate (newReport: TrackReport, oldReport: TrackReport, statName: string): number | null {
  const rate = computeRate(newReport, oldReport, statName)
  if (rate == null) return null
  return rate * 8
}

/**
 * Fraction of inbound RTP packets lost between samples, clamped to [0, 1].
 * Returns `null` if we can't compute it safely (no previous sample, missing
 * counters, regressed counters, or zero denominator).
 */
export function computePacketLossRate (newReport: TrackReport, oldReport: TrackReport): number | null {
  if (!oldReport) return null
  const lostNow = newReport['packetsLost']
  const lostPrev = oldReport['packetsLost']
  const recvNow = newReport['packetsReceived']
  const recvPrev = oldReport['packetsReceived']
  if (lostNow == null || lostPrev == null || recvNow == null || recvPrev == null) return null

  const ln = Number(lostNow)
  const lp = Number(lostPrev)
  const rn = Number(recvNow)
  const rp = Number(recvPrev)
  if ([ln, lp, rn, rp].some(v => Number.isNaN(v))) return null

  const lostDelta = ln - lp
  const recvDelta = rn - rp
  // Packets late-arriving can briefly make lost delta negative (spec-allowed); treat as zero.
  const lost = lostDelta > 0 ? lostDelta : 0
  if (recvDelta < 0) return null
  const total = recvDelta + lost
  if (total <= 0) return null
  const rate = lost / total
  if (rate < 0) return 0
  if (rate > 1) return 1
  return rate
}

export function map2obj (stats: any) {
  if (!stats.entries) {
    return stats
  }
  const o = {}
  stats.forEach(function (v, k) {
    o[k] = v
  })
  return o
}

// Enumerates the new standard compliant stats using local and remote track ids.
export function parseStats (stats: any, previousStats: StatsObject | null, options: ParseStatsOptions | null = {}): StatsObject {
  // Create an object structure with all the needed stats and types that we care
  // about. This allows to map the getStats stats to other stats names.

  if (!stats) return null

  /**
   * The starting object where we will save the details from the stats report
   * @type {Object}
   */
  let statsObject = {
    audio: {
      inbound: [],
      outbound: []
    },
    video: {
      inbound: [],
      outbound: []
    },
    connection: {
      inbound: [],
      outbound: []
    }
  } as StatsObject

  // if we want to collect remote data also
  if (options.remote) {
    statsObject.remote = {
      audio:{
        inbound: [],
        outbound: []
      },
      video:{
        inbound: [],
        outbound: []
      }
    }
  }

  let peerConnectionReport: { dataChannelsClosed?: number, dataChannelsOpened?: number } | undefined
  for (const report of stats.values()) {
    switch (report.type) {
      case 'outbound-rtp': {
        let outbound = {}
        const mediaType = report.mediaType || report.kind
        const codecInfo = {} as CodecInfo
        let trackData = {}
        if (!['audio', 'video'].includes(mediaType)) continue

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        trackData = stats.get(report.mediaSourceId) || stats.get(report.trackId) || {}

        statsObject[mediaType].outbound.push({...report, ...codecInfo, track: {...trackData}})
        break
      }
      case 'inbound-rtp': {
        let inbound = {}
        let mediaType = report.mediaType || report.kind
        let trackData = {}
        const codecInfo = {} as CodecInfo

        // Safari is missing mediaType and kind for 'inbound-rtp'
        if (!['audio', 'video'].includes(mediaType)) {
          if (report.id.includes('Video')) mediaType = 'video'
          else if (report.id.includes('Audio')) mediaType = 'audio'
          else continue
        }

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        // if we don't have connection details already saved
        // and the transportId is present (most likely chrome)
        // get the details from the candidate-pair
        if (!statsObject.connection.id && report.transportId) {
          const transport = stats.get(report.transportId)
          if (transport && transport.selectedCandidatePairId) {
            const candidatePair = stats.get(transport.selectedCandidatePairId)
            statsObject.connection = getCandidatePairInfo(candidatePair, stats)
          }
        }

        trackData = stats.get(report.mediaSourceId) || stats.get(report.trackId) || {}

        statsObject[mediaType].inbound.push({...report, ...codecInfo, track: {...trackData}})
        break
      }
      case 'peer-connection': {
        peerConnectionReport = report
        break
      }
      case 'remote-inbound-rtp': {
        if(!options.remote) break
        let inbound = {}
        let mediaType = report.mediaType || report.kind
        const codecInfo = {} as CodecInfo

        // Safari is missing mediaType and kind for 'inbound-rtp'
        if (!['audio', 'video'].includes(mediaType)) {
          if (report.id.includes('Video')) mediaType = 'video'
          else if (report.id.includes('Audio')) mediaType = 'audio'
          else continue
        }

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        // if we don't have connection details already saved
        // and the transportId is present (most likely chrome)
        // get the details from the candidate-pair
        if (!statsObject.connection.id && report.transportId) {
          const transport = stats.get(report.transportId)
          if (transport && transport.selectedCandidatePairId) {
            const candidatePair = stats.get(transport.selectedCandidatePairId)
            statsObject.connection = getCandidatePairInfo(candidatePair, stats)
          }
        }

        statsObject.remote[mediaType].inbound.push({...report, ...codecInfo})
        break
      }
      case 'remote-outbound-rtp': {
        if(!options.remote) break
        let outbound = {}
        const mediaType = report.mediaType || report.kind
        const codecInfo = {} as CodecInfo
        if (!['audio', 'video'].includes(mediaType)) continue

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        statsObject.remote[mediaType].outbound.push({...report, ...codecInfo})
        break
      }
      default:
    }
  }

  // if we didn't find a candidate-pair while going through inbound-rtp
  // look for it again
  if (!statsObject.connection.id) {
    for (const report of stats.values()) {
      // select the current active candidate-pair report
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        statsObject.connection = getCandidatePairInfo(report, stats)
      }
    }
  }

  // Candidate-pair selection can replace the connection object.
  if (peerConnectionReport) {
    statsObject.connection.dataChannelsClosed = peerConnectionReport.dataChannelsClosed
    statsObject.connection.dataChannelsOpened = peerConnectionReport.dataChannelsOpened
  }

  statsObject = addAdditionalData(statsObject, previousStats)

  return statsObject
}
