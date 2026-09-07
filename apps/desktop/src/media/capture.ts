import type { Quality } from './types';
export async function captureScreen(quality: Quality, sourceId?: string, audio = false) {
  if (window.orbit && sourceId) await window.orbit.selectSource(sourceId, audio);
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: quality.width, max: quality.width },
      height: { ideal: quality.height, max: quality.height },
      frameRate: { ideal: quality.fps, max: quality.fps },
    },
    audio,
  });
  try {
    const track = stream.getVideoTracks()[0];
    await track?.applyConstraints({
      width: { max: quality.width },
      height: { max: quality.height },
      frameRate: { max: quality.fps },
    });
    return stream;
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
}
