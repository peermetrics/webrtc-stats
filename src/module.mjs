
import { parseStats, map2obj } from './utils.mjs'
import EventEmitter from 'events'

const legacyMethodsPrefixes = ['', 'moz', 'webkit']
let debug = console.log.bind(console.log)

export class WebRTCStats extends EventEmitter {
  constructor (options = {}) {
    super()

    // only works in the browser
    if (typeof window === 'undefined') {
      return null
    }

    // internal settings
    this.wrtc = {
      RTCPeerConnection: window.RTCPeerConnection
    }

    // TODO: implement edge support
    this.isEdge = !!window.RTCIceGatherer

    this.getStatsInterval = options.getStatsInterval || 1000
    if (!this.getStatsInterval || !Number.isInteger(this.getStatsInterval)) {
      throw new Error(`getStatsInterval should be an integer, got: ${options.getStatsInterval}`)
    }
    this.statsMonitoring = true

    /**
     * Reference to the setInterval function
     * @type {Function}
     */
    this.monitoringSetInterval = null

    this.shouldWrapRTCPeerConnection = options.wrapRTCPeerConnection || false

    this.rawStats = options.rawStats || false
    this.statsObject = options.statsObject || false
    this.filteredStats = options.filteredStats || false
    // option not used yet
    this.compressStats = options.compressStats || false

    // getUserMedia options
    this.shouldWrapGetUserMedia = options.wrapGetUserMedia || false
    this.wrapLegacyGetUserMedia = options.wrapLegacyGetUserMedia || false
    this.prefixesToWrap = options.prefixesToWrap || legacyMethodsPrefixes

    this._peersToMonitor = {}

    /**
     * If we want to enable debug
     * @return {Function}
     */
    this.debug = options.debug ? debug : function () {}

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
    if (this.shouldWrapGetUserMedia) {
      this.wrapGetUserMedia()
    }

    // wrap RTCPeerConnection methods so we can fire timeline events
    if (this.shouldWrapRTCPeerConnection) {
      this.wrapRTCPeerConnection()
    }
  }

  /**
   * Returns the timeline of events
   * If a tag is it will filter out events based on it
   * @param  {String} tag The tag to filter events (optional)
   * @return {Array}     The timeline array (or sub array if tag is defined)
   */
  getTimeline (tag) {
    if (tag) {
      return this._timeline.filter((event) => event.tag === tag)
    }

    return this._timeline.sort(
      (ev1, ev2) => ev1.timestamp.getTime() - ev2.timestamp.getTime()
    );
  }

  wrapGetUserMedia (options = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return

    let origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

    let getUserMediaCallback = this.parseGetUserMedia.bind(this)
    let gum = function () {
      // the first call will be with the constraints
      getUserMediaCallback({constraints: arguments[0]})

      return origGetUserMedia.apply(navigator.mediaDevices, arguments)
        .then((stream) => {
          getUserMediaCallback({stream: stream})
          return stream
        }, (err) => {
          getUserMediaCallback({error: err})
          return Promise.reject(err)
        })
    }

    // replace the native method
    navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices)

    if (this.wrapLegacyGetUserMedia) {
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
    let self = this
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      let origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
      let gdm = function () {
        self.debug('navigator.mediaDevices.getDisplayMedia', null, arguments[0])
        return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
          .then(function (stream) {
            // self.debug('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
            return stream
          }, function (err) {
            self.debug('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name)
            return Promise.reject(err)
          })
      }
      navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices)
    }
  }

  /**
   * Wraps RTC peer connections methods so we can fire timeline events
   */
  wrapRTCPeerConnection () {
    let self = this
    let nativeRTCPeerConnection = this.wrtc.RTCPeerConnection;

    ['createDataChannel', 'close'].forEach(function (method) {
      let nativeMethod = nativeRTCPeerConnection.prototype[method]
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

    // DEPRECATED
    // ['addStream', 'removeStream'].forEach(function (method) {
    //   var nativeMethod = nativeRTCPeerConnection.prototype[method]
    //   if (nativeMethod) {
    //     nativeRTCPeerConnection.prototype[method] = function () {
    //       self.addToTimeline({
    //         event: method,
    //         tag: 'stream',
    //         peerId: this.__rtcStatsId,
    //         stream: arguments[0]
    //       })
    //       return nativeMethod.apply(this, arguments)
    //     }
    //   }
    // });

    ['addTrack'].forEach(function (method) {
      var nativeMethod = nativeRTCPeerConnection.prototype[method]
      if (nativeMethod) {
        nativeRTCPeerConnection.prototype[method] = function () {
          var track = arguments[0]
          var stream = arguments[1] // [].slice.call(arguments, 1)
          self.addCustomEvent('track', {
            event: method,
            tag: 'track',
            peerId: this.__rtcStatsId,
            data: {
              stream: self.getStreamDetails(stream),
              track: self.getMediaTrackDetails(track)
            }
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
            track: self.getMediaTrackDetails(track)
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
      console.error(new Error('Can\'t monitor peers in Edge at this time.'))
      return
    }

    if (this._peersToMonitor[options.peerId]) {
      console.warn(`We are already monitoring peer with id ${options.peerId}.`)
      return
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
        peerId: id,
        options: options,
        peerConfiguration: config
      }
    })

    // let startMonitoring = typeof options.statsMonitoring !== 'undefined' ? options.statsMonitoring : this.statsMonitoring
    // if (startMonitoring) {
    this.monitorPeer(pc)
    // }
  }

  /**
   * Used to add to the list of peers to get stats for
   * @param  {RTCPeerConnection} pc
   */
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
   * monitoringSetInterval
   * getStatsInterval
   * promBased
   * _peersToMonitor
   * compressStats
   */
  startMonitoring () {
    if (this.monitoringSetInterval) return

    this.monitoringSetInterval = window.setInterval(() => {
      // if we ran out of peers to monitor
      if (!Object.keys(this._peersToMonitor).length) {
        window.clearInterval(this.monitoringSetInterval)
      }

      for (let key in this._peersToMonitor) {
        let peerObject = this._peersToMonitor[key]
        let pc = peerObject.pc

        let id = pc.__rtcStatsId

        // stop monitoring closed peer connections
        if (!pc || pc.signalingState === 'closed') {
          delete this._peersToMonitor[key]
          continue
        }

        try {
          let prom = pc.getStats(null)
          if (prom) {
            prom.then((res) => {
              // create an object from the RTCStats map
              let statsObject = map2obj(res)

              let parsedStats = parseStats(res, peerObject.stats.parsed)

              let statsEventObject = {
                event: 'stats',
                tag: 'stats',
                peerId: id,
                data: parsedStats
              }

              if (this.rawStats === true) {
                statsEventObject['rawStats'] = res
              }
              if (this.statsObject === true) {
                statsEventObject['statsObject'] = statsObject
              }
              if (this.filteredStats === true) {
                statsEventObject['filteredStats'] = this.filteroutStats(statsObject)
              }

              // add it to the timeline and also emit the stats event
              this.addCustomEvent('stats', statsEventObject)

              peerObject.stats.parsed = parsedStats
              // peerObject.stats.raw = res
            }).catch((err) => {
              console.error('error reading stats', err)
            })
          }
        } catch (e) {
          this.debug(e)

          // TODO: finish implementing this
          // pc.getStats((res) => {
          //   let stats = this.analyseLegacyPeerStats(pc, res)
          //   trace('getstats', id, stats)
          // }, (err) => {
          //   console.error('error reading legacy stats', err)
          // })
        }
      }
    }, this.getStatsInterval)
  }

  /**
   * Used to get the tracks for local and remote tracks
   * @param  {RTCPeerConnection} pc
   * @return {Object}
   */
  getPeerConnectionTracks (pc) {
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
      if (rtpSender.track) {
        if (rtpSender.track.kind === 'audio') {
          result.localTrackIds.audio = rtpSender.track
        } else if (rtpSender.track.kind === 'video') {
          result.localTrackIds.video = rtpSender.track
        }
      }
    }

    let remote = pc.getReceivers()
    for (let rtpSender of remote) {
      if (rtpSender.track) {
        if (rtpSender.track.kind === 'audio') {
          result.remoteTrackIds.audio = rtpSender.track
        } else if (rtpSender.track.kind === 'video') {
          result.remoteTrackIds.video = rtpSender.track
        }
      }
    }

    return result
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

  /**
   * Filter out some stats, mainly codec and certificate
   * @param  {Object} stats The parsed rtc stats object
   * @return {Object}       The new object with some keys deleted
   */
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
    // pc.addEventListener('addstream', function(e) {});

    // deprecated
    // pc.addEventListener('removestream', function(e) {});

    pc.addEventListener('track', (e) => {
      let track = e.track
      let stream = e.streams[0]

      // save the remote stream
      this._peersToMonitor[id].stream = stream

      this._addTrackEventListeners(track)
      this.addCustomEvent('track', {
        event: 'ontrack',
        tag: 'track',
        peerId: id,
        data: {
          stream: this.getStreamDetails(stream),
          track: this.getMediaTrackDetails(track),
          title: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) { return 'stream:' + stream.id })
        }
      })
    })

    pc.addEventListener('signalingstatechange', () => {
      this.addToTimeline({
        event: 'onsignalingstatechange',
        tag: 'ice',
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
    pc.addEventListener('icecandidateerror', (ev) => {
      this.addToTimeline({
        event: 'onicecandidateerror',
        tag: 'ice',
        peerId: id,
        error: {
          errorCode: ev.errorCode
        }
      })
    })
    pc.addEventListener('connectionstatechange', () => {
      this.addToTimeline({
        event: 'onconnectionstatechange',
        tag: 'ice',
        peerId: id,
        data: pc.connectionState
      })
    })
    pc.addEventListener('negotiationneeded', () => {
      this.addToTimeline({
        event: 'onnegotiationneeded',
        tag: 'ice',
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

  /**
   * Called when we get the stream from getUserMedia. We parse the stream and fire events
   * @param  {Object} options
   */
  parseGetUserMedia (options) {
    let obj = {
      event: 'getUserMedia',
      tag: 'getUserMedia',
      data: options
    }

    // if we received the stream, get the details for the tracks
    if (options.stream) {
      obj.data.details = this._parseStream(options.stream)
    }

    this.addCustomEvent('getUserMedia', obj)
  }

  _parseStream (stream) {
    let result = {
      audio: null,
      video: null
    }

    // at this point we only read one stream
    let audioTrack = stream.getAudioTracks()[0]
    let videoTrack = stream.getVideoTracks()[0]

    if (audioTrack) {
      result['audio'] = this.getMediaTrackDetails(audioTrack)
    }

    if (videoTrack) {
      result['video'] = this.getMediaTrackDetails(videoTrack)
    }

    return result
  }

  getMediaTrackDetails (track) {
    return {
      enabled: track.enabled,
      id: track.id,
      contentHint: track.contentHint,
      kind: track.kind,
      label: track.label,
      muted: track.muted,
      readyState: track.readyState,
      constructorName: track.constructor.name,
      capabilities: track.getCapabilities ? track.getCapabilities() : {},
      constraints: track.getConstraints ? track.getConstraints() : {},
      settings: track.getSettings ? track.getSettings() : {},
      _track: track
    }
  }

  getStreamDetails (stream) {
    return {
      active: stream.active,
      id: stream.id,
      _stream: stream
    }
  }

  /**
   * Add event listeners for the tracks that are added to the stream
   * @param {MediaStreamTrack} track
   */
  _addTrackEventListeners (track) {
    track.addEventListener('mute', (ev) => {
      this.addCustomEvent('track', {
        event: 'mute',
        tag: 'track',
        data: {
          event: ev
        }
      })
    })
    track.addEventListener('unmute', (ev) => {
      this.addCustomEvent('track', {
        event: 'unmute',
        tag: 'track',
        data: {
          event: ev
        }
      })
    })
    track.addEventListener('overconstrained', (ev) => {
      this.addCustomEvent('track', {
        event: 'overconstrained',
        tag: 'track',
        data: {
          event: ev
        }
      })
    })
  }

  addToTimeline (event) {
    let ev = {
      timestamp: new Date(),
      ...event
    }
    this._timeline.push(ev)

    this.emit('timeline', ev)
  }

  /**
   * Used to emit a custome event and also add it to the timeline
   * @param {String} eventName The name of the custome event: track, getUserMedia, stats, etc
   * @param {Object} options   The object tha will be sent with the event
   */
  addCustomEvent (eventName, options) {
    this.addToTimeline(options)
    if (eventName) {
      this.emit(eventName, options)
    }
  }
}
