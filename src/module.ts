import {EventEmitter} from 'events'
import {
  WebRTCStatsConstructorOptions,
  AddPeerOptions,
  MonitoredPeersObject,
  TimelineEvent,
  GetUserMediaResponse, MonitorPeerOptions, ParseStatsOptions, LogLevel
} from './types/index'

import {parseStats, map2obj} from './utils'


export class WebRTCStats extends EventEmitter {
  private readonly isEdge: boolean
  private getStatsInterval: number
  private monitoringSetInterval: number = 0
  private readonly rawStats: boolean
  private readonly statsObject: boolean
  private readonly filteredStats: boolean
  private readonly shouldWrapGetUserMedia: boolean
  private debug: any
  private readonly remote: boolean
  private peersToMonitor: MonitoredPeersObject = {}
  private logLevel: LogLevel

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

    // TODO a function here is not very consistent with the other declarations
    this.setStatsInterval(options.getStatsInterval || 1000)

    this.rawStats = !!options.rawStats
    this.statsObject = !!options.statsObject
    this.filteredStats = !!options.filteredStats

    // getUserMedia options
    this.shouldWrapGetUserMedia = !!options.wrapGetUserMedia

    /**
     * If we want to enable debug
     * @return {Function}
     */
    this.debug = !!options.debug

    this.remote = !!options.remote

    this.logLevel = options.logLevel || "warn"

    // add event listeners for getUserMedia
    if (this.shouldWrapGetUserMedia) {
      this.wrapGetUserMedia()
    }
  }

  /**
   * Start tracking a RTCPeerConnection
   * @param {Object} options The options object
   */
  public async addPeer (options: AddPeerOptions): Promise<void> {
    const {pc, peerId} = options
    let {remote} = options

    remote = typeof remote === 'boolean' ? remote : this.remote

    if (!pc || !(pc instanceof RTCPeerConnection)) {
      throw new Error(`Missing argument 'pc' or is not of instance RTCPeerConnection`)
    }

    if (!peerId) {
      throw new Error('Missing argument peerId')
    }

    if (this.isEdge) {
      throw new Error('Can\'t monitor peers in Edge at this time.')
    }

    if (this.peersToMonitor[peerId]) {
      // remove an existing peer with same id if that peer is already closed.
      if('closed' === this.peersToMonitor[peerId].pc.connectionState) {
        this.removePeer(peerId)
      } else {
        throw new Error(`We are already monitoring peer with id ${peerId}.`)
      }
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

    this.monitorPeer(peerId, pc, {remote})
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
   * @param  {string} peerId
   * @param  {RTCPeerConnection} pc
   * @param {MonitorPeerOptions} options
   */
  private monitorPeer (peerId: string, pc: RTCPeerConnection, options: MonitorPeerOptions): void {

    if (!pc) return

    // keep this in an object to avoid duplicates
    this.peersToMonitor[peerId] = {
      pc: pc,
      stream: null,
      stats: {
        // keep a reference of the current stat
        parsed: null,
        raw: null
      },
      options
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
        this.stopMonitoring()
      }

      this.getStats() // get stats from all peer connections
        .then((statsEvents: TimelineEvent[]) => {
          statsEvents.forEach((statsEventObject: TimelineEvent) => {
            // add it to the timeline and also emit the stats event
            this.addCustomEvent('stats', statsEventObject)
          })
        })
    }, this.getStatsInterval)
  }

  private stopMonitoring () {
    if (this.monitoringSetInterval) {
      window.clearInterval(this.monitoringSetInterval)
      this.monitoringSetInterval = 0
    }
  }

  private getStats (id: string = null): Promise<TimelineEvent[]> {

    return new Promise(async (resolve, reject) => {
      this.logger.info(id ? `Getting stats from peer ${id}` : `Getting stats from all peers`)
      let peersToAnalyse: MonitoredPeersObject = {}

      if (!id) {
        peersToAnalyse = this.peersToMonitor
      } else if (this.peersToMonitor[id]) {
        peersToAnalyse[id] = this.peersToMonitor[id]
      } else {
        return reject(new Error(`Cannot get stats. Peer with id ${id} does not exist`))
      }

      let statsEventList: TimelineEvent[] = []

      for (const id in peersToAnalyse) {

        const peerObject = this.peersToMonitor[id]
        const pc = peerObject.pc

        // stop monitoring closed peer connections
        if (!pc || pc.connectionState === 'closed') {
          this.removePeer(id)
          continue
        }

        try {
          const prom = pc.getStats(null)
          if (prom) {
            // TODO modify the promise to yield responses over time
            const res = await prom
            // create an object from the RTCStats map
            const statsObject = map2obj(res)


            const parseStatsOptions: ParseStatsOptions = {remote: peerObject.options.remote}
            const parsedStats = parseStats(res, peerObject.stats.parsed, parseStatsOptions)

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

            statsEventList.push(statsEventObject)

            peerObject.stats.parsed = parsedStats
            // peerObject.stats.raw = res

          } else {
            this.logger.error(`PeerConnection from peer ${id} did not return any stats data`)
          }
        } catch (e) {
          this.logger.error(e)
        }
      }

      resolve(statsEventList)
    })
  }

  private wrapGetUserMedia (): void {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.logger.warn(`'navigator.mediaDevices.getUserMedia' is not available in browser. Will not wrap getUserMedia.`)
      return
    }

    this.logger.info('Wrapping getUsermedia functions.')

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

  private get peerConnectionListeners () {
    return {
      icecandidate: (id, pc, e) => {
        this.logger.debug('[pc-event] icecandidate | peerId: ${peerId}', e)

        this.addToTimeline({
          event: 'onicecandidate',
          tag: 'connection',
          peerId: id,
          data: e.candidate
        })
      },
      track: (id, pc, e) => {
        this.logger.debug(`[pc-event] track | peerId: ${id}`, e)

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
            stream: stream ? this.getStreamDetails(stream) : null,
            track: track ? this.getMediaTrackDetails(track) : null,
            title: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) {
              return 'stream:' + stream.id
            })
          }
        })
      },
      signalingstatechange: (id, pc) => {
        this.logger.debug(`[pc-event] signalingstatechange | peerId: ${id}`)
        this.addToTimeline({
          event: 'onsignalingstatechange',
          tag: 'connection',
          peerId: id,
          data: pc.signalingState
        })
      },
      iceconnectionstatechange: (id, pc) => {
        this.logger.debug(`[pc-event] iceconnectionstatechange | peerId: ${id}`)
        this.addToTimeline({
          event: 'oniceconnectionstatechange',
          tag: 'connection',
          peerId: id,
          data: pc.iceConnectionState
        })
      },
      icegatheringstatechange: (id, pc) => {
        this.logger.debug(`[pc-event] icegatheringstatechange | peerId: ${id}`)
        this.addToTimeline({
          event: 'onicegatheringstatechange',
          tag: 'connection',
          peerId: id,
          data: pc.iceGatheringState
        })
      },
      icecandidateerror: (id, pc, ev) => {
        this.logger.debug(`[pc-event] icecandidateerror | peerId: ${id}`)
        this.addToTimeline({
          event: 'onicecandidateerror',
          tag: 'connection',
          peerId: id,
          error: {
            errorCode: ev.errorCode
          }
        })
      },
      connectionstatechange: (id, pc) => {
        this.logger.debug(`[pc-event] connectionstatechange | peerId: ${id}`)
        this.addToTimeline({
          event: 'onconnectionstatechange',
          tag: 'connection',
          peerId: id,
          data: pc.connectionState
        })
      },
      negotiationneeded: (id, pc) => {
        this.logger.debug(`[pc-event] negotiationneeded | peerId: ${id}`)
        this.addToTimeline({
          event: 'onnegotiationneeded',
          tag: 'connection',
          peerId: id
        })
      },
      datachannel: (id, pc, event) => {
        this.logger.debug(`[pc-event] datachannel | peerId: ${id}`, event)
        this.addToTimeline({
          event: 'ondatachannel',
          tag: 'datachannel',
          peerId: id,
          data: event.channel
        })
      }
    }
  }

  private addPeerConnectionEventListeners (peerId: string, pc: RTCPeerConnection): void {
    const id = peerId

    this.logger.info(`Adding new peer with ID ${peerId}.`)
    this.logger.debug(`Newly added PeerConnection`, pc)

    Object.keys(this.peerConnectionListeners).forEach(eventName => {
      pc.addEventListener(eventName, this.peerConnectionListeners[eventName].bind(this, id, pc), false)
    })

    /*pc.addEventListener('icecandidate', this.peerConnectionListeners.icecandidate.bind(this, id, pc))

    pc.addEventListener('track', this.peerConnectionListeners.track)

    pc.addEventListener('signalingstatechange', this.peerConnectionListeners.signalingstatechange)
    pc.addEventListener('iceconnectionstatechange', this.peerConnectionListeners.iceconnectionstatechange)
    pc.addEventListener('icegatheringstatechange', this.peerConnectionListeners.icegatheringstatechange)
    pc.addEventListener('icecandidateerror', this.peerConnectionListeners.icecandidateerror)

    pc.addEventListener('connectionstatechange', this.peerConnectionListeners.connectionstatechange)
    pc.addEventListener('negotiationneeded', this.peerConnectionListeners.negotiationneeded)
    pc.addEventListener('datachannel', this.peerConnectionListeners.datachannel)*/
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

    track.addEventListener('ended', (ev) => {
      this.addCustomEvent('track', {
        event: 'ended',
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

  /**
   * Sets the PeerConnection stats reporting interval.
   * @param interval
   *        Interval in milliseconds
   */
  public setStatsInterval (interval: number) {
    this.getStatsInterval = interval
    if (!this.getStatsInterval || !Number.isInteger(this.getStatsInterval)) {
      throw new Error(`getStatsInterval should be an integer, got: ${interval}`)
    }
    // TODO to be tested
    // Reset restart the interval with new value
    if (this.monitoringSetInterval) {
      this.stopMonitoring()
      this.startMonitoring()
    }
  }

  public get logger () {
    const canLog = (requestLevel: LogLevel) => {
      const allLevels: LogLevel[] = ['quiet', 'error', 'warn', 'info', 'debug']
      return allLevels.slice(0, allLevels.indexOf(this.logLevel) + 1).indexOf(requestLevel) > -1
    }

    return {
      error (...msg) {
        if (this.debug && canLog('error'))
          console.error(`[webrtc-stats][error] `, ...msg)
      },
      warn (...msg) {
        if (this.debug && canLog('warn'))
          console.warn(`[webrtc-stats][warn] `, ...msg)
      },
      info (...msg) {
        if (this.debug && canLog('info'))
          console.log(`[webrtc-stats][info] `, ...msg)
      },
      debug (...msg) {
        if (this.debug && canLog('debug'))
          console.debug(`[webrtc-stats][debug] `, ...msg)
      }
    }
  }

  public removePeer (id: string) {
    this.logger.info(`Removing PeerConnection with id ${id}.`)
    if (!this.peersToMonitor[id]) return

    const pc = this.peersToMonitor[id].pc

    // remove all PeerConnection listeners
    Object.keys(this.peerConnectionListeners).forEach(eventName => {
      pc.removeEventListener(eventName, this.peerConnectionListeners[eventName].bind(this, id, pc), false)
    })

    // remove from peersToMonitor
    delete this.peersToMonitor[id]
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
