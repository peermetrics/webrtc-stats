
import { enumerateStats, map2obj } from './utils.mjs'
import EventEmitter from 'events'

const legacyMethodsPrefixes = ['', 'moz', 'webkit']

let trace = console.log

export class WebRTCStats extends EventEmitter {
  constructor (options = {}) {
    super()

    // check if browser
    // check if webrtc compatible

    // only work in the browser
    if (typeof window === 'undefined') {
      return null
    }

    this.localStream = null

    // internal settings
    this.prefixesToWrap = legacyMethodsPrefixes
    this.wrtc = {
      RTCPeerConnection: window.RTCPeerConnection
    }

    // TODO: remove this
    this.isEdge = !!window.RTCIceGatherer

    this.getStatsInterval = options.getStatsInterval || 1000
    this.statsMonitoring = options.statsMonitoring || false
    this.monitoringInterval = null
    this.compressStats = false

    this.parsedStats = options.parsedStats || false
    this.filteredStats = options.parsedStats || false
    this.rawStats = options.rawStats || false
    this.wrapLegacyMethods = options.wrapLegacyMethods || false

    this._peersToMonitor = {}

    /**
     * Used to keep track of all the events
     * @type {Array}
     */
    this._timeline = []

    /**
     * A list of stats to look after
     * @type {Array}
     */
    this._statsToMonitor = [
      'inbound-rtp',
      'outbound-rtp',
      'remote-inbound-rtp',
      'remote-outbound-rtp',
      'peer-connection',
      'data-channel',
      'stream',
      'track',
      'sender',
      'receiver',
      'transport',
      'candidate-pair',
      'local-candidate',
      'remote-candidate'
    ]

    // add event listeners for getUserMedia
    this.wrapGetUserMedia({
      wrapLegacyMethods: this.wrapLegacyMethods
    })

    this.wrapRTCPeerConnection()
  }

  get timeline () {
    return this._timeline
  }

  wrapGetUserMedia (options = {}) {
    // var self = this

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return

    let origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

    let getUserMediaCallback = this.parseGetUserMedia.bind(this)
    let gum = function () {
      getUserMediaCallback({arguments: arguments[0]})

      return origGetUserMedia.apply(navigator.mediaDevices, arguments)
        .then((stream) => {
          // self.localStream = stream
          getUserMediaCallback({stream: stream})
          return stream
        }, (err) => {
          getUserMediaCallback({error: err})
          return Promise.reject(err)
        })
    }

    // replace the native method
    navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices)

    if (options.wrapLegacyMethods) {
      this._wrapLegacyGetUserMedia()
    }
  }

  _wrapLegacyGetUserMedia () {
    this.prefixesToWrap.forEach((prefix) => {
      let eventObject = {
        legacy: true
      }

      let getUserMediaCallback = this.parseGetUserMedia.bind(this)
      let name = prefix + (prefix.length ? 'GetUserMedia' : 'getUserMedia')
      if (!navigator[name]) return

      let origGetUserMedia = navigator[name].bind(navigator)
      let gum = () => {
        getUserMediaCallback({arguments: arguments[0], ...eventObject})
        let cb = arguments[1]
        let eb = arguments[2]

        origGetUserMedia(arguments[0],
          (stream) => {
            getUserMediaCallback({
              stream: stream,
              ...eventObject
            })

            if (cb) {
              cb(stream)
            }
          },
          (err) => {
            getUserMediaCallback({
              error: err,
              ...eventObject
            })

            if (eb) {
              eb(err)
            }
          }
        )
      }

      navigator[name] = gum.bind(navigator)
    })
  }

  // TODO
  wrapGetDisplayMedia () {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      let origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
      let gdm = function () {
        trace('navigator.mediaDevices.getDisplayMedia', null, arguments[0])
        return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
          .then(function (stream) {
            trace('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
            return stream
          }, function (err) {
            trace('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name)
            return Promise.reject(err)
          })
      }
      navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices)
    }
  }

  wrapRTCPeerConnection () {
    var self = this
    let nativeRTCPeerConnection = this.wrtc.RTCPeerConnection;

    ['createDataChannel', 'close'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          self.addToTimeline({
            event: method,
            tag: method === 'close' ? 'ice' : 'datachannel',
            peerId: this.__rtcStatsId,
            data: arguments
          })
          return nativeMethod.apply(this, arguments)
        }
      }
    });

    ['addStream', 'removeStream'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          self.addToTimeline({
            event: method,
            tag: 'stream',
            peerId: this.__rtcStatsId,
            stream: arguments[0]
          })
          return nativeMethod.apply(this, arguments)
        }
      }
    });

    ['addTrack'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          var track = arguments[0]
          var streams = [].slice.call(arguments, 1)
          self.addToTimeline({
            event: method,
            tag: 'track',
            peerId: this.__rtcStatsId,
            track: track,
            streams: streams
          })
          return nativeMethod.apply(this, arguments)
        }
      }
    });

    ['removeTrack'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          var track = arguments[0].track
          self.addToTimeline({
            event: method,
            tag: 'track',
            peerId: this.__rtcStatsId,
            track: track
          })
          return nativeMethod.apply(this, arguments)
        }
      }
    });

    ['createOffer', 'createAnswer'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          var rtcStatsId = this.__rtcStatsId
          var args = arguments
          var opts
          if (arguments.length === 1 && typeof arguments[0] === 'object') {
            opts = arguments[0]
          } else if (arguments.length === 3 && typeof arguments[2] === 'object') {
            opts = arguments[2]
          }
          self.addToTimeline({
            event: method,
            tag: 'sdp',
            peerId: this.__rtcStatsId,
            data: opts
          })

          return nativeMethod.apply(this, opts ? [opts] : undefined)
            .then((description) => {
              self.addToTimeline({
                event: method + 'OnSuccess',
                tag: 'sdp',
                peerId: this.__rtcStatsId,
                data: description
              })
              if (args.length > 0 && typeof args[0] === 'function') {
                args[0].apply(null, [description])
                return undefined
              }
              return description
            }).catch((err) => {
              self.addToTimeline({
                event: method + 'OnFailure',
                tag: 'sdp',
                peerId: rtcStatsId,
                error: err
              })
              if (args.length > 1 && typeof args[1] === 'function') {
                args[1].apply(null, [err])
                return
              }
              throw err
            })
        }
      }
    });

    ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          var rtcStatsId = this.__rtcStatsId
          let tag = method === 'addIceCandidate' ? 'ice' : 'sdp'
          var args = arguments
          self.addToTimeline({
            event: method,
            tag: tag,
            peerId: this.__rtcStatsId,
            data: args[0]
          })

          return nativeMethod.apply(this, [args[0]])
            .then(function () {
              self.addToTimeline({
                event: method + 'OnSuccess',
                tag: tag,
                peerId: rtcStatsId
                // data: args[0]
              })
              if (args.length >= 2 && typeof args[1] === 'function') {
                args[1].apply(null, [])
                return undefined
              }
              return undefined
            }).catch(function (err) {
              self.addToTimeline({
                event: method + 'OnFailure',
                tag: tag,
                peerId: rtcStatsId,
                error: err
                // data: args[0]
              })
              if (args.length >= 3 && typeof args[2] === 'function') {
                args[2].apply(null, [err])
                return undefined
              }
              throw err
            })
        }
      }
    })
  }

  /**
   * Start tracking connection with a peer
   * @param {Object} options The options object
   *
   *
   * Events:
   * peerAdded
   * startNegociation
   * startSDPNegociation
   * finishedSDPNegociation
   * startIceNegociation
   * finishedIceNegociation
   * finishedNegociation
   * peerConnected
   * streamAdded
   *
   */
  addPeer (options) {
    // get the peer connection
    let pc = options.pc

    if (!pc || !(pc instanceof this.wrtc.RTCPeerConnection)) {
      return
    }

    if (!options.peerId) {
      throw new Error('Missing argument peerId')
    }

    if (this.isEdge) {
      throw new Error('Can\'t monitor this peer')
    }

    let id = options.peerId
    pc.__rtcStatsId = id

    let config = pc.getConfiguration()

    // don't log credentials
    if (config.iceServers) {
      config.iceServers.forEach(function (server) {
        delete server.credential
      })
    }

    this.addToTimeline({
      event: 'addPeer',
      tag: 'peer',
      data: {
        options: options,
        peerConfiguration: config
      }
    })

    // TODO: do we want to log constraints here? They are chrome-proprietary.
    // http://stackoverflow.com/questions/31003928/what-do-each-of-these-experimental-goog-rtcpeerconnectionconstraints-do
    // if (constraints) {
    //   trace('constraints', id, constraints);
    // }

    let startMonitoring = typeof options.statsMonitoring !== 'undefined' ? options.statsMonitoring : this.statsMonitoring
    if (startMonitoring) {
      this.monitorPeer(pc)
    }
  }

  monitorPeer (pc) {
    if (!pc) return

    // keep this in an object to avoid duplicates
    this._peersToMonitor[pc.__rtcStatsId] = {
      pc: pc,
      stream: null,
      stats: {
        // keep a reference of the current stat
        parsed: null,
        raw: null
      }
    }

    this.addPeerConnectionEventListeners(pc)

    // start monitoring from the first peer added
    if (Object.keys(this._peersToMonitor).length === 1) {
      this.startMonitoring()
    }
  }

  /**
   * Used to start the setTimeout and request getStats from the peers
   *
   * configs used
   * monitoringInterval
   * getStatsInterval
   * promBased
   * _peersToMonitor
   * compressStats
   */
  startMonitoring () {
    if (this.monitoringInterval) return

    this.monitoringInterval = window.setInterval(() => {
      // if we ran out of peers to monitor
      if (!Object.keys(this._peersToMonitor)) {
        window.clearInterval(this.monitoringInterval)
      }

      for (let key in this._peersToMonitor) {
        let peerObject = this._peersToMonitor[key]
        let pc = peerObject.pc

        let id = pc.__rtcStatsId

        let trackIds = this.getTrackIds(pc)

        // stop monitoring closed peer connections
        if (!pc || pc.signalingState === 'closed') {
          delete this._peersToMonitor[key]
          continue
        }

        try {
          let prom = pc.getStats(null)
          if (prom) {
            prom.then((res) => {
              let parsedStats = map2obj(res)

              let enumerated = enumerateStats(parsedStats, trackIds, peerObject.stats.parsed)

              let timelineObject = {
                event: 'stats',
                tag: 'stats',
                peerId: id,
                data: enumerated
              }

              if (this.rawStats === true) {
                timelineObject['rawStats'] = res
              }
              if (this.parsedStats === true) {
                timelineObject['parsedStats'] = parsedStats
              }
              if (this.filteredStats === true) {
                timelineObject['filteredStats'] = this.filteroutStats(parsedStats)
              }

              // add it to the timeline
              this.addToTimeline(timelineObject)

              // and also emit the stats event
              this.emit('stats', timelineObject)

              peerObject.stats.parsed = enumerated
              // peerObject.stats.raw = res
            }).catch((err) => {
              console.error('error reading stats', err)
            })
          } else {
            // if it didn't return a promise but also didn't throw.
            // TODO: ??
          }
        } catch (e) {
          console.error(e)

          // TODO: finish implementing this
          pc.getStats((res) => {
            let stats = this.analyseLegacyPeerStats(pc, res)
            trace('getstats', id, stats)
          }, (err) => {
            console.error('error reading legacy stats', err)
          })
        }
      }
    }, this.getStatsInterval)
  }

  /**
   * Used to get the ids for local and remote streams
   * @param  {RTCPeerConnection} pc
   * @return {Object}
   */
  getTrackIds (pc) {
    let result = {
      localTrackIds: {
        audio: null,
        video: null
      },
      remoteTrackIds: {
        audio: null,
        video: null
      }
    }

    let local = pc.getSenders()
    for (let rtpSender of local) {
      if (rtpSender.track.kind === 'audio') {
        result.localTrackIds.audio = rtpSender.track.id
      } else if (rtpSender.track.kind === 'video') {
        result.localTrackIds.video = rtpSender.track.id
      }
    }

    let remote = pc.getReceivers()
    for (let rtpSender of remote) {
      if (rtpSender.track.kind === 'audio') {
        result.remoteTrackIds.audio = rtpSender.track.id
      } else if (rtpSender.track.kind === 'video') {
        result.remoteTrackIds.video = rtpSender.track.id
      }
    }

    return result
  }

  parsePeerStats (res, prev) {
    if (!(res instanceof RTCStatsReport)) {
      throw new Error('Invalid Stats Type. Not RTCStatsReport')
    }

    let now = map2obj(res)
    // our new prev
    let base = {...now}

    if (this.compressStats) {
      let compressed = this._deltaCompression(prev, now)
      return compressed
    } else {
      return base
    }
  }

  /**
   * Used to analyse legacy stats from Chrome
   * @param  {RTCStatsReport} res
   * @return {Object}
   */
  analyseLegacyPeerStats (pc, res, prev) {
    let now = this._mangleChromeStats(pc, res)
    // our new prev
    let base = {...now}

    if (this.compressStats) {
      let compressed = this._deltaCompression(prev, now)
      return compressed
    } else {
      return base
    }
  }

  filteroutStats (stats = {}) {
    let fullObject = {...stats}
    for (let key in fullObject) {
      var stat = fullObject[key]
      if (!this._statsToMonitor.includes(stat.type)) {
        delete fullObject[key]
      }
    }

    return fullObject
  }

  /**
   * Used to return the diff betwen two report stats
   * @param  {RTCStatsReport} oldStats
   * @param  {RTCStatsReport} newStats
   * @return {RTCStatsReport}
   */
  _deltaCompression (oldStats, newStats) {
    newStats = {...newStats}

    Object.keys(newStats).forEach(function (id) {
      if (!oldStats[id]) {
        return
      }

      var report = newStats[id]
      Object.keys(report).forEach(function (name) {
        if (report[name] === oldStats[id][name]) {
          delete newStats[id][name]
        }
        delete report.timestamp
        if (Object.keys(report).length === 0) {
          delete newStats[id]
        }
      })
    })
    // TODO: moving the timestamp to the top-level is not compression but...
    newStats.timestamp = new Date()
    return newStats
  }

  _mangleChromeStats (pc, response) {
    var standardReport = {}
    var reports = response.result()
    reports.forEach(function (report) {
      var standardStats = {
        id: report.id,
        timestamp: report.timestamp.getTime(),
        type: report.type
      }
      report.names().forEach(function (name) {
        standardStats[name] = report.stat(name)
      })
      // backfill mediaType -- until https://codereview.chromium.org/1307633007/ lands.
      if (report.type === 'ssrc' && !standardStats.mediaType && standardStats.googTrackId) {
        // look up track kind in local or remote streams.
        var streams = pc.getRemoteStreams().concat(pc.getLocalStreams())
        for (var i = 0; i < streams.length && !standardStats.mediaType; i++) {
          var tracks = streams[i].getTracks()
          for (var j = 0; j < tracks.length; j++) {
            if (tracks[j].id === standardStats.googTrackId) {
              standardStats.mediaType = tracks[j].kind
              report.mediaType = tracks[j].kind
            }
          }
        }
      }
      standardReport[standardStats.id] = standardStats
    })
    return standardReport
  }

  addPeerConnectionEventListeners (pc) {
    let id = pc.__rtcStatsId

    pc.addEventListener('icecandidate', (e) => {
      this.addToTimeline({
        event: 'onicecandidate',
        tag: 'ice',
        peerId: id,
        data: e.candidate
      })
    })

    // deprecated
    // pc.addEventListener('addstream', function(e) {
    //   trace('onaddstream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
    // });

    // deprecated
    // pc.addEventListener('removestream', function(e) {
    //   trace('onremovestream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
    // });

    pc.addEventListener('track', (e) => {
      // save the remote stream
      this._peersToMonitor[id].stream = e.streams[0]
      this.addToTimeline({
        event: 'ontrack',
        tag: 'track',
        peerId: id,
        data: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) { return 'stream:' + stream.id })
      })
    })

    pc.addEventListener('signalingstatechange', () => {
      this.addToTimeline({
        event: 'onsignalingstatechange',
        peerId: id,
        data: pc.signalingState
      })
    })
    pc.addEventListener('iceconnectionstatechange', () => {
      this.addToTimeline({
        event: 'oniceconnectionstatechange',
        tag: 'ice',
        peerId: id,
        data: pc.iceConnectionState
      })
    })
    pc.addEventListener('icegatheringstatechange', () => {
      this.addToTimeline({
        event: 'onicegatheringstatechange',
        tag: 'ice',
        peerId: id,
        data: pc.iceGatheringState
      })
    })
    pc.addEventListener('connectionstatechange', () => {
      this.addToTimeline({
        event: 'onconnectionstatechange',
        peerId: id,
        data: pc.connectionState
      })
    })
    pc.addEventListener('negotiationneeded', () => {
      this.addToTimeline({
        event: 'onnegotiationneeded',
        peerId: id
      })
    })
    pc.addEventListener('datachannel', (event) => {
      this.addToTimeline({
        event: 'ondatachannel',
        tag: 'datachannel',
        peerId: id,
        data: event.channel
      })
    })
  }

  addToTimeline (event) {
    // if we are missing the peerId
    // this would happen if addPeer() method is called a little late
    if (!event.peerId) {
      // if we only have one peer, then just add its id
      let peers = Object.keys(this._peersToMonitor)
      if (peers.length === 1) {
        event.peerId = peers[0] // same as pc.__rtcStatsId
      }
    }

    let ev = {
      ...event
    }
    this._timeline.push(ev)

    this.emit('timeline', ev)
  }

  parseGetUserMedia (options) {
    this.addToTimeline({
      event: 'getUserMedia',
      tag: 'getUserMedia',
      data: options
    })
  }
}
