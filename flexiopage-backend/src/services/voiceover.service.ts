/**
 * Voice-over IA pour vidéos générées.
 *
 * Pipeline :
 *   1. TTS via fal-ai ElevenLabs multilingual v2 — supporte FR/AR/EN
 *      nativement, rendu MP3 hébergé sur fal.media (24h TTL).
 *   2. Téléchargement en local (temp file) du MP3 + de la vidéo Seedance.
 *   3. Mux ffmpeg : audio ajouté sur la piste vidéo, coupé à la durée de
 *      la vidéo (le TTS peut être plus long → on tronque, sinon la vidéo
 *      resterait figée sur son dernier frame le temps que la voix finisse).
 *   4. Persistance du MP4 final via `persistVideoBuffer` (R2/S3/local).
 *
 * Le binaire ffmpeg est fourni par `@ffmpeg-installer/ffmpeg` — pas besoin
 * d'installer ffmpeg au niveau système, ça marche en dev local comme en
 * prod Docker.
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { falQueueRequest } from './fal-landing.service';
import { persistVideoBuffer } from './storage.service';
import { logger } from '../lib/logger';

const FFMPEG_BIN = ffmpegInstaller.path;

// ElevenLabs multilingual v2 : 29 langues dont FR/AR/EN, voix naturelles.
// Coût côté fal ~$0.10 pour ~15-30s d'audio. Override possible via env
// pour tester Kokoro (gratuit, EN only) ou une autre voix.
const TTS_MODEL = process.env.FAL_TTS_MODEL || 'fal-ai/elevenlabs/tts/multilingual-v2';

// Voix ElevenLabs par défaut — Rachel (neutre, professionnelle, marche en
// multilingue). L'admin/vendeur peut override plus tard si besoin.
const DEFAULT_VOICE = process.env.FAL_TTS_VOICE || 'Rachel';

/**
 * Script de voix-off — plafonné pour éviter qu'un vendeur nous colle un
 * roman qui coûterait 10× le prix prévu. 300 chars ≈ 30-40 mots ≈ ~15-20s
 * de speech naturel, largement au-dessus des vidéos 12s max qu'on gère.
 */
const MAX_SCRIPT_CHARS = 300;

export interface VoiceoverInput {
  script: string;
  /** ISO 639-1 : fr / en / ar / es / ... — ElevenLabs auto-détecte de toute
   *  façon si non fourni mais on passe l'info quand on l'a. */
  language?: string;
  /** Voix ElevenLabs (nom ou voice_id). Défaut = Rachel. */
  voice?: string;
}

export interface VoiceoverResult {
  audioUrl: string;
  durationSeconds?: number;
}

/**
 * Génère la piste audio TTS. Renvoie l'URL fal.media du MP3 (TTL 24h) —
 * on ne la persiste pas car elle sera consommée immédiatement par le mux
 * puis le fichier final MP4 sera stocké à sa place.
 */
export async function generateVoiceover(input: VoiceoverInput): Promise<VoiceoverResult> {
  const script = (input.script || '').trim().slice(0, MAX_SCRIPT_CHARS);
  if (!script) {
    const err = new Error('Voiceover script is empty') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 400;
    err.publicMessage = 'Le script du voice-over est vide.';
    throw err;
  }

  // fal-ai ElevenLabs endpoint attend { text, voice, ... }
  const out = await falQueueRequest<{
    audio?: { url?: string; duration?: number; content_type?: string };
  }>(
    TTS_MODEL,
    {
      text: script,
      voice: input.voice || DEFAULT_VOICE,
      // stability / similarity_boost par défaut chez fal — pas besoin de
      // surcharger tant que la voix est correcte.
    },
    { maxWaitMs: 90_000 },
  );

  const audioUrl = out?.audio?.url;
  if (!audioUrl) {
    const err = new Error('TTS returned no audio URL') as Error & { statusCode?: number; publicMessage?: string };
    err.statusCode = 502;
    err.publicMessage = 'Le service voix n\'a pas renvoyé d\'audio. Réessaie.';
    throw err;
  }
  return { audioUrl, durationSeconds: out?.audio?.duration };
}

/**
 * Mux vidéo + audio dans un MP4 unique via ffmpeg.
 *
 * Stratégie :
 *  - Copie flux vidéo (`-c:v copy`) → aucun ré-encodage, rapide et sans perte.
 *  - Ré-encode audio en AAC 128k (`-c:a aac -b:a 128k`) car MP3 sur MP4
 *    passe mal sur Safari iOS.
 *  - `-shortest` : la sortie s'arrête dès que le plus court des deux flux
 *    finit — protège contre un TTS plus long que la vidéo (sinon on
 *    aurait un dernier frame figé pendant que la voix continue).
 *  - `-map 0:v:0 -map 1:a:0` : garde uniquement la vidéo de l'input 0 et
 *    l'audio de l'input 1 (Seedance ne renvoie pas d'audio, mais on est
 *    explicite au cas où le modèle change).
 */
async function muxVideoAudio(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  const args = [
    '-y',                       // overwrite
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',  // header au début → lecture streaming immédiate côté <video>
    outPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    const stderr: Buffer[] = [];
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      const msg = Buffer.concat(stderr).toString('utf8').slice(-1500);
      logger.error({ code, stderr: msg }, '[voiceover] ffmpeg mux failed');
      reject(new Error(`ffmpeg exited with code ${code}: ${msg}`));
    });
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed for ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

/**
 * Pipeline complet : prend une vidéo muette (URL) + un script, retourne
 * l'URL persistée du MP4 muxé. Ne touche pas au wallet — la facturation
 * est déjà faite en amont côté controller.
 *
 * Tous les fichiers temporaires sont supprimés dans `finally`, y compris
 * en cas d'échec, pour éviter d'engorger /tmp sur les workers longue vie.
 */
export async function addVoiceoverToVideo(
  videoUrl: string,
  voiceover: VoiceoverInput,
): Promise<string> {
  // Génère l'audio en parallèle avec le download vidéo pour gagner du temps :
  // le TTS met ~5-15s, le fetch vidéo ~1-3s, ils peuvent tourner en même temps.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flexio-vo-'));
  const inVideo = path.join(tmpDir, 'in.mp4');
  const inAudio = path.join(tmpDir, 'in.mp3');
  const outVideo = path.join(tmpDir, 'out.mp4');

  try {
    const [tts] = await Promise.all([
      generateVoiceover(voiceover),
      downloadTo(videoUrl, inVideo),
    ]);
    await downloadTo(tts.audioUrl, inAudio);
    await muxVideoAudio(inVideo, inAudio, outVideo);
    const muxed = await fs.readFile(outVideo);
    const finalUrl = await persistVideoBuffer(muxed, 'ai-videos');
    return finalUrl;
  } finally {
    // Best-effort cleanup — on avale les erreurs (fichier déjà supprimé,
    // permissions), le tmpdir sera de toute façon nettoyé par l'OS.
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
