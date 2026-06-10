import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Square, Volume2, VolumeX, Settings, Bot, User, AlertTriangle, Loader2, Radio, ChevronRight, Terminal } from 'lucide-react'
import { api } from '../utils/api'
import { useNavigate } from 'react-router-dom'

// ── VoiceChat ─────────────────────────────────────────────────────────────────
// Phone-optimised voice assistant for the hotel.
// Records audio (MediaRecorder), sends to Whisper STT, matches intent,
// and plays ElevenLabs TTS responses. Also monitors active runs and
// reads out agent talk_bot messages in each bot's own ElevenLabs voice.

const TALK_BOT_RE = /\[tool→\] talk_bot \{[^}]*?"bot_id"\s*:\s*(\d+)[^}]*?"message"\s*:\s*"((?:[^"\\]|\\.)*)"/

function parseTalkBotLine(line) {
  const m = line.match(TALK_BOT_RE)
  if (!m) return null
  return { botId: Number(m[1]), message: m[2].replace(/\\n/g, ' ').replace(/\\"/g, '"') }
}

export default function VoiceChat({ me }) {
  const navigate = useNavigate()

  // ── key availability ──────────────────────────────────────────────────────
  const [keys, setKeys] = useState(null)   // { openai, elevenlabs } — masked strings or null
  const [keysLoading, setKeysLoading] = useState(true)

  useEffect(() => {
    api('/api/account/api-keys')
      .then(d => {
        const map = {}
        for (const k of d.keys || []) map[k.provider] = k.masked
        setKeys(map)
      })
      .catch(() => setKeys({}))
      .finally(() => setKeysLoading(false))
  }, [])

  const hasOpenAI = keys && keys['openai']
  const hasElevenLabs = keys && keys['elevenlabs']
  const ready = hasOpenAI && hasElevenLabs

  // ── hotel state ───────────────────────────────────────────────────────────
  const [activeRun, setActiveRun] = useState(null)
  const [liveBots, setLiveBots] = useState([])

  useEffect(() => {
    const poll = async () => {
      try {
        const d = await api('/api/agents/status')
        const runs = d.trigger?.activeRuns || []
        const mine = runs.find(r => r.from === me?.username)
        setActiveRun(mine || null)
        setLiveBots((d.bots || []).filter(b => b.room_id > 0))
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [me?.username])

  // ── chat history ──────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState([])
  const chatEndRef = useRef(null)
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatHistory])

  // ── TTS audio queue ───────────────────────────────────────────────────────
  const audioQueue = useRef([])
  const playingAudio = useRef(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)

  const drainQueue = useCallback(async () => {
    if (!audioQueue.current.length) { playingAudio.current = false; setTtsPlaying(false); return }
    playingAudio.current = true
    setTtsPlaying(true)
    const { text, voiceId } = audioQueue.current.shift()
    try {
      const res = await fetch('/api/chat/tts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId || undefined }),
      })
      if (!res.ok) { drainQueue(); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); drainQueue() }
      audio.onerror = () => { URL.revokeObjectURL(url); drainQueue() }
      audio.play().catch(() => drainQueue())
    } catch { drainQueue() }
  }, [])

  const queueTTS = useCallback((text, voiceId = null) => {
    if (!text?.trim()) return
    audioQueue.current.push({ text: text.trim(), voiceId })
    if (!playingAudio.current) drainQueue()
  }, [drainQueue])

  // ── log monitoring — talk_bot → chat bubbles, other lines → collapsible "Thinking" blocks
  const seenLines = useRef(new Set())
  const pendingLogs = useRef([]) // buffer non-talk lines between polls

  useEffect(() => {
    if (!activeRun) return
    const id = setInterval(async () => {
      try {
        const d = await api(`/api/agents/logs?lines=150&room_id=${activeRun.roomId}`)
        const newLines = (d.lines || []).filter(l => !seenLines.current.has(l))
        if (!newLines.length) return
        for (const line of newLines) seenLines.current.add(line)

        const talkBotEntries = []
        const logEntries = []

        for (const line of newLines) {
          const parsed = parseTalkBotLine(line)
          if (parsed) {
            // Flush any pending log lines as a "thinking" block before the chat message
            if (pendingLogs.current.length || logEntries.length) {
              const allLogs = [...pendingLogs.current, ...logEntries]
              pendingLogs.current = []
              if (allLogs.length) {
                talkBotEntries.push({ role: 'logs', lines: allLogs })
              }
            }
            const bot = liveBots.find(b => b.id === parsed.botId)
            const voiceId = bot?.elevenlabs_voice_id || null
            const botName = bot?.name || `Bot ${parsed.botId}`
            talkBotEntries.push({ role: 'bot', text: parsed.message, botName, voiceId })
          } else {
            // Classify the log line for display
            logEntries.push(line)
          }
        }

        // Buffer remaining non-talk logs for next poll (they'll flush when a talk_bot appears or when the run ends)
        pendingLogs.current.push(...logEntries)

        // If we have buffered logs but no talk_bot, push a "thinking" block every 5+ lines so the user sees progress
        if (!talkBotEntries.length && pendingLogs.current.length >= 5) {
          talkBotEntries.push({ role: 'logs', lines: [...pendingLogs.current] })
          pendingLogs.current = []
        }

        if (talkBotEntries.length) {
          setChatHistory(h => [...h, ...talkBotEntries])
          // Queue TTS for bot messages
          for (const entry of talkBotEntries) {
            if (entry.role === 'bot') queueTTS(entry.text, entry.voiceId)
          }
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(id)
  }, [activeRun, liveBots, queueTTS])

  // Flush remaining logs when run ends + reset
  useEffect(() => {
    if (!activeRun && pendingLogs.current.length) {
      const remaining = [...pendingLogs.current]
      pendingLogs.current = []
      if (remaining.length) {
        setChatHistory(h => [...h, { role: 'logs', lines: remaining }])
      }
    }
    seenLines.current = new Set()
    pendingLogs.current = []
  }, [activeRun?.roomId])

  // ── recording state ───────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const checkSilenceRef = useRef(null)
  const chunksRef = useRef([])
  const [micLevel, setMicLevel] = useState(0)

  const stopAndSend = useCallback(async () => {
    if (checkSilenceRef.current) { clearInterval(checkSilenceRef.current); checkSilenceRef.current = null }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const sendTranscript = useCallback(async (text) => {
    if (!text?.trim()) { setProcessing(false); return }
    setTranscript(text)
    setChatHistory(h => [...h, { role: 'user', text }])
    try {
      const d = await api('/api/chat/intent', { method: 'POST', body: { transcript: text } })
      setChatHistory(h => [...h, { role: 'assistant', text: d.response }])
      queueTTS(d.response)
    } catch (err) {
      const msg = err.message || 'Something went wrong.'
      setChatHistory(h => [...h, { role: 'error', text: msg }])
    } finally {
      setProcessing(false)
    }
  }, [queueTTS])

  const startRecording = useCallback(async () => {
    if (recording || processing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      // Silence detection via AnalyserNode
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      checkSilenceRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length)
        setMicLevel(Math.min(1, rms / 20))
        if (rms < 4) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => stopAndSend(), 1500)
          }
        } else {
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
        }
      }, 80)

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        clearInterval(checkSilenceRef.current)
        clearTimeout(silenceTimerRef.current)
        stream.getTracks().forEach(t => t.stop())
        ctx.close()
        setRecording(false)
        setMicLevel(0)

        const chunks = chunksRef.current
        if (!chunks.length) { setProcessing(false); return }

        setProcessing(true)
        const blob = new Blob(chunks, { type: mimeType })
        try {
          const d = await fetch('/api/chat/audio', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': mimeType },
            body: blob,
          }).then(r => r.json())
          if (!d.ok) throw new Error(d.message || 'Transcription failed')
          await sendTranscript(d.transcript)
        } catch (err) {
          setChatHistory(h => [...h, { role: 'error', text: err.message }])
          setProcessing(false)
        }
      }

      recorder.start()
      setRecording(true)
      setTranscript('')
    } catch (err) {
      setChatHistory(h => [...h, { role: 'error', text: `Microphone error: ${err.message}` }])
    }
  }, [recording, processing, stopAndSend, sendTranscript])

  const stopRecording = useCallback(() => {
    stopAndSend()
  }, [stopAndSend])

  // ── setup screen when keys are missing ───────────────────────────────────
  if (keysLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 max-w-md mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Mic className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Voice Chat Setup Required</h2>
          <p className="text-sm text-muted-foreground mb-4">
            To use Voice Chat you need to add API keys for speech recognition and text-to-speech.
          </p>
          <div className="text-left space-y-3 mb-6">
            <SetupRow
              done={!!hasOpenAI}
              label="OpenAI API Key"
              detail="Used for Whisper speech-to-text"
              link="https://platform.openai.com/api-keys"
            />
            <SetupRow
              done={!!hasElevenLabs}
              label="ElevenLabs API Key"
              detail="Used for text-to-speech voices"
              link="https://elevenlabs.io/app/settings/api-keys"
            />
          </div>
        </div>
        <button
          onClick={() => navigate('/app/settings')}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Go to Settings → Voice & Audio
        </button>
      </div>
    )
  }

  // ── main voice chat UI ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Hotel Voice Chat</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {ttsPlaying && (
            <span className="flex items-center gap-1 text-primary">
              <Volume2 className="w-3 h-3" /> Speaking…
            </span>
          )}
          {activeRun && (
            <span className="flex items-center gap-1 text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Room {activeRun.roomId} active
            </span>
          )}
        </div>
      </div>

      {/* chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chatHistory.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <Mic className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Tap the mic and start talking</p>
            <p className="text-xs mt-1 opacity-70">Try: "What teams are active?" or "Start the marketing team"</p>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <ChatBubble key={i} msg={msg} />
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* mic button area */}
      <div className="px-4 py-6 border-t border-border">
        {processing && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
            <Loader2 className="w-3 h-3 animate-spin" />
            Transcribing…
          </div>
        )}
        {recording && (
          <div className="flex items-center justify-center gap-2 text-xs text-red-500 mb-4">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording… speak now, pause to send
          </div>
        )}

        <div className="flex items-center justify-center gap-6">
          {/* mute/stop TTS */}
          <button
            onClick={() => { audioQueue.current = []; playingAudio.current = false; setTtsPlaying(false) }}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Stop playback"
          >
            <VolumeX className="w-4 h-4" />
          </button>

          {/* main mic button */}
          <MicButton
            recording={recording}
            processing={processing}
            level={micLevel}
            onStart={startRecording}
            onStop={stopRecording}
          />

          {/* stop team */}
          {activeRun ? (
            <button
              onClick={async () => {
                try { await api('/api/agents/stop', { method: 'POST', body: {} }) } catch { /* ignore */ }
              }}
              className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500/20 transition-colors"
              title="Stop active team"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── sub-components ────────────────────────────────────────────────────────────

function SetupRow({ done, label, detail, link }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${done ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
      <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : 'border-2 border-muted-foreground'}`}>
        {done && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
        {!done && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-0.5 block">
            Get your key →
          </a>
        )}
      </div>
    </div>
  )
}

function MicButton({ recording, processing, level, onStart, onStop }) {
  const size = 64
  const ringScale = 1 + level * 0.4

  return (
    <button
      onClick={recording ? onStop : onStart}
      disabled={processing}
      className="relative flex items-center justify-center focus:outline-none"
      style={{ width: size * 2, height: size * 2 }}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
    >
      {/* animated ring when recording */}
      {recording && (
        <span
          className="absolute inset-0 rounded-full bg-red-500/20 transition-transform duration-75"
          style={{ transform: `scale(${ringScale})` }}
        />
      )}
      <span
        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 shadow-lg ${
          processing
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : recording
            ? 'bg-red-500 text-white'
            : 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
        }`}
      >
        {processing ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : recording ? (
          <MicOff className="w-7 h-7" />
        ) : (
          <Mic className="w-7 h-7" />
        )}
      </span>
    </button>
  )
}

function ChatBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isBot = msg.role === 'bot'
  const isAssistant = msg.role === 'assistant'
  const isError = msg.role === 'error'
  const isLogs = msg.role === 'logs'

  if (isError) {
    return (
      <div className="flex items-start gap-2 text-red-500">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span className="text-xs">{msg.text}</span>
      </div>
    )
  }

  if (isLogs) {
    return <LogBlock lines={msg.lines} />
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
          isBot ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'
        }`}>
          {isBot ? <Bot className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {isBot && msg.botName && (
          <span className="text-xs text-muted-foreground px-1">{msg.botName}</span>
        )}
        <div className={`px-3 py-2 rounded-2xl text-sm leading-snug ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : isBot
            ? 'bg-blue-500/10 text-foreground border border-blue-500/20 rounded-bl-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}>
          {msg.text}
        </div>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-muted mt-0.5">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function LogBlock({ lines }) {
  const [open, setOpen] = useState(false)

  // Summarize: count tool calls, thinking lines, errors
  const toolCalls = lines.filter(l => /\[tool→\]/.test(l)).length
  const errors = lines.filter(l => /\[tool:err\]|\[mcp:err\]|error/i.test(l)).length
  const summary = [
    toolCalls > 0 && `${toolCalls} tool call${toolCalls > 1 ? 's' : ''}`,
    errors > 0 && `${errors} error${errors > 1 ? 's' : ''}`,
    `${lines.length} line${lines.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        <Terminal className="w-3 h-3" />
        <span>Agent activity — {summary}</span>
        {errors > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
      </button>
      {open && (
        <div className="mt-1 bg-card border border-border rounded-lg p-2 max-h-48 overflow-y-auto">
          <pre className="text-[10px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all">
            {lines.map((line, i) => {
              // Color-code log lines
              const isToolCall = /\[tool→\]/.test(line)
              const isToolResult = /\[tool←\]/.test(line)
              const isThink = /\[think\]/.test(line)
              const isDone = /\[done\]/.test(line)
              const isError = /\[tool:err\]|\[mcp:err\]|error/i.test(line)
              const isTrigger = /\[trigger\]/.test(line)
              const cls = isError ? 'text-red-400'
                : isToolCall ? 'text-blue-400'
                : isToolResult ? 'text-green-400'
                : isDone ? 'text-green-300'
                : isThink ? 'text-yellow-400/70'
                : isTrigger ? 'text-purple-400'
                : ''
              // Strip timestamp prefix to save space
              const stripped = line.replace(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]\s*/, '')
              return <span key={i} className={cls}>{stripped}{'\n'}</span>
            })}
          </pre>
        </div>
      )}
    </div>
  )
}
