// Manages a single shared AudioContext and exposes beep / noiseBurst helpers.
export function useAudio() {
  const ctx = { current: null }

  function ensureAudio() {
    if (!ctx.current) {
      ctx.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (ctx.current.state === 'suspended') ctx.current.resume()
  }

  function beep({ freq = 220, duration = 0.07, type = 'square', gain = 0.02, slideTo = null }) {
    try {
      ensureAudio()
      const ac = ctx.current
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, ac.currentTime)
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + duration)
      g.gain.setValueAtTime(0.0001, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration)
      osc.connect(g).connect(ac.destination)
      osc.start()
      osc.stop(ac.currentTime + duration + 0.02)
    } catch (_) {}
  }

  function noiseBurst(gain = 0.035, duration = 0.05) {
    try {
      ensureAudio()
      const ac = ctx.current
      const buffer = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      const src = ac.createBufferSource()
      src.buffer = buffer
      const filter = ac.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1400
      const g = ac.createGain()
      g.gain.value = gain
      src.connect(filter).connect(g).connect(ac.destination)
      src.start()
    } catch (_) {}
  }

  return { beep, noiseBurst }
}
