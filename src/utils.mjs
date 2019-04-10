/**
 * A set of methods used to parse the rtc stats
 */

// Takes two stats reports and determines the rate based on two counter readings
// and the time between them (which is in units of milliseconds).
export function computeRate (newReport, oldReport, statName) {
  var newVal = newReport[statName]
  var oldVal = (oldReport) ? oldReport[statName] : null
  if (newVal === null || oldVal === null) {
    return null
  }
  return (newVal - oldVal) / (newReport.timestamp - oldReport.timestamp) * 1000
}

// Convert a byte rate to a bit rate.
export function computeBitrate (newReport, oldReport, statName) {
  return computeRate(newReport, oldReport, statName) * 8
}

export function map2obj (stats) {
  if (!stats.entries) {
    return stats
  }
  var o = {}
  stats.forEach(function (v, k) {
    o[k] = v
  })
  return o
}

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

// Enumerates the new standard compliant stats using local and remote track ids.
export function parseStats (stats, previousStats) {
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
  }

  for (const report of stats.values()) {
    // ignore all remote reports
    if (report.isRemote) continue

    switch (report.type) {
      case 'outbound-rtp': {
        let mediaType = report.mediaType || report.kind
        let remote = {}
        let codecInfo = {}
        if (!['audio', 'video'].includes(mediaType)) continue

        statsObject[mediaType].local = report

        if (report.remoteId) {
          remote = stats.get(report.remoteId)
        } else if (report.trackId) {
          remote = stats.get(report.trackId)
        }

        if (report.codecId) {
          let codec = stats.get(report.codecId)
          if (!codec) continue
          codecInfo.clockRate = codec.clockRate
          codecInfo.mimeType = codec.mimeType
          codecInfo.payloadType = codec.payloadType
        }

        statsObject[mediaType].local = {...report, ...remote, ...codecInfo}

        // delete statsObject[mediaType].local.id
        // delete statsObject[mediaType].local.type
        break
      }
      case 'inbound-rtp':
        let mediaType = report.mediaType || report.kind
        let remote = {}
        let codecInfo = {}

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
          let codec = stats.get(report.codecId)
          if (!codec) continue
          codecInfo.clockRate = codec.clockRate
          codecInfo.mimeType = codec.mimeType
          codecInfo.payloadType = codec.payloadType
        }

        statsObject[mediaType].local = {...report, ...remote, ...codecInfo}

        // delete statsObject[mediaType].remote.id
        // delete statsObject[mediaType].remote.type
        break
      case 'candidate-pair': {
        statsObject.connection = {...report}

        if (statsObject.connection.localCandidateId) {
          let localCandidate = stats.get(statsObject.connection.localCandidateId)
          statsObject.connection.local = {...localCandidate}
          // statsObject.connection.localIp = localCandidate.ip
          // statsObject.connection.localPort = localCandidate.port
          // statsObject.connection.localPriority = localCandidate.priority
          // statsObject.connection.localProtocol = localCandidate.protocol
          // statsObject.connection.localType = localCandidate.candidateType
          // statsObject.connection.networkType = localCandidate.networkType
        }

        if (statsObject.connection.remoteCandidateId) {
          let remoteCandidate = stats.get(statsObject.connection.localCandidateId)
          statsObject.connection.remote = {...remoteCandidate}
          // statsObject.connection.remoteIp = remoteCandidate.ip
          // statsObject.connection.remotePort = remoteCandidate.port
          // statsObject.connection.remotePriority = remoteCandidate.priority
          // statsObject.connection.remoteProtocol = remoteCandidate.protocol
          // statsObject.connection.remoteType = remoteCandidate.candidateType
        }

        break
      }
      case 'peer-connection':
        statsObject.connection.dataChannelsClosed = report.dataChannelsClosed
        statsObject.connection.dataChannelsOpened = report.dataChannelsOpened
        break
      default:
    }
  }

  statsObject = addAdditionalData(statsObject, previousStats)

  return statsObject
}
