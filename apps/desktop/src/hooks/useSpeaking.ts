import { useEffect, useState } from 'react';
export function useSpeaking(stream: MediaStream | null, muted = false) {
  const [speaking, setSpeaking] = useState(false);
  const trackCount = stream?.getAudioTracks().length ?? 0;
  useEffect(() => {
    if (!stream || muted || !stream.getAudioTracks().length) {
      setSpeaking(false);
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const bytes = new Uint8Array(analyser.fftSize);
    let previous = false;
    let lastLoud = 0;
    void context.resume();
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(bytes);
      const rms = Math.sqrt(
        bytes.reduce((sum, b) => sum + ((b - 128) / 128) ** 2, 0) / bytes.length,
      );
      if (rms > 0.025) lastLoud = Date.now();
      const active = Date.now() - lastLoud < 350;
      if (active !== previous) {
        previous = active;
        setSpeaking(active);
      }
    }, 120);
    return () => {
      clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [stream, muted, trackCount]);
  return speaking;
}
