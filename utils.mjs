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
export function enumerateStats (stats, trackIds, previousStats) {
  // Create an object structure with all the needed stats and types that we care
  // about. This allows to map the getStats stats to other stats names.

  let localTrackIds = trackIds.localTrackIds
  let remoteTrackIds = trackIds.remoteTrackIds

  let commonAudio = {
    // flag the signals that we found the stats for this track
    _hasStats: false,
    audioLevel: 0.0,
    clockRate: 0,
    codecId: '',
    payloadType: 0,
    timestamp: 0.0,
    trackId: '',
    transportId: '',
    mimeType: ''
  }

  let comonVideo = {
    _hasStats: false,
    clockRate: 0,
    codecId: '',
    firCount: 0,
    frameHeight: 0,
    frameWidth: 0,
    nackCount: 0,
    payloadType: 0,
    pliCount: 0,
    qpSum: 0,
    timestamp: 0.0,
    trackId: '',
    transportId: ''
  }

  let statsObject = {
    audio: {
      local: {
        bytesSent: 0,
        packetsSent: 0,
        ...commonAudio
      },
      remote: {
        bytesReceived: 0,
        fractionLost: 0,
        jitter: 0,
        packetsLost: 0,
        packetsReceived: 0,
        ...commonAudio
      }
    },
    video: {
      local: {
        bytesSent: 0,
        framesEncoded: 0,
        framesSent: 0,
        packetsSent: 0,
        ...comonVideo
      },
      remote: {
        bytesReceived: 0,
        fractionLost: 0,
        framesDecoded: 0,
        framesDropped: 0,
        framesReceived: 0,
        packetsLost: 0,
        packetsReceived: 0,
        ...comonVideo
      }
    },
    connection: {
      _hasStats: false,
      availableOutgoingBitrate: 0,
      bytesReceived: 0,
      bytesSent: 0,
      consentRequestsSent: 0,
      currentRoundTripTime: 0.0,
      localCandidateId: '',
      localCandidateType: '',
      localIp: '',
      localPort: 0,
      localPriority: 0,
      localProtocol: '',
      // values: https://www.w3.org/TR/webrtc-stats/#dom-rtcnetworktype
      networkType: '',
      remoteCandidateId: '',
      remoteCandidateType: '',
      remoteIp: '',
      remotePort: 0,
      remotePriority: 0,
      remoteProtocol: '',
      requestsReceived: 0,
      requestsSent: 0,
      responsesReceived: 0,
      responsesSent: 0,
      timestamp: 0.0,
      totalRoundTripTime: 0.0
    }
  }

  if (stats) {
    for (let key in stats) {
      let report = stats[key]

      switch (report.type) {
        case 'outbound-rtp':
          if ('trackId' in report) {
            let aux = stats[report.trackId]
            if (aux.trackIdentifier.indexOf(localTrackIds.audio) !== -1) {
              statsObject.audio.local.bytesSent = report.bytesSent
              statsObject.audio.local.codecId = report.codecId
              statsObject.audio.local.packetsSent = report.packetsSent
              statsObject.audio.local.timestamp = report.timestamp
              statsObject.audio.local.trackId = report.trackId
              statsObject.audio.local.transportId = report.transportId

              statsObject.audio.local._hasStats = true
            }

            if (aux.trackIdentifier.indexOf(localTrackIds.video) !== -1) {
              statsObject.video.local.bytesSent = report.bytesSent
              statsObject.video.local.codecId = report.codecId
              statsObject.video.local.firCount = report.firCount
              statsObject.video.local.framesEncoded = report.frameEncoded
              statsObject.video.local.framesSent = report.framesSent
              statsObject.video.local.packetsSent = report.packetsSent
              statsObject.video.local.pliCount = report.pliCount
              statsObject.video.local.qpSum = report.qpSum
              statsObject.video.local.timestamp = report.timestamp
              statsObject.video.local.trackId = report.trackId
              statsObject.video.local.transportId = report.transportId

              statsObject.video.local._hasStats = true
            }
          }
          break
        case 'inbound-rtp':
          if ('trackId' in report) {
            let aux = stats[report.trackId]
            if (aux.trackIdentifier === remoteTrackIds.audio) {
              statsObject.audio.remote.bytesReceived = report.bytesReceived
              statsObject.audio.remote.codecId = report.codecId
              statsObject.audio.remote.fractionLost = report.fractionLost
              statsObject.audio.remote.jitter = report.jitter
              statsObject.audio.remote.packetsLost = report.packetsLost
              statsObject.audio.remote.packetsReceived = report.packetsReceived
              statsObject.audio.remote.timestamp = report.timestamp
              statsObject.audio.remote.trackId = report.trackId
              statsObject.audio.remote.transportId = report.transportId

              statsObject.audio.remote._hasStats = true
            }

            if (aux.trackIdentifier === remoteTrackIds.video) {
              statsObject.video.remote.bytesReceived = report.bytesReceived
              statsObject.video.remote.codecId = report.codecId
              statsObject.video.remote.firCount = report.firCount
              statsObject.video.remote.fractionLost = report.fractionLost
              statsObject.video.remote.nackCount = report.nackCount
              statsObject.video.remote.packetsLost = report.patsLost
              statsObject.video.remote.packetsReceived = report.packetsReceived
              statsObject.video.remote.pliCount = report.pliCount
              statsObject.video.remote.qpSum = report.qpSum
              statsObject.video.remote.timestamp = report.timestamp
              statsObject.video.remote.trackId = report.trackId
              statsObject.video.remote.transportId = report.transportId

              statsObject.video.remote._hasStats = true
            }
          }
          break
        case 'candidate-pair':
          if (report.hasOwnProperty('availableOutgoingBitrate')) {
            statsObject.connection.availableOutgoingBitrate = report.availableOutgoingBitrate
            statsObject.connection.bytesReceived = report.bytesReceived
            statsObject.connection.bytesSent = report.bytesSent
            statsObject.connection.consentRequestsSent = report.consentRequestsSent
            statsObject.connection.currentRoundTripTime = report.currentRoundTripTime
            statsObject.connection.localCandidateId = report.localCandidateId
            statsObject.connection.remoteCandidateId = report.remoteCandidateId
            statsObject.connection.requestsReceived = report.requestsReceived
            statsObject.connection.requestsSent = report.requestsSent
            statsObject.connection.responsesReceived = report.responsesReceived
            statsObject.connection.responsesSent = report.responsesSent
            statsObject.connection.timestamp = report.timestamp
            statsObject.connection.totalRoundTripTime = report.totalRoundTripTime

            statsObject.connection._hasStats = true
          }
          break
        default:
      }
    }

    for (let key in stats) {
      let report = stats[key]
      switch (report.type) {
        case 'track':
          if (report.hasOwnProperty('trackIdentifier')) {
            if (report.trackIdentifier.indexOf(localTrackIds.video) !== -1) {
              statsObject.video.local.frameHeight = report.frameHeight
              statsObject.video.local.framesSent = report.framesSent
              statsObject.video.local.frameWidth = report.frameWidth
            }
            if (report.trackIdentifier.indexOf(remoteTrackIds.video) !== -1) {
              statsObject.video.remote.frameHeight = report.frameHeight
              statsObject.video.remote.framesDecoded = report.framesDecoded
              statsObject.video.remote.framesDropped = report.framesDropped
              statsObject.video.remote.framesReceived = report.framesReceived
              statsObject.video.remote.frameWidth = report.frameWidth
            }
            if (report.trackIdentifier.indexOf(localTrackIds.audio) !== -1) {
              statsObject.audio.local.audioLevel = report.audioLevel
            }
            if (report.trackIdentifier.indexOf(remoteTrackIds.audio) !== -1) {
              statsObject.audio.remote.audioLevel = report.audioLevel
            }
          }
          break
        case 'codec':
          if (report.hasOwnProperty('id')) {
            if (report.id.indexOf(statsObject.audio.local.codecId) !== -1) {
              statsObject.audio.local.clockRate = report.clockRate
              statsObject.audio.local.mimeType = report.mimeType
              statsObject.audio.local.payloadType = report.payloadType
            }
            if (report.id.indexOf(statsObject.audio.remote.codecId) !== -1) {
              statsObject.audio.remote.clockRate = report.clockRate
              statsObject.audio.remote.mimeType = report.mimeType
              statsObject.audio.remote.payloadType = report.payloadType
            }
            if (report.id.indexOf(statsObject.video.local.codecId) !== -1) {
              statsObject.video.local.clockRate = report.clockRate
              statsObject.video.local.mimeType = report.mimeType
              statsObject.video.local.payloadType = report.payloadType
            }
            if (report.id.indexOf(statsObject.video.remote.codecId) !== -1) {
              statsObject.video.remote.clockRate = report.clockRate
              statsObject.video.remote.mimeType = report.mimeType
              statsObject.video.remote.payloadType = report.payloadType
            }
          }
          break
        case 'local-candidate':
          if (report.hasOwnProperty('id')) {
            if (report.id.indexOf(statsObject.connection.localCandidateId) !== -1) {
              statsObject.connection.localIp = report.ip
              statsObject.connection.localPort = report.port
              statsObject.connection.localPriority = report.priority
              statsObject.connection.localProtocol = report.protocol
              statsObject.connection.localType = report.candidateType
              statsObject.connection.networkType = report.networkType
            }
          }
          break
        case 'remote-candidate':
          if (report.hasOwnProperty('id')) {
            if (report.id.indexOf(statsObject.connection.remoteCandidateId) !== -1) {
              statsObject.connection.remoteIp = report.ip
              statsObject.connection.remotePort = report.port
              statsObject.connection.remotePriority = report.priority
              statsObject.connection.remoteProtocol = report.protocol
              statsObject.connection.remoteType = report.candidateType
            }
          }
          break
        default:
      }
    }
  }

  statsObject = addAdditionalData(statsObject, previousStats)

  return statsObject
}
