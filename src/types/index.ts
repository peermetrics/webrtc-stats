
export interface WebRTCStatsConstructorOptions {
    getStatsInterval: number
    rawStats: boolean
    statsObject: boolean
    filteredStats: boolean
    wrapGetUserMedia: boolean
    debug: boolean
    remote: boolean
    logLevel: LogLevel
}

/**
 * none: Show nothing at all.
 * error: Log all errors.
 * warn: Only log all warnings and errors.
 * info: Informative messages including warnings and errors.
 * debug: Show everything including debugging information
 */
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug'

export type TimelineTag = 'getUserMedia' | 'peer' | 'connection' | 'track' | 'datachannel' | 'stats'

export interface TimelineEvent {
    event: string
    tag: TimelineTag
    timestamp?: Date
    data?: any
    peerId?: string
    connectionId?: string
    error?: any
}

export interface StatsEvent {
    event: string
    tag: TimelineTag
    timestamp?: Date
    data: any
    peerId: string
    connectionId: string
    timeTaken: number
    rawStats?: RTCStatsReport
    statsObject?: any
    filteredStats?: any
}

export interface AddConnectionOptions {
    pc: RTCPeerConnection
    peerId: string
    connectionId?: string
    remote?: boolean
}

export interface AddConnectionResponse {
    connectionId: string
}

export interface GetUserMediaResponse {
    constraints?: MediaStreamConstraints
    stream?: MediaStream
    error?: DOMError
}

export interface MonitorPeerOptions {
    peerId: string
    pc: RTCPeerConnection
    connectionId?: string
    remote?: boolean
}

export interface MonitoredPeer {
    pc: RTCPeerConnection
    connectionId: string
    stream: MediaStream | null
    stats: any
    options: {
        remote: boolean
    }
}

interface MonitoredPeerCollection {
    [index: string]: MonitoredPeer
}

export interface MonitoredPeersObject {
    [index: string]: MonitoredPeerCollection
}

export interface RemoveConnectionOptions {
    pc?: RTCPeerConnection
    connectionId?: string
}

export interface RemoveConnectionReturn {
    connectionId: string
}

export interface TrackReport extends RTCStats {
    bitrate?: number
    packetRate?: number
}

interface StatsObjectDetails {
    inbound: TrackReport[]
    outbound: TrackReport[]
}
export interface StatsObject {
    audio: StatsObjectDetails
    video: StatsObjectDetails
    remote?: {
        audio: StatsObjectDetails
        video: StatsObjectDetails
    }
    connection: any
}

export interface CodecInfo {
    clockRate: number
    mimeType: number
    payloadType: number
}

export interface ParseStatsOptions {
    remote?: boolean
}
