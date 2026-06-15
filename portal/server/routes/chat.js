// /api/chat/* — voice transcription, TTS, intent parsing.
import express from 'express';

export function registerChatRoutes(app, ctx) {
  const {
    db,
    authRequired,
    getPortalUserByHabboUserId,
    decryptApiKey,
    forwardToAgentTrigger,
    AGENT_TRIGGER_URL,
    PORTAL_INTERNAL_SECRET,
    rconCommand,
  } = ctx;

  // POST /api/chat/audio — transcribe audio via OpenAI Whisper
  app.post('/api/chat/audio', authRequired, express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const [[keyRow]] = await db.execute(
        'SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
        [portalUser.id, 'openai']
      );
      if (!keyRow) return res.status(402).json({ error: 'no_openai_key', message: 'No OpenAI API key configured. Add one in Settings → Voice & Audio.' });

      const openaiKey = decryptApiKey(keyRow.api_key_encrypted);
      const audioType = req.headers['content-type'] || 'audio/webm';
      const ext = audioType.includes('mp4') || audioType.includes('m4a') ? 'm4a' : 'webm';

      const file = new File([req.body], `audio.${ext}`, { type: audioType });
      const form = new FormData();
      form.append('file', file);
      form.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(502).json({ error: 'whisper_error', message: err.error?.message || 'Whisper API error' });
      }
      const { text } = await r.json();
      res.json({ ok: true, transcript: text || '' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/tts — synthesize text via ElevenLabs
  const ttsCors = (req, res, next) => {
    const origin = req.headers.origin || 'http://localhost:8080';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
  app.post('/api/chat/tts', ttsCors, authRequired, express.json(), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const [[keyRow]] = await db.execute(
        'SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
        [portalUser.id, 'elevenlabs']
      );
      if (!keyRow) return res.status(402).json({ error: 'no_elevenlabs_key', message: 'No ElevenLabs API key configured. Add one in Settings → Voice & Audio.' });

      const elKey = decryptApiKey(keyRow.api_key_encrypted);

      let resolvedVoice = req.body.voice_id;
      if (!resolvedVoice) {
        const [[voiceRow]] = await db.execute(
          'SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
          [portalUser.id, 'elevenlabs_voice']
        );
        resolvedVoice = voiceRow ? decryptApiKey(voiceRow.api_key_encrypted) : null;
      }
      resolvedVoice = resolvedVoice || 'EXAVITQu4vr4xnSDxMaL';

      const text = (req.body.text || '').slice(0, 250);
      if (!text) return res.status(400).json({ error: 'text required' });

      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoice}`, {
        method: 'POST',
        headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const msg = err.detail?.message || err.detail || 'ElevenLabs API error';
        return res.status(502).json({ error: 'elevenlabs_error', message: msg.includes('quota') ? 'Your ElevenLabs account has run out of credits. Top up at elevenlabs.io or use a different API key.' : msg });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      const reader = r.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(Buffer.from(value));
        return pump();
      };
      await pump();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/tts/hotel — unauthenticated TTS for Nitro client (uses key from body)
  const ttsHotelCors = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
  app.all('/api/chat/tts/hotel', ttsHotelCors, express.json(), async (req, res) => {
    if (req.method === 'OPTIONS') return;
    const t0 = Date.now();
    const text = (req.body.text || '').slice(0, 250);
    const elKey = (req.body.api_key || '').trim();
    const voiceId = req.body.voice_id || 'EXAVITQu4vr4xnSDxMaL';
    if (!text) return res.status(400).json({ error: 'text required' });
    if (!elKey) return res.status(400).json({ error: 'api_key required' });
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.log(`[TIMING] tts/hotel ELEVENLABS_FAIL ms=${Date.now() - t0} textLen=${text.length} status=${r.status}`);
        return res.status(502).json({ error: 'elevenlabs_error', message: err.detail?.message || 'ElevenLabs error' });
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      const reader = r.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { console.log(`[TIMING] tts/hotel OK ms=${Date.now() - t0} textLen=${text.length}`); res.end(); return; }
        res.write(Buffer.from(value));
        return pump();
      };
      await pump();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/ai_next/hotel — unauthenticated signal for Nitro client to advance bot duet turn
  const aiNextHotelCors = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
  app.all('/api/chat/ai_next/hotel', aiNextHotelCors, express.json(), async (req, res) => {
    if (req.method === 'OPTIONS') return;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const t0 = Date.now();
    try {
      await rconCommand('executecommand', { user_id, command: ':ai_next' });
      console.log(`[TIMING] ai_next/hotel user_id=${user_id} rconMs=${Date.now() - t0}`);
      res.json({ ok: true });
    } catch (err) {
      console.log(`[TIMING] ai_next/hotel user_id=${user_id} rconMs=${Date.now() - t0} error=${err.message}`);
      res.status(502).json({ error: err.message });
    }
  });

  // POST /api/chat/intent — parse voice intent via Claude Haiku, execute hotel action
  app.post('/api/chat/intent', authRequired, express.json(), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const transcript = (req.body.transcript || '').trim();
      if (!transcript) return res.status(400).json({ error: 'transcript required' });

      const [triggerRes, [teams], [keyRows]] = await Promise.all([
        fetch(`${AGENT_TRIGGER_URL}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => ({ activeRuns: [] })),
        db.execute('SELECT id, name, default_room_id FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC', [portalUser.id]),
        db.execute('SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1', [portalUser.id, 'anthropic']),
      ]);
      const activeRuns = triggerRes.activeRuns || [];
      const myRuns = activeRuns.filter(r => r.from === req.user.username);
      const teamNames = teams.map(t => t.name);

      const anthropicKey = keyRows.length ? decryptApiKey(keyRows[0].api_key_encrypted) : null;

      let parsed = null;
      if (anthropicKey) {
        try {
          const systemPrompt = `You are a voice command parser for a hotel AI platform. The user manages AI agent teams.

Available teams: ${teamNames.length ? teamNames.join(', ') : '(none)'}
Active runs: ${myRuns.length ? myRuns.map(r => `room ${r.roomId}`).join(', ') : 'none'}

Parse the user's voice transcript into a JSON object with these fields:
- "intent": one of "start_team", "stop", "status", "list_teams", "unknown"
- "team_name": the team name they referenced (best match from available teams, or null)
- "goal": what they want the team to do (free-form string, or null)
- "reply": a short natural spoken response (1-2 sentences, friendly, for text-to-speech)

Rules:
- Match team names loosely: "marketing room" matches "Marketing Room", "marketing" matches "Alex Rivera · Marketing Room"
- If the user wants to start/launch/run/do/activate any team with a task, intent = "start_team"
- Extract the goal from natural speech: "analyze the website X" → goal = "analyze the website X"
- If intent is unknown, set reply to a helpful suggestion mentioning their available teams
- Keep replies SHORT — they will be spoken aloud

Respond with ONLY valid JSON, no markdown.`;

          const haikuRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system: systemPrompt, messages: [{ role: 'user', content: transcript }] }),
            signal: AbortSignal.timeout(8000),
          });
          if (haikuRes.ok) {
            const haikuData = await haikuRes.json();
            const raw = (haikuData.content?.[0]?.text || '').trim();
            try { parsed = JSON.parse(raw); } catch { /* fall through to regex */ }
          }
        } catch { /* Haiku unavailable — fall through to regex */ }
      }

      if (!parsed) {
        const msg = transcript.toLowerCase();
        if (/\b(active|running|status|what.*team|which.*team.*run|any.*team|who.*work)\b/i.test(msg)) {
          parsed = { intent: 'status', team_name: null, goal: null, reply: null };
        } else if (/\b(list|show|which)\b.*\bteam/i.test(msg) || /\bmy team/i.test(msg)) {
          parsed = { intent: 'list_teams', team_name: null, goal: null, reply: null };
        } else if (/\b(stop|halt|cancel|kill)\b/i.test(msg)) {
          parsed = { intent: 'stop', team_name: null, goal: null, reply: null };
        } else {
          const m = msg.match(/(?:start|launch|run|deploy|do|activate|let.*do)\s+(?:the\s+)?(?:team\s+)?(.+)/i);
          if (m) {
            const rest = m[1].trim();
            const team = teams.find(t => rest.includes(t.name.toLowerCase())) || teams.find(t => {
              const words = t.name.toLowerCase().split(/[\s·,]+/).filter(Boolean);
              return words.some(w => w.length > 2 && rest.includes(w));
            });
            parsed = { intent: 'start_team', team_name: team?.name || null, goal: rest, reply: null };
          } else {
            parsed = { intent: 'unknown', team_name: null, goal: null, reply: "You can ask me: 'what teams are active', 'show my teams', 'stop all teams', or 'start the (team name) to do (task)'." };
          }
        }
      }

      const { intent, team_name, goal, reply } = parsed;

      if (intent === 'status') {
        if (!myRuns.length) {
          return res.json({ ok: true, response: reply || `No teams are currently active. Your available teams are: ${teamNames.join(', ')}.` });
        }
        return res.json({ ok: true, response: reply || `You have ${myRuns.length} active run${myRuns.length > 1 ? 's' : ''}.` });
      }

      if (intent === 'list_teams') {
        return res.json({ ok: true, response: reply || `Your teams are: ${teamNames.join(', ')}.` });
      }

      if (intent === 'stop') {
        await fetch(`${AGENT_TRIGGER_URL}/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': PORTAL_INTERNAL_SECRET },
          body: JSON.stringify({}),
        });
        return res.json({ ok: true, response: reply || 'Stopping your active teams now.' });
      }

      if (intent === 'start_team') {
        const team = team_name
          ? teams.find(t => t.name.toLowerCase().includes(team_name.toLowerCase()))
          : teams[0];
        if (!team) {
          return res.json({ ok: true, response: reply || `I couldn't find that team. Your teams are: ${teamNames.join(', ')}.` });
        }
        const triggerResult = await forwardToAgentTrigger({
          team_id: team.id,
          user_team: true,
          room_id: team.default_room_id,
          task_mode: goal ? 'session_goal' : 'team_tasks',
          session_goal: goal || undefined,
          triggered_by: req.user.username,
          portal_user_id: portalUser.id,
          portal_url: process.env.PORTAL_URL || '',
          hotel_integrated: true,
          language: 'en',
        });
        if (!triggerResult.ok) return res.json({ ok: true, response: `Failed to start the ${team.name} team. Check the logs for details.` });
        return res.json({ ok: true, response: reply || `Starting the ${team.name} team now. Watch the hotel — your bots will begin shortly.` });
      }

      res.json({ ok: true, response: reply || "I didn't catch that. You can ask what teams are active, or say something like 'start the marketing team'." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
