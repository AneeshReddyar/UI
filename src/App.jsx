import React, { useState, useRef, useEffect } from 'react'
import { 
  Room, 
  RoomEvent, 
  ConnectionState, 
  ParticipantEvent,
  RemoteAudioTrack,
  LocalAudioTrack
} from 'livekit-client'
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Loader2, 
  Car,
  Volume2,
  VolumeX
} from 'lucide-react'

const LIVEKIT_TOKEN_SERVER = import.meta.env.VITE_TOKEN_SERVER_URL || 'http://localhost:5000'

function App() {
  const [room, setRoom] = useState(null)
  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected)
  const [isMuted, setIsMuted] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [participantName, setParticipantName] = useState('')
  const [roomName, setRoomName] = useState('car-service-room')
  const [error, setError] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  
  const audioRef = useRef(null)
  const roomRef = useRef(null)

  // Cleanup function
  const cleanup = async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect()
      roomRef.current = null
    }
    setRoom(null)
    setConnectionState(ConnectionState.Disconnected)
    setAgentSpeaking(false)
    setIsConnecting(false)
    setError('')
  }

  // Connect to LiveKit room
  const connect = async () => {
    if (!participantName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')

    try {
      // Get token from server
      const tokenResponse = await fetch(
        `${LIVEKIT_TOKEN_SERVER}/token?roomName=${encodeURIComponent(roomName)}&participantName=${encodeURIComponent(participantName)}`
      )
      
      if (!tokenResponse.ok) {
        throw new Error(`Token server error: ${tokenResponse.status}`)
      }
      
      const { token, url } = await tokenResponse.json()
      
      // Create room and connect
      const newRoom = new Room({
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      // Setup event handlers
      newRoom
        .on(RoomEvent.Connected, () => {
          console.log('Connected to room')
          setConnectionState(ConnectionState.Connected)
          setIsConnecting(false)
        })
        .on(RoomEvent.Disconnected, () => {
          console.log('Disconnected from room')
          setConnectionState(ConnectionState.Disconnected)
          setAgentSpeaking(false)
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.log('Track subscribed:', track.kind, participant.identity)
          if (track instanceof RemoteAudioTrack && participant.identity.includes('agent')) {
            if (audioRef.current) {
              track.attach(audioRef.current)
            }
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          console.log('Track unsubscribed:', track.kind, participant.identity)
          if (track instanceof RemoteAudioTrack) {
            track.detach()
          }
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          console.log('Participant connected:', participant.identity)
          if (participant.identity.includes('agent')) {
            // Agent joined
            participant
              .on(ParticipantEvent.TrackMuted, (track) => {
                if (track.kind === 'audio') {
                  setAgentSpeaking(false)
                }
              })
              .on(ParticipantEvent.TrackUnmuted, (track) => {
                if (track.kind === 'audio') {
                  setAgentSpeaking(true)
                }
              })
          }
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          console.log('Connection state changed:', state)
          setConnectionState(state)
          if (state === ConnectionState.Reconnecting) {
            setIsConnecting(true)
          } else if (state === ConnectionState.Connected) {
            setIsConnecting(false)
          }
        })

      await newRoom.connect(url, token)
      
      // Enable microphone
      await newRoom.localParticipant.setMicrophoneEnabled(true)
      
      roomRef.current = newRoom
      setRoom(newRoom)
      
    } catch (err) {
      console.error('Failed to connect:', err)
      setError(`Connection failed: ${err.message}`)
      setIsConnecting(false)
      await cleanup()
    }
  }

  // Disconnect from room
  const disconnect = async () => {
    await cleanup()
  }

  // Toggle microphone
  const toggleMicrophone = async () => {
    if (!room) return
    
    try {
      await room.localParticipant.setMicrophoneEnabled(!isMuted)
      setIsMuted(!isMuted)
    } catch (err) {
      console.error('Failed to toggle microphone:', err)
    }
  }

  // Toggle audio output
  const toggleAudio = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioEnabled
      setAudioEnabled(!audioEnabled)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const isConnected = connectionState === ConnectionState.Connected
  const isConnectedOrConnecting = isConnected || isConnecting

  return (
    <div className="min-h-screen p-6 flex items-center justify-center">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="glass-card p-6 rounded-full">
              <Car className="w-12 h-12 text-blue-400" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Car Service Assistant
            </h1>
            <p className="text-blue-200">
              Schedule your car service with voice commands
            </p>
          </div>
        </div>

        {/* Connection Form */}
        {!isConnected && (
          <div className="glass-card p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnecting}
              />
            </div>
            
            <button
              onClick={connect}
              disabled={isConnecting || !participantName.trim()}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  Start Voice Chat
                </>
              )}
            </button>
          </div>
        )}

        {/* Connection Status */}
        {isConnectedOrConnecting && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`status-indicator ${
                  isConnected ? 'bg-green-400' : 
                  isConnecting ? 'bg-yellow-400 animate-pulse' : 
                  'bg-red-400'
                }`} />
                <span className="text-white font-medium">
                  {isConnected ? 'Connected' : 
                   isConnecting ? 'Connecting...' : 
                   'Disconnected'}
                </span>
              </div>
              
              {agentSpeaking && (
                <div className="flex items-center gap-2 text-blue-400">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-sm">Agent speaking</span>
                </div>
              )}
            </div>

            {/* Voice Controls */}
            {isConnected && (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={toggleMicrophone}
                  className={`p-4 rounded-full transition-all duration-200 shadow-lg ${
                    isMuted 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-green-500 hover:bg-green-600'
                  } text-white`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                
                <button
                  onClick={toggleAudio}
                  className={`p-4 rounded-full transition-all duration-200 shadow-lg ${
                    audioEnabled 
                      ? 'bg-blue-500 hover:bg-blue-600' 
                      : 'bg-gray-500 hover:bg-gray-600'
                  } text-white`}
                  title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                >
                  {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
                
                <button
                  onClick={disconnect}
                  className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all duration-200 shadow-lg"
                  title="End Call"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="glass-card p-4 border-red-500/50">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="glass-card p-4">
          <h3 className="font-semibold text-white mb-2">How to use:</h3>
          <ul className="text-blue-200 text-sm space-y-1">
            <li>• Click "Start Voice Chat" to connect</li>
            <li>• Speak naturally to schedule services</li>
            <li>• You can interrupt the agent anytime</li>
            <li>• Use the mute button to control your mic</li>
          </ul>
        </div>

        {/* Hidden audio element for agent voice */}
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />
      </div>
    </div>
  )
}

export default App