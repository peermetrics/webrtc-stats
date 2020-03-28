# WebRTC Stats

WebRTC Stats helps you with everything related to getting and parsing the stats for your app's WebRTC PeerConnections.
On top of handling getting the stats for each peer in the call it also offers a parsed object that better helps you understand what's happening with the connection.

WebRTC Stats is using `EventEmitter` to fire events that you can listen to in your app.

The library is heavily inspired by [@fippo](https://github.com/fippo)'s work on a similar library.

#### Migrating from v1
To see the changes that appeared in V2 see the [changelog](https://github.com/peermetrics/webrtc-stats/releases/tag/v2.0.0)

## How it works

The main idea of WebRTC Stats is to offer an easy way to read stats from `RTCPeerConnection`s. It helps with gathering the stats and has a pretty helpful object that helps you understand how that connection is going.

On top of that, it offers the `timeline` which is a list of events gathered from the RTC connections that will definitely help you with debugging. These are optional, but by wrapping methods like `getUserMedia`, `createOffer`, `addTrack`, etc. you get a clear picture of what happened.

## Install
```sh
npm install @peermetrics/webrtc-stats
```

## Usage
### Loading the module
WebRTC Stats can be loaded as an ES6 module, node module or directly in the browser.

After loading the module, initialize it. 
*See [Options](#options) for all the initialize options*
```js
let stats = new WebRTCStats({
    getStatsInterval: 5000
})
```
Add event listeners for `stats`:
```js
stats.on('stats', (ev) => {
    console.log('stats', ev)
})
```
Use `addPeer` to add peers to the list of monitored peers:
```js
let pc1 = new RTCPeerConnection({...})
stats.addPeer({
    pc: pc1,
    peerId: '1' # any string/int that helps you identify this peer
})
```
Now every `5000` ms  WebRTC Stats will fire the `stats` event which will come with the object:
```js
{
    event: 'stats',
    tag: 'stats',
    peerId: '1',
    timestamp: 'Sun Mar 22 2020 18:02:02', # a timestamp when this was fired
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
    
    # If we should wrap the `geUserMedia` calls so we can gather events when the methods is called or success/error
    wrapGetUserMedia: false, # Default: false
    
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
If the optional `filter` string is present it will filter out events. Possible values: `peer`, `connection`, `track`, `stats`, `getUserMedia`

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
    # A timestamp for when the event happened
    timestamp: '',
    # Data for each event type
    data: {},
    
    # The following attrs appear at certain times
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
- `connection`: any event related to connection
- `datachannel`: any datachannel event

## License
MIT

## Sponsorship
Platform testing is generously offered by BrowserStack
<br>
<a href="https://www.browserstack.com/" target="_blank" >
    <img src="https://user-images.githubusercontent.com/1862405/64006512-2b265a00-cb1b-11e9-9e28-d8afb305315a.png" alt="Browserstack" width="300">
</a>
