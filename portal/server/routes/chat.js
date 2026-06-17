// /api/chat/* — voice transcription, TTS, orchestration voice agent.
import express from 'express';
import { runVoiceOrchestratorAgent } from '../lib/voiceOrchestratorAgent.js';

const TIER_RANK = { basic: 0, pro: 1, enterprise: 2 };

export function registerChatRoutes(app, ctx) {
  const {
    db,
    authRequired,
    getPortalUserByHabboUserId,
    apiKeys,
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

      const openaiKey = await apiKeys.getDecryptedKey(portalUser.id, 'openai');
      if (!openaiKey) return res.status(402).json({ error: 'no_openai_key', message: 'No OpenAI API key configured. Add one in Settings → Voice & Audio.' });

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

      const elKey = await apiKeys.getDecryptedKey(portalUser.id, 'elevenlabs');
      if (!elKey) return res.status(402).json({ error: 'no_elevenlabs_key', message: 'No ElevenLabs API key configured. Add one in Settings → Voice & Audio.' });

      const resolvedVoice = req.body.voice_id || await apiKeys.getElevenLabsVoice(portalUser.id) || 'EXAVITQu4vr4xnSDxMaL';

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

  // POST /api/chat/tts/hotel — TTS for the in-hotel Nitro client.
  // Authenticated with a portal bearer token (minted by the emulator after SSO);
  // the ElevenLabs key + voice are resolved server-side and never reach the browser.
  const ttsHotelCors = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
  app.all('/api/chat/tts/hotel', ttsHotelCors, authRequired, express.json(), async (req, res) => {
    const t0 = Date.now();
    const text = (req.body.text || '').slice(0, 250);
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      const elKey = await apiKeys.getDecryptedKeyByHabbo(req.user.habbo_user_id, 'elevenlabs');
      if (!elKey) return res.status(402).json({ error: 'no_elevenlabs_key', message: 'No ElevenLabs API key configured for this account.' });

      const voiceId = req.body.voice_id || await apiKeys.getElevenLabsVoiceByHabbo(req.user.habbo_user_id) || 'EXAVITQu4vr4xnSDxMaL';

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

  // POST /api/chat/ai_next/hotel — signal for the Nitro client to advance a bot duet turn.
  // Authenticated with a portal bearer token; the user id comes from the token, not the body.
  const aiNextHotelCors = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
  app.all('/api/chat/ai_next/hotel', aiNextHotelCors, authRequired, express.json(), async (req, res) => {
    const user_id = req.user.habbo_user_id;
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

  // POST /api/chat/intent — Anthropic agent with orchestration tools (voice + text)
  app.post('/api/chat/intent', authRequired, express.json(), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const transcript = (req.body.transcript || '').trim();
      if (!transcript) return res.status(400).json({ error: 'transcript required' });

      const anthropicKey = await apiKeys.getDecryptedKey(portalUser.id, 'anthropic');
      if (!anthropicKey) {
        return res.status(402).json({
          error: 'no_anthropic_key',
          message: 'No Anthropic API key configured. Add one in Settings → Integrations.',
        });
      }

      const canDeployTeams = (TIER_RANK[portalUser.ai_tier] || 0) >= TIER_RANK.pro;

      const response = await runVoiceOrchestratorAgent({
        transcript,
        anthropicKey,
        ctx: {
          db,
          portalUser,
          username: req.user.username,
          canDeployTeams,
          forwardToAgentTrigger,
          agentTriggerUrl: AGENT_TRIGGER_URL,
          portalInternalSecret: PORTAL_INTERNAL_SECRET,
        },
      });

      res.json({ ok: true, response });
    } catch (err) {
      if (err.status === 401) {
        return res.status(502).json({ error: 'anthropic_auth', message: 'Anthropic API key is invalid. Update it in Settings → Integrations.' });
      }
      if (err.status === 429) {
        return res.status(502).json({ error: 'anthropic_rate_limit', message: 'Anthropic rate limit hit. Wait a moment and try again.' });
      }
      res.status(500).json({ error: err.message });
    }
  });
}
