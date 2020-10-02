import {StatsObject, CodecInfo, ParseStatsOptions} from './types/index'

/**
 * A set of methods used to parse the rtc stats
 */

function addAdditionalData (currentStats, previousStats) {
  // we need the previousStats stats to compute thse values
  if (!previousStats) return currentStats

  // audio
  for (const id in currentStats.audio.outbound) {
    currentStats.audio.outbound[id].bitrate = computeBitrate(currentStats.audio.outbound[id], previousStats.audio.outbound[id], 'bytesSent')
    currentStats.audio.outbound[id].packetRate = computeRate(currentStats.audio.outbound[id], previousStats.audio.outbound[id], 'packetsSent')
  }

  for (const id in currentStats.audio.inbound) {
    currentStats.audio.inbound[id].bitrate = computeBitrate(currentStats.audio.inbound[id], previousStats.audio.inbound[id], 'bytesReceived')
    currentStats.audio.inbound[id].packetRate = computeRate(currentStats.audio.inbound[id], previousStats.audio.inbound[id], 'packetsReceived')
  }

  // video
  for (const id in currentStats.video.outbound) {
    currentStats.video.outbound[id].bitrate = computeBitrate(currentStats.video.outbound[id], previousStats.video.outbound[id], 'bytesSent')
    currentStats.video.outbound[id].packetRate = computeRate(currentStats.video.outbound[id], previousStats.video.outbound[id], 'packetsSent')
  }

  for (const id in currentStats.video.inbound) {
    currentStats.video.inbound[id].bitrate = computeBitrate(currentStats.video.inbound[id], previousStats.video.inbound[id], 'bytesReceived')
    currentStats.video.inbound[id].packetRate = computeRate(currentStats.video.inbound[id], previousStats.video.inbound[id], 'packetsReceived')
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
export function parseStats (stats: any, previousStats: StatsObject | null, opts?: ParseStatsOptions | null): StatsObject {
  // Create an object structure with all the needed stats and types that we care
  // about. This allows to map the getStats stats to other stats names.

  if (!stats) return null

  const options = opts?opts:{}

  /**
   * The starting object where we will save the details from the stats report
   * @type {Object}
   */
  let statsObject = {
    audio: {
      inbound: {},
      outbound: {}
    },
    video: {
      inbound: {},
      outbound: {}
    },
    connection: {
      inbound: {},
      outbound: {},
    },
    remote: {     // TODO dynamically add later???
      audio:{
        inbound:{},
        outbound: {}
      },
      video:{
        inbound: {},
        outbound: {}
      }
    }
  } as StatsObject
  for (const report of stats.values()) {
    // TODO remove duplicate code remote vs local rtp. Only the place where we save is different.
    switch (report.type) {
      case 'outbound-rtp': {
        const mediaType = report.mediaType || report.kind
        let outbound = {}
        const codecInfo = {} as CodecInfo
        if (!['audio', 'video'].includes(mediaType)) continue

        // TODO why set here if it's set at the end?
        // statsObject[mediaType].outbound[report.id] = report

        if (report.remoteId) {
          outbound = stats.get(report.remoteId)
        } else if (report.trackId) {
          outbound = stats.get(report.trackId)
        }

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        statsObject[mediaType].outbound[report.id] = {...report, ...outbound, ...codecInfo}
        break
      }
      case 'inbound-rtp': {
        let mediaType = report.mediaType || report.kind
        let inbound = {}
        const codecInfo = {} as CodecInfo

        // Safari is missing mediaType and kind for 'inbound-rtp'
        if (!['audio', 'video'].includes(mediaType)) {
          if (report.id.includes('Video')) mediaType = 'video'
          else if (report.id.includes('Audio')) mediaType = 'audio'
          else continue
        }
        // TODO any reason to leave this here?
        // statsObject[mediaType].remote = report

        if (report.remoteId) {
          inbound = stats.get(report.remoteId)
        } else if (report.trackId) {
          inbound = stats.get(report.trackId)
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

        statsObject[mediaType].inbound[report.id] = {...report, ...inbound, ...codecInfo}
        break
      }
      case 'peer-connection': {
        statsObject.connection.dataChannelsClosed = report.dataChannelsClosed
        statsObject.connection.dataChannelsOpened = report.dataChannelsOpened
        break
      }
      case 'remote-inbound-rtp': {
        if(!options.remote) break
        let mediaType = report.mediaType || report.kind
        let inbound = {}
        const codecInfo = {} as CodecInfo

        // Safari is missing mediaType and kind for 'inbound-rtp'
        if (!['audio', 'video'].includes(mediaType)) {
          if (report.id.includes('Video')) mediaType = 'video'
          else if (report.id.includes('Audio')) mediaType = 'audio'
          else continue
        }
        // TODO any reason to leave this here?
        // statsObject[mediaType].remote = report

        if (report.remoteId) {
          inbound = stats.get(report.remoteId)
        } else if (report.trackId) {
          inbound = stats.get(report.trackId)
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

        statsObject.remote[mediaType].inbound[report.id] = {...report, ...inbound, ...codecInfo}
        break
      }
      case 'remote-outbound-rtp': {
        if(!options.remote) break
        const mediaType = report.mediaType || report.kind
        let outbound = {}
        const codecInfo = {} as CodecInfo
        if (!['audio', 'video'].includes(mediaType)) continue

        // TODO why set here if it's set at the end?
        // statsObject[mediaType].outbound[report.id] = report

        if (report.remoteId) {
          outbound = stats.get(report.remoteId)
        } else if (report.trackId) {
          outbound = stats.get(report.trackId)
        }

        if (report.codecId) {
          const codec = stats.get(report.codecId)
          if (codec) {
            codecInfo.clockRate = codec.clockRate
            codecInfo.mimeType = codec.mimeType
            codecInfo.payloadType = codec.payloadType
          }
        }

        statsObject.remote[mediaType].outbound[report.id] = {...report, ...outbound, ...codecInfo}
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
