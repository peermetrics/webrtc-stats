import { EventEmitter } from 'events'
import { WebRTCStatsConstructorOptions, AddPeerOptions, MonitoredPeersObject, TimelineEvent, GetUserMediaResponse } from './types/index'

import { parseStats, map2obj } from './utils'

const debug = console.log.bind(console.log)

export class WebRTCStats extends EventEmitter {
  private isEdge: boolean
  private getStatsInterval: number
  private monitoringSetInterval: number = 0
  private rawStats: boolean
  private statsObject: boolean
  private filteredStats: boolean
  private shouldWrapGetUserMedia: boolean
  private debug: any
  private peersToMonitor: MonitoredPeersObject = {}

  /**
   * Used to keep track of all the events
   */
  private timeline: TimelineEvent[] = []

  /**
   * A list of stats to look after
   */
  private statsToMonitor: string[] = [
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

  constructor (constructorOptions: WebRTCStatsConstructorOptions) {
    super()

    // only works in the browser
    if (typeof window === 'undefined') {
      throw new Error('WebRTCStats only works in browser')
    }

    const options = {...constructorOptions}

    this.isEdge = !!window.RTCIceGatherer

    this.getStatsInterval = options.getStatsInterval || 1000
    if (!this.getStatsInterval || !Number.isInteger(this.getStatsInterval)) {
      throw new Error(`getStatsInterval should be an integer, got: ${options.getStatsInterval}`)
    }

    this.rawStats = !!options.rawStats
    this.statsObject = !!options.statsObject
    this.filteredStats = !!options.filteredStats

    // getUserMedia options
    this.shouldWrapGetUserMedia = !!options.wrapGetUserMedia

    /**
     * If we want to enable debug
     * @return {Function}
     */
    this.debug = options.debug ? debug : function () {}

    // add event listeners for getUserMedia
    if (this.shouldWrapGetUserMedia) {
      this.wrapGetUserMedia()
    }
  }

  /**
   * Start tracking a RTCPeerConnection
   * @param {Object} options The options object
   */
  public addPeer (options: AddPeerOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const {pc, peerId} = options

      if (!pc || !(pc instanceof RTCPeerConnection)) {
        return reject(new Error(`Missing argument 'pc' or is not of instance RTCPeerConnection`))
      }

      if (!peerId) {
        return reject(new Error('Missing argument peerId'))
      }

      if (this.isEdge) {
        return reject(new Error('Can\'t monitor peers in Edge at this time.'))
      }

      if (this.peersToMonitor[peerId]) {
        return reject(new Error(`We are already monitoring peer with id ${peerId}.`))
      }

      const config = pc.getConfiguration()

      // don't log credentials
      if (config.iceServers) {
        config.iceServers.forEach(function (server) {
          delete server.credential
        })
      }

      this.addToTimeline({
        event: 'addPeer',
        tag: 'peer',
        peerId: peerId,
        data: {
          options: options,
          peerConfiguration: config
        }
      })

      this.monitorPeer(peerId, pc)

      resolve()
    })
  }

  /**
   * Returns the timeline of events
   * If a tag is it will filter out events based on it
   * @param  {String} tag The tag to filter events (optional)
   * @return {Array}     The timeline array (or sub array if tag is defined)
   */
  public getTimeline (tag): TimelineEvent[] {
    // sort the events by timestamp
    this.timeline = this.timeline.sort(
      (event1, event2) => event1.timestamp.getTime() - event2.timestamp.getTime()
    )

    if (tag) {
      return this.timeline.filter((event) => event.tag === tag)
    }

    return this.timeline
  }

  /**
   * Used to add to the list of peers to get stats for
   * @param  {RTCPeerConnection} pc
   */
  private monitorPeer (peerId: string, pc: RTCPeerConnection): void {
    if (!pc) return

    // keep this in an object to avoid duplicates
    this.peersToMonitor[peerId] = {
      pc: pc,
      stream: null,
      stats: {
        // keep a reference of the current stat
        parsed: null,
        raw: null
      }
    }

    this.addPeerConnectionEventListeners(peerId, pc)

    // start monitoring from the first peer added
    if (Object.keys(this.peersToMonitor).length === 1) {
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
   * peersToMonitor
   */
  private startMonitoring () {
    if (this.monitoringSetInterval) return

    this.monitoringSetInterval = window.setInterval(() => {
      // if we ran out of peers to monitor
      if (!Object.keys(this.peersToMonitor).length) {
        window.clearInterval(this.monitoringSetInterval)

        this.monitoringSetInterval = 0
      }

      for (const key in this.peersToMonitor) {
        const id = key

        const peerObject = this.peersToMonitor[key]
        const pc = peerObject.pc

        // stop monitoring closed peer connections
        if (!pc || pc.signalingState === 'closed') {
          delete this.peersToMonitor[key]
          continue
        }

        try {
          const prom = pc.getStats(null)
          if (prom) {
            prom.then((res) => {
              // create an object from the RTCStats map
              const statsObject = map2obj(res)

              const parsedStats = parseStats(res, peerObject.stats.parsed)

              const statsEventObject = {
                event: 'stats',
                tag: 'stats',
                peerId: id,
                data: parsedStats
              } as TimelineEvent

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
        }
      }
    }, this.getStatsInterval)
  }

  private wrapGetUserMedia (): void {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return

    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

    const getUserMediaCallback = this.parseGetUserMedia.bind(this)
    const gum = function () {
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
  }

  /**
   * Used to get the tracks for local and remote tracks
   * @param  {RTCPeerConnection} pc
   * @return {Object}
   */
  private getPeerConnectionTracks (pc: RTCPeerConnection) {
    const result = {
      localTrackIds: {
        audio: null,
        video: null
      },
      remoteTrackIds: {
        audio: null,
        video: null
      }
    }

    const local = pc.getSenders()
    for (const rtpSender of local) {
      if (rtpSender.track) {
        if (rtpSender.track.kind === 'audio') {
          result.localTrackIds.audio = rtpSender.track
        } else if (rtpSender.track.kind === 'video') {
          result.localTrackIds.video = rtpSender.track
        }
      }
    }

    const remote = pc.getReceivers()
    for (const rtpSender of remote) {
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
   * Filter out some stats, mainly codec and certificate
   * @param  {Object} stats The parsed rtc stats object
   * @return {Object}       The new object with some keys deleted
   */
  private filteroutStats (stats = {}) {
    const fullObject = {...stats}
    for (const key in fullObject) {
      var stat = fullObject[key]
      if (!this.statsToMonitor.includes(stat.type)) {
        delete fullObject[key]
      }
    }

    return fullObject
  }

  private addPeerConnectionEventListeners (peerId: string, pc:RTCPeerConnection): void {
    const id = peerId

    pc.addEventListener('icecandidate', (e) => {
      this.addToTimeline({
        event: 'onicecandidate',
        tag: 'connection',
        peerId: id,
        data: e.candidate
      })
    })

    pc.addEventListener('track', (e) => {
      const track = e.track
      const stream = e.streams[0]

      // save the remote stream
      this.peersToMonitor[id].stream = stream

      this.addTrackEventListeners(track)
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
        tag: 'connection',
        peerId: id,
        data: pc.signalingState
      })
    })
    pc.addEventListener('iceconnectionstatechange', () => {
      this.addToTimeline({
        event: 'oniceconnectionstatechange',
        tag: 'connection',
        peerId: id,
        data: pc.iceConnectionState
      })
    })
    pc.addEventListener('icegatheringstatechange', () => {
      this.addToTimeline({
        event: 'onicegatheringstatechange',
        tag: 'connection',
        peerId: id,
        data: pc.iceGatheringState
      })
    })
    pc.addEventListener('icecandidateerror', (ev) => {
      this.addToTimeline({
        event: 'onicecandidateerror',
        tag: 'connection',
        peerId: id,
        error: {
          errorCode: ev.errorCode
        }
      })
    })
    pc.addEventListener('connectionstatechange', () => {
      this.addToTimeline({
        event: 'onconnectionstatechange',
        tag: 'connection',
        peerId: id,
        data: pc.connectionState
      })
    })
    pc.addEventListener('negotiationneeded', () => {
      this.addToTimeline({
        event: 'onnegotiationneeded',
        tag: 'connection',
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
  private parseGetUserMedia (options: GetUserMediaResponse) {
    const obj = {
      event: 'getUserMedia',
      tag: 'getUserMedia',
      data: {...options}
    } as TimelineEvent

    // if we received the stream, get the details for the tracks
    if (options.stream) {
      obj.data.details = this.parseStream(options.stream)
    }

    this.addCustomEvent('getUserMedia', obj)
  }

  private parseStream (stream: MediaStream) {
    const result = {
      audio: null,
      video: null
    }

    // at this point we only read one stream
    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]

    if (audioTrack) {
      result['audio'] = this.getMediaTrackDetails(audioTrack)
    }

    if (videoTrack) {
      result['video'] = this.getMediaTrackDetails(videoTrack)
    }

    return result
  }

  private getMediaTrackDetails (track: MediaStreamTrack) {
    return {
      enabled: track.enabled,
      id: track.id,
      // @ts-ignore
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

  private getStreamDetails (stream: MediaStream) {
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
  private addTrackEventListeners (track: MediaStreamTrack) {
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

  private addToTimeline (event: TimelineEvent) {
    const ev = {
      ...event,
      timestamp: new Date()
    }
    this.timeline.push(ev)

    this.emit('timeline', ev)
  }

  /**
   * Used to emit a custome event and also add it to the timeline
   * @param {String} eventName The name of the custome event: track, getUserMedia, stats, etc
   * @param {Object} options   The object tha will be sent with the event
   */
  private addCustomEvent (eventName: string, options: TimelineEvent) {
    this.addToTimeline(options)
    if (eventName) {
      this.emit(eventName, options)
    }
  }

  // TODO
  private wrapGetDisplayMedia () {
    const self = this
      // @ts-ignore
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      // @ts-ignore
      const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
      const gdm = function () {
        self.debug('navigator.mediaDevices.getDisplayMedia', null, arguments[0])
        return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
          .then(function (stream: MediaStream) {
            // self.debug('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
            return stream
          }, function (err: DOMError) {
            self.debug('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name)
            return Promise.reject(err)
          })
      }
      // @ts-ignore
      navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices)
    }
  }
}
