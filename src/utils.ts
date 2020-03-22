import { StatsObject, CodecInfo } from './types/index'

/**
 * A set of methods used to parse the rtc stats
 */

function addAdditionalData (currentStats, previousStats) {
  // we need the previousStats stats to compute thse values
  if (!previousStats) return currentStats

  // audio
  currentStats.audio.local.bitrate = computeBitrate(currentStats.audio.local, previousStats.audio.local, 'bytesSent')
  currentStats.audio.local.packetRate = computeRate(currentStats.audio.local, previousStats.audio.local, 'packetsSent')

  currentStats.audio.remote.bitrate = computeBitrate(currentStats.audio.remote, previousStats.audio.remote, 'bytesReceived')
  currentStats.audio.remote.packetRate = computeRate(currentStats.audio.remote, previousStats.audio.remote, 'packetsReceived')

  // video
  currentStats.video.local.bitrate = computeBitrate(currentStats.video.local, previousStats.video.local, 'bytesSent')
  currentStats.video.local.packetRate = computeRate(currentStats.video.local, previousStats.video.local, 'packetsSent')

  currentStats.video.remote.bitrate = computeBitrate(currentStats.video.remote, previousStats.video.remote, 'bytesReceived')
  currentStats.video.remote.packetRate = computeRate(currentStats.video.remote, previousStats.video.remote, 'packetsReceived')

  return currentStats
}

function getCandidatePairInfo (candidatePair, stats) {
  if (!candidatePair || !stats) return {}

  const connection = { ...candidatePair }

  if (connection.localCandidateId) {
    const localCandidate = stats.get(connection.localCandidateId)
    connection.local = { ...localCandidate }
  }

  if (connection.remoteCandidateId) {
    const remoteCandidate = stats.get(connection.remoteCandidateId)
    connection.remote = { ...remoteCandidate }
  }

  return connection
}

// Takes two stats reports and determines the rate based on two counter readings
// and the time between them (which is in units of milliseconds).
export function computeRate (newReport: any, oldReport: any, statName: string): number {
  const newVal = newReport[statName]
  const oldVal = (oldReport) ? oldReport[statName] : null
  if (newVal === null || oldVal === null) {
    return null
  }
  return (newVal - oldVal) / (newReport.timestamp - oldReport.timestamp) * 1000
}

// Convert a byte rate to a bit rate.
export function computeBitrate (newReport: any, oldReport: any, statName: string): number {
  return computeRate(newReport, oldReport, statName) * 8
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
export function parseStats (stats: any, previousStats: StatsObject | null): StatsObject {
  // Create an object structure with all the needed stats and types that we care
  // about. This allows to map the getStats stats to other stats names.

  if (!stats) return null

  /**
   * The starting object where we will save the details from the stats report
   * @type {Object}
   */
  let statsObject = {
    audio: {
      local: {},
      remote: {}
    },
    video: {
      local: {},
      remote: {}
    },
    connection: {
      local: {},
      remote: {}
    }
  } as StatsObject

  for (const report of stats.values()) {
    switch (report.type) {
      case 'outbound-rtp': {
        const mediaType = report.mediaType || report.kind
        let local = {}
        const codecInfo = {} as CodecInfo
        if (!['audio', 'video'].includes(mediaType)) continue

        statsObject[mediaType].local = report

        if (report.remoteId) {
          local = stats.get(report.remoteId)
        } else if (report.trackId) {
          local = stats.get(report.trackId)
        }

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        statsObject[mediaType].local = { ...report, ...local, ...codecInfo }
        break
      }
      case 'inbound-rtp': {
        let mediaType = report.mediaType || report.kind
        let remote = {}
        const codecInfo = {} as CodecInfo

        // Safari is missing mediaType and kind for 'inbound-rtp'
        if (!['audio', 'video'].includes(mediaType)) {
          if (report.id.includes('Video')) mediaType = 'video'
          else if (report.id.includes('Audio')) mediaType = 'audio'
          else continue
        }

        statsObject[mediaType].remote = report

        if (report.remoteId) {
          remote = stats.get(report.remoteId)
        } else if (report.trackId) {
          remote = stats.get(report.trackId)
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

        statsObject[mediaType].remote = { ...report, ...remote, ...codecInfo }
        break
      }
      case 'peer-connection': {
        statsObject.connection.dataChannelsClosed = report.dataChannelsClosed
        statsObject.connection.dataChannelsOpened = report.dataChannelsOpened
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

  statsObject = addAdditionalData(statsObject, previousStats)

  return statsObject
}
