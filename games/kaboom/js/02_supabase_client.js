// ============================================================================
//  02_supabase_client.js — v2.0 (integrado com Uni Store)
// ============================================================================

const SUPABASE_URL      = 'https://ecxltpbmilpqwnrpazwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjeGx0cGJtaWxwcXducnBhendmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjI3MTMsImV4cCI6MjA5MzM5ODcxM30.ZOdYrp0WA6D1psU-X-d_v1eSe6ZGPk4oRYh_NNIogdM';

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 20 } },
  auth: { persistSession: true, autoRefreshToken: true }
});

window.K = {
  user:    null,
  player:  null,
  room:    null,
  channel: null
};

const KABOOM_GAME_ID = 'kaboom';

// ----------------------------------------------------------------------------
// 1) AUTH — agora REUSA a sessão da Uni Store
// ----------------------------------------------------------------------------

/**
 * Verifica se o jogador já está logado (via Uni Store) e se já tem perfil
 * de KABOOM. Retorna { hasSession, player }.
 *   hasSession=false → não tá logado, redireciona pro login
 *   hasSession=true, player=null → logado mas sem perfil de KABOOM ainda
 *   hasSession=true, player={...} → tudo pronto, vai direto pra home
 */
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { hasSession: false, player: null };

  K.user = session.user;

  const { data: player, error } = await sb
    .from('players')
    .select('*')
    .eq('id', session.user.id)
    .eq('game_id', KABOOM_GAME_ID)
    .maybeSingle();

  if (error) console.warn('Erro buscando player:', error.message);

  if (player) {
    K.player = player;
    iniciarRadarDeConvites();
  }

  return { hasSession: true, player };
}

/**
 * Cria perfil de KABOOM pro usuário logado (na primeira vez).
 * O username é único POR JOGO — pode ter "ExplosivoLouco" no KABOOM
 * e outro nome no Kiran, ambos vinculados ao mesmo e-mail.
 */
async function criarPlayerKaboom(username) {
  if (!K.user) throw new Error('NOT_AUTHENTICATED');

  const { data, error } = await sb.rpc('register_player', {
    p_username: username,
    p_game_id:  KABOOM_GAME_ID
  });
  if (error) {
    if (error.message.includes('USERNAME_TAKEN')) {
      throw new Error('Esse nome já tá em uso, escolhe outro!');
    }
    if (error.message.includes('PROFILE_ALREADY_EXISTS')) {
      throw new Error('Você já tem perfil neste jogo.');
    }
    throw error;
  }

  K.player = data;
  iniciarRadarDeConvites();
  return data;
}

/** Logout (volta pra Uni Store) */
async function signOut() {
  if (K.channel) await sb.removeChannel(K.channel);
  await sb.auth.signOut();
  K = { user: null, player: null, room: null, channel: null };
  window.location.href = '../../login.html';
}

// ----------------------------------------------------------------------------
// 2) PLAYERS — sempre filtrando por game_id
// ----------------------------------------------------------------------------

async function refreshMyPlayer() {
  const { data, error } = await sb.from('players')
    .select('*')
    .eq('id', K.user.id)
    .eq('game_id', KABOOM_GAME_ID)
    .single();
  if (error) throw error;
  K.player = data;
  return data;
}

async function getPlayerById(id) {
  const { data, error } = await sb.from('players')
    .select('*')
    .eq('id', id)
    .eq('game_id', KABOOM_GAME_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------------
// 3) AMIGOS — buscar, pedir, listar
// ----------------------------------------------------------------------------

async function searchPlayers(query) {
  const { data, error } = await sb.rpc('search_player', { p_query: query });
  if (error) throw error;
  return data || [];
}

async function sendFriendRequest(targetPlayerId) {
  const { error } = await sb.from('friendships').insert({
    requester_id: K.user.id,
    addressee_id: targetPlayerId,
    status: 'pending'
  });
  if (error) throw error;
}

async function respondFriendRequest(friendshipId, accept) {
  const { error } = await sb.from('friendships')
    .update({ status: accept ? 'accepted' : 'blocked', updated_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw error;
}

async function listFriends() {
  const { data, error } = await sb.from('friendships')
    .select('*')
    .or(`requester_id.eq.${K.user.id},addressee_id.eq.${K.user.id}`);
  if (error) throw error;

  const friends = [], pendingIn = [], pendingOut = [];
  for (const f of data) {
    if (f.status === 'accepted') {
      const otherId = f.requester_id === K.user.id ? f.addressee_id : f.requester_id;
      friends.push({ ...f, other_id: otherId });
    } else if (f.status === 'pending') {
      if (f.addressee_id === K.user.id) pendingIn.push(f);
      else pendingOut.push(f);
    }
  }

  const ids = [...new Set([
    ...friends.map(f => f.other_id),
    ...pendingIn.map(f => f.requester_id),
    ...pendingOut.map(f => f.addressee_id)
  ])];
  if (ids.length === 0) return { friends: [], pendingIn: [], pendingOut: [] };

  const { data: players } = await sb.from('players')
    .select('*')
    .in('id', ids)
    .eq('game_id', KABOOM_GAME_ID);
  const byId = Object.fromEntries((players || []).map(p => [p.id, p]));

  return {
    friends:    friends.map(f    => ({ ...f, player: byId[f.other_id] || { username: '?' } })),
    pendingIn:  pendingIn.map(f  => ({ ...f, player: byId[f.requester_id] || { username: '?' } })),
    pendingOut: pendingOut.map(f => ({ ...f, player: byId[f.addressee_id] || { username: '?' } }))
  };
}

// ----------------------------------------------------------------------------
// 4) RADAR DE CONVITES DE AMIZADE (mantém igual, vamos melhorar na FASE 3)
// ----------------------------------------------------------------------------

function iniciarRadarDeConvites() {
  if (!K.user) return;
  console.log('[KABOOM] Radar de convites de amizade ligado para:', K.user.id);

  sb.channel('radar-amizade-' + K.user.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'friendships',
      filter: `addressee_id=eq.${K.user.id}`
    }, (payload) => {
      console.log('[KABOOM] Convite de amizade recebido:', payload.new);
      mostrarConviteNaTela(payload.new);
    })
    .subscribe();
}

async function mostrarConviteNaTela(convite) {
  // 1. Busca o nome do jogador que mandou o convite
  const { data: player } = await sb.from('players')
    .select('username')
    .eq('id', convite.requester_id)
    .eq('game_id', KABOOM_GAME_ID)
    .maybeSingle();

  const nomeAmigo = player ? player.username : 'Alguém';

  // 2. Toca o alarme
  if (typeof AudioFx !== 'undefined') AudioFx.alarm();

  // 3. Cria um card flutuante bonito no topo da tela
  const toastId = 'friend-req-' + convite.id;
  const card = document.createElement('div');
  card.className = 'invite-card';
  card.id = toastId;
  card.style.position = 'fixed';
  card.style.top = '20px';
  card.style.left = '50%';
  card.style.transform = 'translateX(-50%)';
  card.style.zIndex = '999999';
  card.style.width = '90%';
  card.style.maxWidth = '400px';
  card.style.boxShadow = '0 8px 20px rgba(0,0,0,0.8)';
  card.style.animation = 'wobble 0.5s ease-out';

  card.innerHTML = `
    <div class="invite-card-title">🦊 <b>${nomeAmigo}</b> quer ser seu amigo!</div>
    <div class="invite-actions">
      <button class="invite-btn reject" id="rej-${toastId}">RECUSAR</button>
      <button class="invite-btn accept" id="acc-${toastId}">ACEITAR</button>
    </div>
  `;

  document.body.appendChild(card);

  // 4. Lógica de Aceitar e Recusar
  document.getElementById(`acc-${toastId}`).onclick = async () => {
    if (typeof AudioFx !== 'undefined') AudioFx.tap();
    card.remove();
    await respondFriendRequest(convite.id, true);
    alert(`${nomeAmigo} agora é seu amigo!`);
    if (typeof renderFriends === 'function') renderFriends();
  };

  document.getElementById(`rej-${toastId}`).onclick = () => {
    if (typeof AudioFx !== 'undefined') AudioFx.tap();
    card.remove();
    sb.from('friendships').delete().eq('id', convite.id).then();
  };

  // 5. O convite some sozinho se a pessoa ignorar por 15 segundos
  setTimeout(() => {
    const el = document.getElementById(toastId);
    if (el) el.remove();
  }, 15000);
}

// ----------------------------------------------------------------------------
// Exporta
// ----------------------------------------------------------------------------
Object.assign(window, {
  checkSession, criarPlayerKaboom, signOut,
  refreshMyPlayer, getPlayerById,
  searchPlayers, sendFriendRequest, respondFriendRequest,
  listFriends, iniciarRadarDeConvites,
  KABOOM_GAME_ID
});

console.log('[KABOOM] Cliente Supabase v2.0 carregado 🎉');