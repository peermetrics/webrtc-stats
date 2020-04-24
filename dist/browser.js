(function () {
  'use strict';

  var domain;// This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers(){}EventHandlers.prototype=Object.create(null);function EventEmitter(){EventEmitter.init.call(this);}// require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter=EventEmitter,EventEmitter.usingDomains=!1,EventEmitter.prototype.domain=void 0,EventEmitter.prototype._events=void 0,EventEmitter.prototype._maxListeners=void 0,EventEmitter.defaultMaxListeners=10,EventEmitter.init=function(){this.domain=null,EventEmitter.usingDomains&&domain.active&&!(this instanceof domain.Domain)&&(this.domain=domain.active),this._events&&this._events!==Object.getPrototypeOf(this)._events||(this._events=new EventHandlers,this._eventsCount=0),this._maxListeners=this._maxListeners||void 0;},EventEmitter.prototype.setMaxListeners=function(a){if("number"!=typeof a||0>a||isNaN(a))throw new TypeError("\"n\" argument must be a positive number");return this._maxListeners=a,this};function $getMaxListeners(a){return void 0===a._maxListeners?EventEmitter.defaultMaxListeners:a._maxListeners}EventEmitter.prototype.getMaxListeners=function(){return $getMaxListeners(this)};// These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone(a,b,c){if(b)a.call(c);else for(var d=a.length,e=arrayClone(a,d),f=0;f<d;++f)e[f].call(c);}function emitOne(a,b,c,d){if(b)a.call(c,d);else for(var e=a.length,f=arrayClone(a,e),g=0;g<e;++g)f[g].call(c,d);}function emitTwo(a,b,c,d,e){if(b)a.call(c,d,e);else for(var f=a.length,g=arrayClone(a,f),h=0;h<f;++h)g[h].call(c,d,e);}function emitThree(a,b,c,d,e,f){if(b)a.call(c,d,e,f);else for(var g=a.length,h=arrayClone(a,g),j=0;j<g;++j)h[j].call(c,d,e,f);}function emitMany(a,b,c,d){if(b)a.apply(c,d);else for(var e=a.length,f=arrayClone(a,e),g=0;g<e;++g)f[g].apply(c,d);}EventEmitter.prototype.emit=function(a){var b,c,d,e,f,g,h,j="error"===a;if(g=this._events,g)j=j&&null==g.error;else if(!j)return !1;// If there is no 'error' event listener then throw.
  if(h=this.domain,j){if(b=arguments[1],h)b||(b=new Error("Uncaught, unspecified \"error\" event")),b.domainEmitter=this,b.domain=h,b.domainThrown=!1,h.emit("error",b);else if(b instanceof Error)throw b;// Unhandled 'error' event
  else{// At least give some kind of context to the user
  var k=new Error("Uncaught, unspecified \"error\" event. ("+b+")");throw k.context=b,k}return !1}if(c=g[a],!c)return !1;var l="function"==typeof c;switch(d=arguments.length,d){// fast cases
  case 1:emitNone(c,l,this);break;case 2:emitOne(c,l,this,arguments[1]);break;case 3:emitTwo(c,l,this,arguments[1],arguments[2]);break;case 4:emitThree(c,l,this,arguments[1],arguments[2],arguments[3]);break;// slower
  default:for(e=Array(d-1),f=1;f<d;f++)e[f-1]=arguments[f];emitMany(c,l,this,e);}return !0};function _addListener(a,b,c,d){var e,f,g;if("function"!=typeof c)throw new TypeError("\"listener\" argument must be a function");if(f=a._events,f?(f.newListener&&(a.emit("newListener",b,c.listener?c.listener:c),f=a._events),g=f[b]):(f=a._events=new EventHandlers,a._eventsCount=0),!g)g=f[b]=c,++a._eventsCount;else// Check for listener leak
  if("function"==typeof g?g=f[b]=d?[c,g]:[g,c]:d?g.unshift(c):g.push(c),!g.warned&&(e=$getMaxListeners(a),e&&0<e&&g.length>e)){g.warned=!0;var h=new Error("Possible EventEmitter memory leak detected. "+g.length+" "+b+" listeners added. Use emitter.setMaxListeners() to increase limit");h.name="MaxListenersExceededWarning",h.emitter=a,h.type=b,h.count=g.length,emitWarning(h);}return a}function emitWarning(a){"function"==typeof console.warn?console.warn(a):console.log(a);}EventEmitter.prototype.addListener=function(a,b){return _addListener(this,a,b,!1)},EventEmitter.prototype.on=EventEmitter.prototype.addListener,EventEmitter.prototype.prependListener=function(a,b){return _addListener(this,a,b,!0)};function _onceWrap(a,b,c){function d(){a.removeListener(b,d),e||(e=!0,c.apply(a,arguments));}var e=!1;return d.listener=c,d}EventEmitter.prototype.once=function(a,b){if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");return this.on(a,_onceWrap(this,a,b)),this},EventEmitter.prototype.prependOnceListener=function(a,b){if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");return this.prependListener(a,_onceWrap(this,a,b)),this},EventEmitter.prototype.removeListener=function(a,b){var c,d,e,f,g;if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");if(d=this._events,!d)return this;if(c=d[a],!c)return this;if(c===b||c.listener&&c.listener===b)0==--this._eventsCount?this._events=new EventHandlers:(delete d[a],d.removeListener&&this.emit("removeListener",a,c.listener||b));else if("function"!=typeof c){for(e=-1,f=c.length;0<f--;)if(c[f]===b||c[f].listener&&c[f].listener===b){g=c[f].listener,e=f;break}if(0>e)return this;if(1===c.length){if(c[0]=void 0,0==--this._eventsCount)return this._events=new EventHandlers,this;delete d[a];}else spliceOne(c,e);d.removeListener&&this.emit("removeListener",a,g||b);}return this},EventEmitter.prototype.removeAllListeners=function(a){var b,c;if(c=this._events,!c)return this;// not listening for removeListener, no need to emit
  if(!c.removeListener)return 0===arguments.length?(this._events=new EventHandlers,this._eventsCount=0):c[a]&&(0==--this._eventsCount?this._events=new EventHandlers:delete c[a]),this;// emit removeListener for all listeners on all events
  if(0===arguments.length){for(var d,e=Object.keys(c),f=0;f<e.length;++f)d=e[f],"removeListener"===d||this.removeAllListeners(d);return this.removeAllListeners("removeListener"),this._events=new EventHandlers,this._eventsCount=0,this}if(b=c[a],"function"==typeof b)this.removeListener(a,b);else if(b)// LIFO order
  do this.removeListener(a,b[b.length-1]);while(b[0]);return this},EventEmitter.prototype.listeners=function(a){var b,c,d=this._events;return d?(b=d[a],c=b?"function"==typeof b?[b.listener||b]:unwrapListeners(b):[]):c=[],c},EventEmitter.listenerCount=function(a,b){return "function"==typeof a.listenerCount?a.listenerCount(b):listenerCount.call(a,b)},EventEmitter.prototype.listenerCount=listenerCount;function listenerCount(a){var b=this._events;if(b){var c=b[a];if("function"==typeof c)return 1;if(c)return c.length}return 0}EventEmitter.prototype.eventNames=function(){return 0<this._eventsCount?Reflect.ownKeys(this._events):[]};// About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne(a,b){for(var c=b,d=c+1,e=a.length;d<e;c+=1,d+=1)a[c]=a[d];a.pop();}function arrayClone(a,b){for(var c=Array(b);b--;)c[b]=a[b];return c}function unwrapListeners(a){for(var b=Array(a.length),c=0;c<b.length;++c)b[c]=a[c].listener||a[c];return b}

  /**
   * A set of methods used to parse the rtc stats
   */
  function addAdditionalData(currentStats, previousStats) {
      // we need the previousStats stats to compute thse values
      if (!previousStats)
          return currentStats;
      // audio
      currentStats.audio.local.bitrate = computeBitrate(currentStats.audio.local, previousStats.audio.local, 'bytesSent');
      currentStats.audio.local.packetRate = computeRate(currentStats.audio.local, previousStats.audio.local, 'packetsSent');
      currentStats.audio.remote.bitrate = computeBitrate(currentStats.audio.remote, previousStats.audio.remote, 'bytesReceived');
      currentStats.audio.remote.packetRate = computeRate(currentStats.audio.remote, previousStats.audio.remote, 'packetsReceived');
      // video
      currentStats.video.local.bitrate = computeBitrate(currentStats.video.local, previousStats.video.local, 'bytesSent');
      currentStats.video.local.packetRate = computeRate(currentStats.video.local, previousStats.video.local, 'packetsSent');
      currentStats.video.remote.bitrate = computeBitrate(currentStats.video.remote, previousStats.video.remote, 'bytesReceived');
      currentStats.video.remote.packetRate = computeRate(currentStats.video.remote, previousStats.video.remote, 'packetsReceived');
      return currentStats;
  }
  function getCandidatePairInfo(candidatePair, stats) {
      if (!candidatePair || !stats)
          return {};
      const connection = { ...candidatePair };
      if (connection.localCandidateId) {
          const localCandidate = stats.get(connection.localCandidateId);
          connection.local = { ...localCandidate };
      }
      if (connection.remoteCandidateId) {
          const remoteCandidate = stats.get(connection.remoteCandidateId);
          connection.remote = { ...remoteCandidate };
      }
      return connection;
  }
  // Takes two stats reports and determines the rate based on two counter readings
  // and the time between them (which is in units of milliseconds).
  function computeRate(newReport, oldReport, statName) {
      const newVal = newReport[statName];
      const oldVal = (oldReport) ? oldReport[statName] : null;
      if (newVal === null || oldVal === null) {
          return null;
      }
      return (newVal - oldVal) / (newReport.timestamp - oldReport.timestamp) * 1000;
  }
  // Convert a byte rate to a bit rate.
  function computeBitrate(newReport, oldReport, statName) {
      return computeRate(newReport, oldReport, statName) * 8;
  }
  function map2obj(stats) {
      if (!stats.entries) {
          return stats;
      }
      const o = {};
      stats.forEach(function (v, k) {
          o[k] = v;
      });
      return o;
  }
  // Enumerates the new standard compliant stats using local and remote track ids.
  function parseStats(stats, previousStats) {
      // Create an object structure with all the needed stats and types that we care
      // about. This allows to map the getStats stats to other stats names.
      if (!stats)
          return null;
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
      };
      for (const report of stats.values()) {
          switch (report.type) {
              case 'outbound-rtp': {
                  const mediaType = report.mediaType || report.kind;
                  let local = {};
                  const codecInfo = {};
                  if (!['audio', 'video'].includes(mediaType))
                      continue;
                  statsObject[mediaType].local = report;
                  if (report.remoteId) {
                      local = stats.get(report.remoteId);
                  }
                  else if (report.trackId) {
                      local = stats.get(report.trackId);
                  }
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  statsObject[mediaType].local = { ...report, ...local, ...codecInfo };
                  break;
              }
              case 'inbound-rtp': {
                  let mediaType = report.mediaType || report.kind;
                  let remote = {};
                  const codecInfo = {};
                  // Safari is missing mediaType and kind for 'inbound-rtp'
                  if (!['audio', 'video'].includes(mediaType)) {
                      if (report.id.includes('Video'))
                          mediaType = 'video';
                      else if (report.id.includes('Audio'))
                          mediaType = 'audio';
                      else
                          continue;
                  }
                  statsObject[mediaType].remote = report;
                  if (report.remoteId) {
                      remote = stats.get(report.remoteId);
                  }
                  else if (report.trackId) {
                      remote = stats.get(report.trackId);
                  }
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  // if we don't have connection details already saved
                  // and the transportId is present (most likely chrome)
                  // get the details from the candidate-pair
                  if (!statsObject.connection.id && report.transportId) {
                      const transport = stats.get(report.transportId);
                      if (transport && transport.selectedCandidatePairId) {
                          const candidatePair = stats.get(transport.selectedCandidatePairId);
                          statsObject.connection = getCandidatePairInfo(candidatePair, stats);
                      }
                  }
                  statsObject[mediaType].remote = { ...report, ...remote, ...codecInfo };
                  break;
              }
              case 'peer-connection': {
                  statsObject.connection.dataChannelsClosed = report.dataChannelsClosed;
                  statsObject.connection.dataChannelsOpened = report.dataChannelsOpened;
                  break;
              }
          }
      }
      // if we didn't find a candidate-pair while going through inbound-rtp
      // look for it again
      if (!statsObject.connection.id) {
          for (const report of stats.values()) {
              // select the current active candidate-pair report
              if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
                  statsObject.connection = getCandidatePairInfo(report, stats);
              }
          }
      }
      statsObject = addAdditionalData(statsObject, previousStats);
      return statsObject;
  }

  const debug = console.log.bind(console.log);
  class WebRTCStats extends EventEmitter {
      constructor(constructorOptions) {
          super();
          this.peersToMonitor = {};
          /**
           * Used to keep track of all the events
           */
          this.timeline = [];
          /**
           * A list of stats to look after
           */
          this.statsToMonitor = [
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
          ];
          try {
              const test = typeof window;
          }
          catch (error) {
              if (constructorOptions.wrtc === undefined) {
                  throw new Error('WebRTCStats runs in non-browser environment, you must specify `wrtc` option');
              }
          }
          const options = { ...constructorOptions };
          try {
              this.isEdge = !!window.RTCIceGatherer;
          }
          catch (error) {
              this.isEdge = false;
          }
          this.getStatsInterval = options.getStatsInterval || 1000;
          if (!this.getStatsInterval || !Number.isInteger(this.getStatsInterval)) {
              throw new Error(`getStatsInterval should be an integer, got: ${options.getStatsInterval}`);
          }
          this.rawStats = !!options.rawStats;
          this.statsObject = !!options.statsObject;
          this.filteredStats = !!options.filteredStats;
          // getUserMedia options
          this.shouldWrapGetUserMedia = !!options.wrapGetUserMedia;
          this.wrtc = options.wrtc
              ? options.wrtc
              : window;
          /**
           * If we want to enable debug
           * @return {Function}
           */
          this.debug = options.debug ? debug : function () { };
          // add event listeners for getUserMedia
          if (this.shouldWrapGetUserMedia) {
              this.wrapGetUserMedia();
          }
      }
      /**
       * Start tracking a RTCPeerConnection
       * @param {Object} options The options object
       */
      addPeer(options) {
          return new Promise((resolve, reject) => {
              const { RTCPeerConnection } = this.wrtc;
              const { pc, peerId } = options;
              if (!pc || !(pc instanceof RTCPeerConnection)) {
                  return reject(new Error(`Missing argument 'pc' or is not of instance RTCPeerConnection`));
              }
              if (!peerId) {
                  return reject(new Error('Missing argument peerId'));
              }
              if (this.isEdge) {
                  return reject(new Error('Can\'t monitor peers in Edge at this time.'));
              }
              if (this.peersToMonitor[peerId]) {
                  return reject(new Error(`We are already monitoring peer with id ${peerId}.`));
              }
              const config = pc.getConfiguration();
              // don't log credentials
              if (config.iceServers) {
                  config.iceServers.forEach(function (server) {
                      delete server.credential;
                  });
              }
              this.addToTimeline({
                  event: 'addPeer',
                  tag: 'peer',
                  peerId: peerId,
                  data: {
                      options: options,
                      peerConfiguration: config
                  }
              });
              this.monitorPeer(peerId, pc);
              resolve();
          });
      }
      /**
       * Returns the timeline of events
       * If a tag is it will filter out events based on it
       * @param  {String} tag The tag to filter events (optional)
       * @return {Array}     The timeline array (or sub array if tag is defined)
       */
      getTimeline(tag) {
          // sort the events by timestamp
          this.timeline = this.timeline.sort((event1, event2) => event1.timestamp.getTime() - event2.timestamp.getTime());
          if (tag) {
              return this.timeline.filter((event) => event.tag === tag);
          }
          return this.timeline;
      }
      /**
       * Used to add to the list of peers to get stats for
       * @param  {RTCPeerConnection} pc
       */
      monitorPeer(peerId, pc) {
          if (!pc)
              return;
          // keep this in an object to avoid duplicates
          this.peersToMonitor[peerId] = {
              pc: pc,
              stream: null,
              stats: {
                  // keep a reference of the current stat
                  parsed: null,
                  raw: null
              }
          };
          this.addPeerConnectionEventListeners(peerId, pc);
          // start monitoring from the first peer added
          if (Object.keys(this.peersToMonitor).length === 1) {
              this.startMonitoring();
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
      startMonitoring() {
          if (this.monitoringSetInterval)
              return;
          this.monitoringSetInterval = setInterval(() => {
              // if we ran out of peers to monitor
              if (!Object.keys(this.peersToMonitor).length) {
                  clearInterval(this.monitoringSetInterval);
              }
              for (const key in this.peersToMonitor) {
                  const id = key;
                  const peerObject = this.peersToMonitor[key];
                  const pc = peerObject.pc;
                  // stop monitoring closed peer connections
                  if (!pc || pc.signalingState === 'closed') {
                      delete this.peersToMonitor[key];
                      continue;
                  }
                  try {
                      const prom = pc.getStats(null);
                      if (prom) {
                          prom.then((res) => {
                              // create an object from the RTCStats map
                              const statsObject = map2obj(res);
                              const parsedStats = parseStats(res, peerObject.stats.parsed);
                              const statsEventObject = {
                                  event: 'stats',
                                  tag: 'stats',
                                  peerId: id,
                                  data: parsedStats
                              };
                              if (this.rawStats === true) {
                                  statsEventObject['rawStats'] = res;
                              }
                              if (this.statsObject === true) {
                                  statsEventObject['statsObject'] = statsObject;
                              }
                              if (this.filteredStats === true) {
                                  statsEventObject['filteredStats'] = this.filteroutStats(statsObject);
                              }
                              // add it to the timeline and also emit the stats event
                              this.addCustomEvent('stats', statsEventObject);
                              peerObject.stats.parsed = parsedStats;
                              // peerObject.stats.raw = res
                          }).catch((err) => {
                              console.error('error reading stats', err);
                          });
                      }
                  }
                  catch (e) {
                      this.debug(e);
                  }
              }
          }, this.getStatsInterval);
      }
      wrapGetUserMedia() {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
              return;
          const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          const getUserMediaCallback = this.parseGetUserMedia.bind(this);
          const gum = function () {
              // the first call will be with the constraints
              getUserMediaCallback({ constraints: arguments[0] });
              return origGetUserMedia.apply(navigator.mediaDevices, arguments)
                  .then((stream) => {
                  getUserMediaCallback({ stream: stream });
                  return stream;
              }, (err) => {
                  getUserMediaCallback({ error: err });
                  return Promise.reject(err);
              });
          };
          // replace the native method
          navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);
      }
      /**
       * Used to get the tracks for local and remote tracks
       * @param  {RTCPeerConnection} pc
       * @return {Object}
       */
      getPeerConnectionTracks(pc) {
          const result = {
              localTrackIds: {
                  audio: null,
                  video: null
              },
              remoteTrackIds: {
                  audio: null,
                  video: null
              }
          };
          const local = pc.getSenders();
          for (const rtpSender of local) {
              if (rtpSender.track) {
                  if (rtpSender.track.kind === 'audio') {
                      result.localTrackIds.audio = rtpSender.track;
                  }
                  else if (rtpSender.track.kind === 'video') {
                      result.localTrackIds.video = rtpSender.track;
                  }
              }
          }
          const remote = pc.getReceivers();
          for (const rtpSender of remote) {
              if (rtpSender.track) {
                  if (rtpSender.track.kind === 'audio') {
                      result.remoteTrackIds.audio = rtpSender.track;
                  }
                  else if (rtpSender.track.kind === 'video') {
                      result.remoteTrackIds.video = rtpSender.track;
                  }
              }
          }
          return result;
      }
      /**
       * Filter out some stats, mainly codec and certificate
       * @param  {Object} stats The parsed rtc stats object
       * @return {Object}       The new object with some keys deleted
       */
      filteroutStats(stats = {}) {
          const fullObject = { ...stats };
          for (const key in fullObject) {
              var stat = fullObject[key];
              if (!this.statsToMonitor.includes(stat.type)) {
                  delete fullObject[key];
              }
          }
          return fullObject;
      }
      addPeerConnectionEventListeners(peerId, pc) {
          const id = peerId;
          pc.addEventListener('icecandidate', (e) => {
              this.addToTimeline({
                  event: 'onicecandidate',
                  tag: 'connection',
                  peerId: id,
                  data: e.candidate
              });
          });
          pc.addEventListener('track', (e) => {
              const track = e.track;
              const stream = e.streams[0] || null;
              // save the remote stream
              this.peersToMonitor[id].stream = stream;
              this.addTrackEventListeners(track);
              this.addCustomEvent('track', {
                  event: 'ontrack',
                  tag: 'track',
                  peerId: id,
                  data: {
                      stream: stream ? this.getStreamDetails(stream) : null,
                      track: this.getMediaTrackDetails(track),
                      title: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) { return 'stream:' + stream.id; })
                  }
              });
          });
          pc.addEventListener('signalingstatechange', () => {
              this.addToTimeline({
                  event: 'onsignalingstatechange',
                  tag: 'connection',
                  peerId: id,
                  data: pc.signalingState
              });
          });
          pc.addEventListener('iceconnectionstatechange', () => {
              this.addToTimeline({
                  event: 'oniceconnectionstatechange',
                  tag: 'connection',
                  peerId: id,
                  data: pc.iceConnectionState
              });
          });
          pc.addEventListener('icegatheringstatechange', () => {
              this.addToTimeline({
                  event: 'onicegatheringstatechange',
                  tag: 'connection',
                  peerId: id,
                  data: pc.iceGatheringState
              });
          });
          pc.addEventListener('icecandidateerror', (ev) => {
              this.addToTimeline({
                  event: 'onicecandidateerror',
                  tag: 'connection',
                  peerId: id,
                  error: {
                      errorCode: ev.errorCode
                  }
              });
          });
          pc.addEventListener('connectionstatechange', () => {
              this.addToTimeline({
                  event: 'onconnectionstatechange',
                  tag: 'connection',
                  peerId: id,
                  data: pc.connectionState
              });
          });
          pc.addEventListener('negotiationneeded', () => {
              this.addToTimeline({
                  event: 'onnegotiationneeded',
                  tag: 'connection',
                  peerId: id
              });
          });
          pc.addEventListener('datachannel', (event) => {
              this.addToTimeline({
                  event: 'ondatachannel',
                  tag: 'datachannel',
                  peerId: id,
                  data: event.channel
              });
          });
      }
      /**
       * Called when we get the stream from getUserMedia. We parse the stream and fire events
       * @param  {Object} options
       */
      parseGetUserMedia(options) {
          const obj = {
              event: 'getUserMedia',
              tag: 'getUserMedia',
              data: { ...options }
          };
          // if we received the stream, get the details for the tracks
          if (options.stream) {
              obj.data.details = this.parseStream(options.stream);
          }
          this.addCustomEvent('getUserMedia', obj);
      }
      parseStream(stream) {
          const result = {
              audio: null,
              video: null
          };
          // at this point we only read one stream
          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];
          if (audioTrack) {
              result['audio'] = this.getMediaTrackDetails(audioTrack);
          }
          if (videoTrack) {
              result['video'] = this.getMediaTrackDetails(videoTrack);
          }
          return result;
      }
      getMediaTrackDetails(track) {
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
          };
      }
      getStreamDetails(stream) {
          return {
              active: stream.active,
              id: stream.id,
              _stream: stream
          };
      }
      /**
       * Add event listeners for the tracks that are added to the stream
       * @param {MediaStreamTrack} track
       */
      addTrackEventListeners(track) {
          track.addEventListener('mute', (ev) => {
              this.addCustomEvent('track', {
                  event: 'mute',
                  tag: 'track',
                  data: {
                      event: ev
                  }
              });
          });
          track.addEventListener('unmute', (ev) => {
              this.addCustomEvent('track', {
                  event: 'unmute',
                  tag: 'track',
                  data: {
                      event: ev
                  }
              });
          });
          track.addEventListener('overconstrained', (ev) => {
              this.addCustomEvent('track', {
                  event: 'overconstrained',
                  tag: 'track',
                  data: {
                      event: ev
                  }
              });
          });
      }
      addToTimeline(event) {
          const ev = {
              ...event,
              timestamp: new Date()
          };
          this.timeline.push(ev);
          this.emit('timeline', ev);
      }
      /**
       * Used to emit a custome event and also add it to the timeline
       * @param {String} eventName The name of the custome event: track, getUserMedia, stats, etc
       * @param {Object} options   The object tha will be sent with the event
       */
      addCustomEvent(eventName, options) {
          this.addToTimeline(options);
          if (eventName) {
              this.emit(eventName, options);
          }
      }
      // TODO
      wrapGetDisplayMedia() {
          const self = this;
          // @ts-ignore
          if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
              // @ts-ignore
              const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
              const gdm = function () {
                  self.debug('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
                  return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
                      .then(function (stream) {
                      // self.debug('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
                      return stream;
                  }, function (err) {
                      self.debug('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
                      return Promise.reject(err);
                  });
              };
              // @ts-ignore
              navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
          }
      }
  }

  window.WebRTCStats=WebRTCStats;

}());
