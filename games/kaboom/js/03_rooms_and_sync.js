// ============================================================================
//  03_rooms_and_sync.js
//  Lobby + sincronização realtime + zoeira
//  Depende de: 02_supabase_client.js
// ============================================================================

// ----------------------------------------------------------------------------
// 1) CRIAR / ENTRAR / SAIR DE SALA
// ----------------------------------------------------------------------------

async function createRoom(mode /* '1v1' | '1v2' | '2v2' */) {
  const { data, error } = await sb.rpc('create_room', { p_mode: mode });
  if (error) throw error;
  K.room = data;
  await joinRoomChannel(data.id);
  return data;
}

async function joinRoomByCode(code, team /* 'A' | 'B' */) {
  const { data, error } = await sb.rpc('join_room', { p_code: code.toUpperCase(), p_team: team });
  if (error) {
    if (error.message.includes('TEAM_FULL'))     throw new Error('Esse time tá cheio.');
    if (error.message.includes('ROOM_NOT_FOUND')) throw new Error('Sala não existe ou já começou.');
    throw error;
  }
  K.room = data;
  await joinRoomChannel(data.id);
  return data;
}

async function switchTeam(team) {
  return joinRoomByCode(K.room.code, team);
}

async function toggleReady() {
  const { data, error } = await sb.rpc('toggle_ready', { p_room_id: K.room.id });
  if (error) throw error;
  K.room = data;
  return data;
}

async function leaveRoom() {
  if (!K.room) return;
  await sb.rpc('leave_room', { p_room_id: K.room.id });
  if (K.channel) { await sb.removeChannel(K.channel); K.channel = null; }
  K.room = null;
}

// ----------------------------------------------------------------------------
// 2) HOST: COMEÇAR PARTIDA
// ----------------------------------------------------------------------------

/** Sorteie a palavra antes de chamar. Servidor valida que todos estão ready. */
async function startMatch(word, hint) {
  const { data, error } = await sb.rpc('start_match', {
    p_room_id: K.room.id, p_word: word, p_hint: hint
  });
  if (error) {
    if (error.message.includes('NOT_HOST'))      throw new Error('Só o host começa.');
    if (error.message.includes('NOT_ALL_READY')) throw new Error('Tem gente que não tá pronta.');
    throw error;
  }
  K.room = data;
  return data;
}

// ----------------------------------------------------------------------------
// 3) PALPITAR LETRA
// ----------------------------------------------------------------------------

async function guessLetter(letter) {
  const { data, error } = await sb.rpc('guess_letter', {
    p_room_id: K.room.id, p_letter: letter
  });
  if (error) {
    if (error.message.includes('NOT_YOUR_TURN'))         throw new Error('Não é sua vez!');
    if (error.message.includes('LETTER_ALREADY_TRIED'))  throw new Error('Letra já tentada.');
    throw error;
  }
  K.room = data;
  return data;
}

// ----------------------------------------------------------------------------
// 4) REALTIME — escuta sala + canal de broadcast (zoeira, animações)
// ----------------------------------------------------------------------------

/**
 * Junta-se ao canal da sala. Escuta:
 *   • postgres_changes  → estado autoritativo da sala (slots, letras, bomba)
 *   • broadcast 'zoeira' → arremessos de zoeira
 *   • broadcast 'pulse'  → pulsação da bomba (ticks de timer)
 *   • presence           → quem tá online na sala
 */
async function joinRoomChannel(roomId) {
  if (K.channel) await sb.removeChannel(K.channel);

  const ch = sb.channel(`room:${roomId}`, {
    config: { presence: { key: K.user.id } }
  });

  // (a) Estado da sala — qualquer UPDATE sincroniza todo mundo
  ch.on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    payload => {
      K.room = payload.new;
      window.dispatchEvent(new CustomEvent('room:update', { detail: payload.new }));
    });

  // (b) Zoeira (broadcast leve, não persiste no banco)
  ch.on('broadcast', { event: 'zoeira' }, ({ payload }) => {
    window.dispatchEvent(new CustomEvent('zoeira:incoming', { detail: payload }));
  });

  // (c) Pulse da bomba (host emite a cada N ms enquanto seu turno acaba)
  ch.on('broadcast', { event: 'pulse' }, ({ payload }) => {
    window.dispatchEvent(new CustomEvent('bomb:pulse', { detail: payload }));
  });

  // (d) Presence — quem tá conectado
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState();
    window.dispatchEvent(new CustomEvent('presence:sync', { detail: state }));
  });

  await ch.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await ch.track({
        player_id: K.user.id,
        username:  K.player.username,
        joined_at: Date.now()
      });
    }
  });

  K.channel = ch;
}

// ----------------------------------------------------------------------------
// 5) ZOEIRA — arremessar item no oponente
// ----------------------------------------------------------------------------

const ZOEIRA_ITEMS = {
  egg:   { emoji: '🥚', label: 'Ovo',     sound: 'sfx_egg' },
  tomato:{ emoji: '🍅', label: 'Tomate',  sound: 'sfx_splat' },
  poop:  { emoji: '💩', label: 'Cocô',    sound: 'sfx_poop' }
};

/**
 * Joga zoeira em um oponente. Não passa pelo banco — broadcast realtime
 * direto pra latência baixa. O som dispara em todos os clientes.
 */
async function throwZoeira(targetPlayerId, itemKey) {
  if (!ZOEIRA_ITEMS[itemKey]) throw new Error('Item inválido');
  if (!K.channel) throw new Error('Sem canal');

  const payload = {
    from_id:    K.user.id,
    from_name:  K.player.username,
    target_id:  targetPlayerId,
    item:       itemKey,
    at:         Date.now()
  };

  await K.channel.send({ type: 'broadcast', event: 'zoeira', payload });
  // Toca o som localmente também (broadcast pode não voltar pro emissor)
  window.dispatchEvent(new CustomEvent('zoeira:incoming', { detail: payload }));
}

/** Pulse da bomba (host pode chamar em loop). */
async function broadcastBombPulse(level /* 0..8 */) {
  if (!K.channel) return;
  await K.channel.send({ type: 'broadcast', event: 'pulse', payload: { level, at: Date.now() } });
}

// ----------------------------------------------------------------------------
// 6) HELPERS DE LOBBY (renderizar slots)
// ----------------------------------------------------------------------------

function getAllSlots(room) {
  const a = (room.slots_a || []).map(s => ({ ...s, team: 'A' }));
  const b = (room.slots_b || []).map(s => ({ ...s, team: 'B' }));
  return [...a, ...b];
}

function isAllReady(room) {
  const all = getAllSlots(room);
  return all.length > 0 && all.every(s => s.ready);
}

function isMyTurn(room) {
  return room?.current_turn === K.user.id;
}

// ----------------------------------------------------------------------------
// Exporta
// ----------------------------------------------------------------------------
Object.assign(window, {
  createRoom, joinRoomByCode, switchTeam, toggleReady, leaveRoom,
  startMatch, guessLetter,
  joinRoomChannel, throwZoeira, broadcastBombPulse,
  getAllSlots, isAllReady, isMyTurn,
  ZOEIRA_ITEMS
});
