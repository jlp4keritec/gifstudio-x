import { spawn } from 'node:child_process';

export interface VideoMetadata {
  durationSec: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitRate: number | null;
}

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
    });
  });
}

export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const stdout = await runFfprobe([
    '-v', 'error',
    '-show_entries',
    'format=duration,bit_rate:stream=codec_type,codec_name,width,height',
    '-of', 'json',
    filePath,
  ]);

  const parsed = JSON.parse(stdout);
  const format = parsed.format ?? {};
  const streams: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }> = parsed.streams ?? [];

  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  return {
    durationSec: Number(format.duration) || 0,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    bitRate: format.bit_rate ? Number(format.bit_rate) : null,
  };
}

export async function checkFfprobeAvailable(): Promise<boolean> {
  try {
    await runFfprobe(['-version']);
    return true;
  } catch {
    return false;
  }
}