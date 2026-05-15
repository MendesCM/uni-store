// ============================================================================
//  05_audio_manager.js
//  Gerencia BGM (música em loop) e SFX (efeitos)
//  Persiste preferências de mute em localStorage.
// ============================================================================

const AudioMgr = (() => {
  // ----------------------------------------------------------------------
  // Catálogo de sons. Coloque seus arquivos em /assets/audio/
  // (mp3 funciona em todos os navegadores; ogg como fallback opcional)
  // ----------------------------------------------------------------------
  const TRACKS = {
    // BGM — música de fundo (loop)
    bgm_lobby:  { url: 'assets/audio/bgm_lobby.mp3',  loop: true,  volume: 0.4, kind: 'music' },
    bgm_match:  { url: 'assets/audio/bgm_match.mp3',  loop: true,  volume: 0.5, kind: 'music' },

    // SFX — efeitos (one-shot)
    sfx_click:    { url: 'assets/audio/click.mp3',     volume: 0.6, kind: 'sfx' },
    sfx_correct:  { url: 'assets/audio/correct.mp3',   volume: 0.7, kind: 'sfx' }, // verde
    sfx_wrong:    { url: 'assets/audio/wrong.mp3',     volume: 0.7, kind: 'sfx' }, // vermelho
    sfx_pulse:    { url: 'assets/audio/bomb_tick.mp3', volume: 0.5, kind: 'sfx' }, // pulsação
    sfx_kaboom:   { url: 'assets/audio/kaboom.mp3',    volume: 0.9, kind: 'sfx' }, // explosão
    sfx_egg:      { url: 'assets/audio/egg.mp3',       volume: 0.7, kind: 'sfx' },
    sfx_splat:    { url: 'assets/audio/splat.mp3',     volume: 0.7, kind: 'sfx' },
    sfx_poop:     { url: 'assets/audio/poop.mp3',      volume: 0.7, kind: 'sfx' },
    sfx_buy:      { url: 'assets/audio/buy.mp3',       volume: 0.7, kind: 'sfx' },
    sfx_equip:    { url: 'assets/audio/equip.mp3',     volume: 0.6, kind: 'sfx' },
    sfx_win:      { url: 'assets/audio/win.mp3',       volume: 0.8, kind: 'sfx' },
    sfx_lose:     { url: 'assets/audio/lose.mp3',      volume: 0.8, kind: 'sfx' }
  };

  const cache = new Map();         // url → HTMLAudioElement (preload)
  let currentBGM = null;            // Audio element em loop
  let muted = {
    music: localStorage.getItem('kb_mute_music') === '1',
    sfx:   localStorage.getItem('kb_mute_sfx')   === '1'
  };

  // ----------------------------------------------------------------------
  // Pré-carregamento (chame uma vez no boot, opcional mas recomendado)
  // ----------------------------------------------------------------------
  function preloadAll() {
    Object.values(TRACKS).forEach(t => {
      if (cache.has(t.url)) return;
      const a = new Audio();
      a.src = t.url;
      a.preload = 'auto';
      a.volume = t.volume;
      cache.set(t.url, a);
    });
  }

  // ----------------------------------------------------------------------
  // Disparo de SFX (clones pra poder tocar várias vezes sobrepostas)
  // ----------------------------------------------------------------------
  function play(name) {
    const t = TRACKS[name];
    if (!t) { console.warn('Som inexistente:', name); return; }
    if (muted[t.kind]) return;

    if (t.kind === 'music') return playBGM(name);

    // SFX: clona o nó pra suportar disparos rápidos
    const base = cache.get(t.url) || new Audio(t.url);
    cache.set(t.url, base);
    const node = base.cloneNode();
    node.volume = t.volume;
    node.play().catch(() => {/* autoplay bloqueado, ignora */});
  }

  // ----------------------------------------------------------------------
  // BGM (música de fundo, troca suave)
  // ----------------------------------------------------------------------
  function playBGM(name) {
    const t = TRACKS[name];
    if (!t || t.kind !== 'music') return;

    // Já tocando? não recomeça
    if (currentBGM && currentBGM._key === name && !currentBGM.paused) return;

    if (currentBGM) {
      fadeOut(currentBGM, 400, () => currentBGM.pause());
    }

    const node = new Audio(t.url);
    node.loop = true;
    node.volume = 0;
    node._key = name;
    node.play().catch(() => {/* autoplay */});
    fadeIn(node, t.volume, 600);
    currentBGM = node;
  }

  function stopBGM() {
    if (currentBGM) { fadeOut(currentBGM, 300, () => currentBGM.pause()); currentBGM = null; }
  }

  // ----------------------------------------------------------------------
  // Mute / unmute
  // ----------------------------------------------------------------------
  function setMute(kind /* 'music'|'sfx' */, value) {
    muted[kind] = value;
    localStorage.setItem('kb_mute_' + kind, value ? '1' : '0');
    if (kind === 'music' && currentBGM) currentBGM.muted = value;
  }

  function toggleMute(kind) { setMute(kind, !muted[kind]); return muted[kind]; }
  function isMuted(kind)    { return muted[kind]; }

  // ----------------------------------------------------------------------
  // Fades simples
  // ----------------------------------------------------------------------
  function fadeIn(node, target, duration) {
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      node.volume = target * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function fadeOut(node, duration, done) {
    const start = performance.now();
    const startVol = node.volume;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      node.volume = startVol * (1 - t);
      if (t < 1) requestAnimationFrame(step); else done && done();
    };
    requestAnimationFrame(step);
  }

  // ----------------------------------------------------------------------
  // Listeners automáticos para eventos do jogo
  // (Conecte aqui pros sons "se ligarem sozinhos" quando algo acontece)
  // ----------------------------------------------------------------------
  function attachGameListeners() {
    window.addEventListener('zoeira:incoming', e => {
      const item = e.detail.item;
      const sndMap = { egg: 'sfx_egg', tomato: 'sfx_splat', poop: 'sfx_poop' };
      play(sndMap[item] || 'sfx_splat');
    });

    window.addEventListener('bomb:pulse', e => {
      play('sfx_pulse');
      if (e.detail.level >= 8) play('sfx_kaboom');
    });

    window.addEventListener('room:update', e => {
      const r = e.detail;
      // Acerto (nova letra revelada)
      if (r._lastEvent === 'correct') play('sfx_correct');
      if (r._lastEvent === 'wrong')   play('sfx_wrong');
      if (r.state === 'finished')     play(r.score_a > r.score_b ? 'sfx_win' : 'sfx_lose');
    });
  }

  return {
    TRACKS, preloadAll, play, playBGM, stopBGM,
    setMute, toggleMute, isMuted, attachGameListeners
  };
})();

window.AudioMgr = AudioMgr;
