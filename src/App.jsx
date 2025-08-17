import React, { useState, useRef, useEffect } from 'react'
import { 
  Room, 
  RoomEvent, 
  ConnectionState, 
  ParticipantEvent,
  RemoteAudioTrack,
  LocalAudioTrack,
  DataPacket_Kind
} from 'livekit-client'
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Loader2, 
  Car,
  Volume2,
  VolumeX,
  MessageSquare,
  User,
  Bot,
  Zap,
  Calendar,
  Settings,
  ChevronDown,
  Send
} from 'lucide-react'

const LIVEKIT_TOKEN_SERVER = 'http://localhost:5000' // You can make this configurable

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
  const [conversation, setConversation] = useState([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [agentStatus, setAgentStatus] = useState('idle') // idle, listening, thinking, speaking
  
  const audioRef = useRef(null)
  const roomRef = useRef(null)
  const conversationRef = useRef(null)

  // Auto-scroll conversation to bottom
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [conversation])

  // Add message to conversation
  const addMessage = (text, sender, type = 'final') => {
    const message = {
      id: Date.now() + Math.random(),
      text,
      sender, // 'user' or 'agent'
      timestamp: new Date(),
      type // 'partial', 'final'
    }
    
    if (type === 'partial') {
      setCurrentTranscript(text)
    } else {
      setCurrentTranscript('')
      setConversation(prev => [...prev, message])
    }
  }

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
    setConversation([])
    setCurrentTranscript('')
    setAgentStatus('idle')
  }

  // Connect to LiveKit room
  const connect = async () => {
    if (!participantName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')
    setConversation([])

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
        adaptiveStream: true,
        dynacast: true,
      })

      // Setup event handlers
      newRoom
        .on(RoomEvent.Connected, () => {
          console.log('Connected to room')
          setConnectionState(ConnectionState.Connected)
          setIsConnecting(false)
          addMessage('Connected to Car Service Assistant', 'system')
        })
        .on(RoomEvent.Disconnected, () => {
          console.log('Disconnected from room')
          setConnectionState(ConnectionState.Disconnected)
          setAgentSpeaking(false)
          setAgentStatus('idle')
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
            addMessage('Car Service Agent joined the conversation', 'system')
            // Agent joined
            participant
              .on(ParticipantEvent.TrackMuted, (track) => {
                if (track.kind === 'audio') {
                  setAgentSpeaking(false)
                  setAgentStatus('listening')
                }
              })
              .on(ParticipantEvent.TrackUnmuted, (track) => {
                if (track.kind === 'audio') {
                  setAgentSpeaking(true)
                  setAgentStatus('speaking')
                }
              })
          }
        })
        .on(RoomEvent.DataReceived, (payload, participant) => {
          // Handle conversation data from agent
          try {
            const decoder = new TextDecoder()
            const data = JSON.parse(decoder.decode(payload))
            
            if (data.type === 'transcription') {
              if (data.partial) {
                addMessage(data.text, data.sender, 'partial')
              } else {
                addMessage(data.text, data.sender, 'final')
              }
            } else if (data.type === 'agent_status') {
              setAgentStatus(data.status)
            }
          } catch (err) {
            console.error('Failed to parse data message:', err)
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

  // Send text message
  const sendTextMessage = (text) => {
    if (!room || !text.trim()) return
    
    const data = JSON.stringify({
      type: 'text_input',
      text: text.trim(),
      sender: 'user'
    })
    
    const encoder = new TextEncoder()
    room.localParticipant.publishData(encoder.encode(data), DataPacket_Kind.RELIABLE)
    addMessage(text.trim(), 'user')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const isConnected = connectionState === ConnectionState.Connected
  const isConnectedOrConnecting = isConnected || isConnecting

  // Get agent status display
  const getAgentStatusDisplay = () => {
    switch (agentStatus) {
      case 'listening': return { icon: <Mic className="w-4 h-4" />, text: 'Listening...', color: 'text-green-400' }
      case 'thinking': return { icon: <Loader2 className="w-4 h-4 animate-spin" />, text: 'Processing...', color: 'text-yellow-400' }
      case 'speaking': return { icon: <Volume2 className="w-4 h-4" />, text: 'Speaking...', color: 'text-blue-400' }
      default: return { icon: <Bot className="w-4 h-4" />, text: 'Ready', color: 'text-gray-400' }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <Car className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Car Service Assistant</h1>
              <p className="text-blue-300 text-sm">AI-powered voice scheduling</p>
            </div>
          </div>
          
          {isConnected && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  agentSpeaking ? 'bg-blue-400 animate-pulse' : 'bg-green-400'
                }`} />
                <span className="text-white text-sm font-medium">
                  {agentSpeaking ? 'Agent Speaking' : 'Connected'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          
          {/* Connection Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Connection Form */}
            {!isConnected ? (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 shadow-xl">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  Start Conversation
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-200 mb-2">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={participantName}
                      onChange={(e) => setParticipantName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isConnecting}
                      onKeyPress={(e) => e.key === 'Enter' && connect()}
                    />
                  </div>
                  
                  <button
                    onClick={connect}
                    disabled={isConnecting || !participantName.trim()}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Connect & Start
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Voice Controls */
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 shadow-xl">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Voice Controls
                </h2>
                
                {/* Agent Status */}
                <div className="mb-6 p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`${getAgentStatusDisplay().color}`}>
                      {getAgentStatusDisplay().icon}
                    </div>
                    <span className={`font-medium ${getAgentStatusDisplay().color}`}>
                      {getAgentStatusDisplay().text}
                    </span>
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    onClick={toggleMicrophone}
                    className={`p-4 rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                      isMuted 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-green-500 hover:bg-green-600'
                    } text-white`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    <span className="text-sm font-medium">
                      {isMuted ? 'Unmute' : 'Mute'}
                    </span>
                  </button>
                  
                  <button
                    onClick={toggleAudio}
                    className={`p-4 rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                      audioEnabled 
                        ? 'bg-blue-500 hover:bg-blue-600' 
                        : 'bg-gray-500 hover:bg-gray-600'
                    } text-white`}
                    title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                  >
                    {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    <span className="text-sm font-medium">Audio</span>
                  </button>
                </div>
                
                <button
                  onClick={disconnect}
                  className="w-full p-3 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-2"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Session
                </button>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 shadow-xl">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                How to Use
              </h3>
              <ul className="text-blue-200 text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
                  Click "Connect & Start" to begin
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
                  Speak naturally about your car service needs
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
                  Watch the conversation unfold in real-time
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
                  Interrupt the agent anytime to clarify
                </li>
              </ul>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-md rounded-xl p-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Conversation Panel */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shadow-xl flex-1 flex flex-col">
              {/* Conversation Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Live Conversation
                </h2>
                <div className="flex items-center gap-2 text-blue-300 text-sm">
                  <Calendar className="w-4 h-4" />
                  {new Date().toLocaleTimeString()}
                </div>
              </div>

              {/* Conversation Content */}
              <div 
                ref={conversationRef}
                className="flex-1 p-4 overflow-y-auto space-y-4 min-h-0"
              >
                {!isConnected && conversation.length === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-blue-300">
                      <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">Ready to Help!</p>
                      <p className="text-sm opacity-75">Connect to start your car service conversation</p>
                    </div>
                  </div>
                )}

                {conversation.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.sender === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[80%] ${
                        message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.sender === 'user'
                            ? 'bg-blue-500'
                            : message.sender === 'agent'
                            ? 'bg-green-500'
                            : 'bg-gray-500'
                        }`}
                      >
                        {message.sender === 'user' ? (
                          <User className="w-4 h-4 text-white" />
                        ) : message.sender === 'agent' ? (
                          <Bot className="w-4 h-4 text-white" />
                        ) : (
                          <Settings className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div
                        className={`p-3 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-blue-500/20 border border-blue-500/30'
                            : message.sender === 'agent'
                            ? 'bg-green-500/20 border border-green-500/30'
                            : 'bg-gray-500/20 border border-gray-500/30'
                        }`}
                      >
                        <p className="text-white text-sm leading-relaxed">
                          {message.text}
                        </p>
                        <p className="text-xs opacity-60 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Current transcript (partial) */}
                {currentTranscript && (
                  <div className="flex gap-3 justify-start opacity-75">
                    <div className="flex gap-3 max-w-[80%]">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-500">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                      <div className="p-3 rounded-2xl bg-gray-500/20 border border-gray-500/30 border-dashed">
                        <p className="text-white text-sm leading-relaxed italic">
                          {currentTranscript}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
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