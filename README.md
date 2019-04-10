# WebRTC Stats

WebRTC Stats helps you with everything related to getting and parsing the stats for your app's WebRTC PeerConnections.
On top of handling getting the stats for each peer in the call it also offers a parsed object that better helps you understand what's happening with the connection.

WebRTC Stats is using `EventEmitter` to fire events that you can listen to in your app.

The library is heavily inspired by [@fippo](https://github.com/fippo)'s work on a similar library.

## Install
```sh
npm install @peermetrics/webrtc-stats
```

## Usage
### Loding the module
WebRTC Stats can be loaded as an ES6 module, node module or directly in the browser.

After loading the module, initialize it. 
*See [Options](#options) for all the initalize options*
```js
let stats = new WebRTCStats({
    getStatsInterval: 5000
})
```
Add events listeners on the to listen to the `stats` event:
```js
stats.on('stats', (ev) => {
    console.log('stats', ev)
})
```
Use the `stats` object to add peers to the list to monitor:
```js
let pc1 = new Peer({...})
stats.addPeer({
    pc: pc1,
    peerId: '1' # any string/int that helps you identify this peer
})
```
Now every `5000` ms  WebRTC Stats will fire the `stats` event that will come with and object has the option
```js
{
    event: 'stats',
    tag: 'stats',
    peerId: '1',
    data: {...}, # an object created after parsing the stats
    rawStats: RTCStatsReport, # the actual RTCStatsReport results from `getStats()`
    statsObject: {}, # an object created from RTCStatsReport that uses the `id` for each report as a key
    filteredStats: {}, # same as statsObject but with some report types filtered out (eg: `codec`, `certificate`)
}
```

### Options
The module accepts the following options when initialized:
```js
let stats = new WebRTCStats({
    # the interval in ms of how often we should get stats
    getStatsInterval: 5000, # Default: 1000

    # if we should include the original RTCStatsReport map when firing the `stats` event
    rawStats: false, # Default: false

    # include an object that resulted from transforming RTCStatsReport into an oject (`report.id` as the key)
    statsObject: true, # Default: false
    
    # if we should filter out some stats
    filteredStats: false, # Default: false
    
    # If we should wrap methods from the `PeerConnection` class to capture events in the timeline. 
    # Wraps methods like: `addTrack`, `removeTrack`,  'createOffer', 'createAnswer', etc
    wrapRTCPeerConnection: false, # Default: false

    # If we should wrap the `geUserMedia` calls so we can gather events when the methods is called or success/error
    wrapGetUserMedia: false, # Default: false
    # If he module should wrape legacy `getUserMedia` metods: `navigator.getUserMedia`, `navigator.mozGetUserMedia`, navigator.webkitGetUserMedia
    wrapLegacyGetUserMedia: false, # Default: false
    
    # What prefixes for `getUserMedia` we should wrap, only is if `wrapLegacyGetUserMedia` is true
    prefixesToWrap: [], # Default: ['', 'moz', 'webkit'],
    
    # If turned on, calls `console.log`
    debug: false, # Default: false
})
```

### API
#### `.addPeer(options)`
Adds a peer to the watch list.
`options`
  - `pc`: the `RTCPeerConnection` instance
  - `peerId`: String/Int a unique Id to identify this peer
Monitoring of a peer will automatically end when the connection is closed.

#### `.getTimeline([filter])`
Return the array of events from the timeline up to that point.
If the optional `filter` string is present it will filter out events. Possible values: `peer`, `ice`, `sdp`, `track`, `stats`, `getUserMedia`

### Events
The module uses `EventEmitter` to emit events. You can listen to them using `.on()`
```js
stats.on('eventName', (ev) => {
})
```
`ev` will have the following structure:
```js
{
    # The event name. Usually the method called (addTrack, createAnswer)
    event: '', 
    # The tag for this event. `stats`, `sdp`, `getUserMedia`, etc
    tag: '',
    # The id for the peer that fired this event
    peerId: '',
    # Data for each event type
    data: {},
    
    # The following appear certain times
    # The error that appeared in the method we were watching
    error: {},
    # These appear on the `stats` event
    rawStats: {},
    statsObject: {},
    filteredStats: {}
}
```

#### List of fired events
Some events are not fired if for example `wrapLegacyGetUserMedia` and `wrapRTCPeerConnection` are `false`.
- `timeline`: this will fire when something has been added to the timeline. 
- `stats`: fired for each peer when we've collected stats for it
- `getUserMedia`: when `getUserMedia` is called initially
- `peer`: when a peer was added
- `track`: a track event: addTrack, removeTrack, mute, unmute, overconstrained
- `sdp`
- `ice`

## License
MIT
