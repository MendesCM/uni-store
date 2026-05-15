// ============================================================================
//  04_customization_and_shop.js
//  Loja, compra, equipar cosméticos
//  Toda lógica crítica vai por RPC (autoridade do servidor).
// ============================================================================

// ----------------------------------------------------------------------------
// 1) LISTAR CATÁLOGO E O QUE EU TENHO
// ----------------------------------------------------------------------------

async function loadShop() {
  const { data: catalog, error } = await sb.from('cosmetics')
    .select('*').eq('is_active', true).order('type').order('price_gems');
  if (error) throw error;

  // Marca quais o jogador já tem
  const owned = new Set(K.player.owned_cosmetics || []);
  return catalog.map(c => ({
    ...c,
    owned:    owned.has(c.id),
    equipped: c.id === K.player.equipped_avatar
           || c.id === K.player.equipped_color
           || c.id === K.player.equipped_frame
  }));
}

// ----------------------------------------------------------------------------
// 2) COMPRAR (debita gemas, valida tudo no servidor)
// ----------------------------------------------------------------------------

async function buyCosmetic(cosmeticId) {
  const { data, error } = await sb.rpc('buy_cosmetic', { p_cosmetic_id: cosmeticId });
  if (error) {
    if (error.message.includes('NOT_ENOUGH_GEMS')) throw new Error('Gemas insuficientes 💎');
    if (error.message.includes('ALREADY_OWNED'))   throw new Error('Você já tem isso.');
    if (error.message.includes('COSMETIC_NOT_FOUND')) throw new Error('Item não existe.');
    throw error;
  }
  K.player = data;  // resposta já traz player atualizado
  AudioMgr?.play('sfx_buy');
  window.dispatchEvent(new CustomEvent('player:updated', { detail: data }));
  return data;
}

// ----------------------------------------------------------------------------
// 3) EQUIPAR (valida ownership)
// ----------------------------------------------------------------------------

async function equipCosmetic(cosmeticId) {
  const { data, error } = await sb.rpc('equip_cosmetic', { p_cosmetic_id: cosmeticId });
  if (error) {
    if (error.message.includes('NOT_OWNED')) throw new Error('Compre primeiro 💸');
    throw error;
  }
  K.player = data;
  AudioMgr?.play('sfx_equip');
  window.dispatchEvent(new CustomEvent('player:updated', { detail: data }));

  // Se estiver numa sala, re-entra pra atualizar o slot com novo visual
  if (K.room) await switchTeam(getMyTeam(K.room) || 'A');
  return data;
}

function getMyTeam(room) {
  if ((room.slots_a || []).some(s => s.player_id === K.user.id)) return 'A';
  if ((room.slots_b || []).some(s => s.player_id === K.user.id)) return 'B';
  return null;
}

// ----------------------------------------------------------------------------
// 4) RENDER HELPER — pega o "visual" de qualquer slot do lobby
// ----------------------------------------------------------------------------

const AVATAR_EMOJI = {
  fox: '🦊', panda: '🐼', koala: '🐨', lion: '🦁', tiger: '🐯', dragon: '🐲'
};

const FRAME_STYLE = {
  normal:        { border: '3px solid #2b2b2b',                     boxShadow: 'none' },
  frame_silver:  { border: '3px solid #C0C0C0',                     boxShadow: '0 0 8px #C0C0C0' },
  frame_gold:    { border: '3px solid #FFD700',                     boxShadow: '0 0 12px #FFD700' },
  frame_neon:    { border: '3px solid #FF006E',                     boxShadow: '0 0 16px #FF006E, 0 0 32px #FF006E' }
};

/** Devolve um <div> pronto representando o jogador no lobby. */
function renderPlayerCard(slot, opts = {}) {
  const card = document.createElement('div');
  card.className = 'kb-card';
  const frame = FRAME_STYLE[slot.frame] || FRAME_STYLE.normal;
  card.style.cssText = `
    width: 96px; height: 96px; border-radius: 50%;
    background: ${slot.color || '#FFD166'};
    display: flex; align-items: center; justify-content: center;
    font-size: 56px; user-select: none;
    border: ${frame.border}; box-shadow: ${frame.boxShadow};
    transition: transform .15s;
  `;
  card.textContent = AVATAR_EMOJI[slot.avatar] || '🦊';
  card.dataset.playerId = slot.player_id;

  if (slot.ready) card.style.outline = '4px solid #06D6A0';
  if (opts.isCurrentTurn) card.style.transform = 'scale(1.1)';
  return card;
}

// ----------------------------------------------------------------------------
// Exporta
// ----------------------------------------------------------------------------
Object.assign(window, {
  loadShop, buyCosmetic, equipCosmetic,
  AVATAR_EMOJI, FRAME_STYLE, renderPlayerCard, getMyTeam
});
