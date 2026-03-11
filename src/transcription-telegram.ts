import OpenAI from 'openai';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const envVars = readEnvFile(['OPENAI_API_KEY']);
  const key = process.env.OPENAI_API_KEY || envVars.OPENAI_API_KEY || '';
  if (!key) return null;
  openaiClient = new OpenAI({ apiKey: key });
  return openaiClient;
}

/**
 * Download a Telegram voice message and transcribe it via OpenAI Whisper.
 * Returns transcribed text or null on failure.
 */
export async function transcribeTelegramVoice(
  botToken: string,
  fileId: string,
): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn('OpenAI API key not configured — cannot transcribe voice');
    return null;
  }

  try {
    // Get file path from Telegram
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
    );
    const data = (await res.json()) as {
      ok: boolean;
      result?: { file_path: string };
    };
    if (!data.ok || !data.result?.file_path) {
      logger.error({ fileId }, 'Failed to get Telegram file path');
      return null;
    }

    // Download the audio file
    const audioUrl = `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      logger.error({ fileId, status: audioRes.status }, 'Failed to download voice file');
      return null;
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Whisper expects a File-like object
    const file = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });

    logger.info(
      { fileId, length: transcription.text.length },
      'Voice message transcribed',
    );
    return transcription.text;
  } catch (err) {
    logger.error({ err, fileId }, 'Voice transcription failed');
    return null;
  }
}
