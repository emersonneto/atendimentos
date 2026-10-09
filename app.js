/* Sistema de Atendimentos — Field (site estático + Firebase) */
import { api } from './firebase.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

// Listas da planilha original
const STATUS = ['ENCAMINHADO', 'TENT CONTATO', 'AGENDADO', 'FECHADO'];
const ENCAMINHADO_PARA = ['GARANTIA', 'GLOBAL', 'LOGISTICA', 'QUALITY INFRA', 'SOFTPLAN', 'STI', 'REMOTO', 'REVOKE', 'VOLANTE', 'CTIS'];
const HOME_LOCAL = ['HOME', 'LOCAL'];

const S = {
  conta: null,        // usuário do Firebase Auth
  perfil: null,       // documento em "usuarios"
  usuarios: null,     // equipe (cache)
  mes: mesAtual(),
  filtros: { q: '', status: '', tecnico: null },
  painelTec: '',
  telaAuth: 'entrar',
};
const isAdmin = () => S.perfil && S.perfil.perfil === 'admin';

// --------------------------------------------------------------- utilidades
function mesAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function hojeISO() { return agoraLocal().slice(0, 10); }
function agoraLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function fmtDH(v) { if (!v) return ''; const [d, t] = v.split('T'); const [, m, dd] = d.split('-'); return `${dd}/${m} ${t || ''}`.trim(); }
function fmtData(v) { if (!v) return ''; const [y, m, d] = v.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function duracao(ini, fim) {
  if (!ini || !fim) return '';
  const min = Math.round((new Date(fim) - new Date(ini)) / 60000);
  if (isNaN(min) || min < 0) return '';
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
function nomeMes(m) { const [y, mm] = m.split('-'); return new Date(+y, +mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
const chip = st => st ? `<span class="chip ${esc(st.split(' ')[0])}">${esc(st)}</span>` : '<span class="muted">—</span>';
const iniciais = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const ordenar = l => l.sort((a, b) => (b.inicio || b.data_ref || '').localeCompare(a.inicio || a.data_ref || ''));
const dominioTxt = () => `nome@${api.DOMINIOS[0] || 'empresa.com.br'}`;
function emailDaEmpresa(email) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !api.DOMINIOS.length || api.DOMINIOS.map(d => d.toLowerCase()).includes(e.split('@')[1]);
}
function senhaFraca(s) {
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'A senha precisa ter letras e números.';
  return null;
}
function toast(msg, erro) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (erro ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = '', 3500);
}
const erroBox = (el, msg) => { el.innerHTML = msg ? `<div class="err">${esc(msg)}</div>` : ''; };

// --------------------------------------------------------------- normalização (formulário e importação)
const s = v => (v === undefined || v === null ? '' : String(v)).trim();
function normStatus(v) {
  const t = s(v).toUpperCase();
  if (!t) return '';
  if (t === 'E' || t.startsWith('ENCAMINH')) return 'ENCAMINHADO';
  if (t === 'H' || t.startsWith('TENT')) return 'TENT CONTATO';
  if (t === 'A' || t.startsWith('AGEND') || t.startsWith('CONTATO')) return 'AGENDADO';
  if (t === 'F' || t.startsWith('FECH')) return 'FECHADO';
  return '';
}
function normHomeLocal(v) {
  const t = s(v).toUpperCase();
  if (t === 'H' || t.startsWith('HOME') || t.startsWith('REMOTO')) return 'HOME';
  if (t === 'L' || t.startsWith('LOCAL')) return 'LOCAL';
  return '';
}
function normDataHora(v) {
  if (v === undefined || v === null || v === '') return '';
  const p = n => String(n).padStart(2, '0');
  if (typeof v === 'number' && v > 1) { // número de série do Excel
    const d = new Date(Math.round((v - 25569) * 1440) * 60000);
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }
  const t = s(v);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); if (m) return `${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4] || 0)}:${p(m[5] || 0)}`;
  return '';
}
function montarAtendimento(b, uid, tecnico) {
  const at = {
    uid, tecnico: s(tecnico).slice(0, 80),
    smax: s(b.smax).slice(0, 60), comarca: s(b.comarca).slice(0, 120),
    inicio: normDataHora(b.inicio), termino: normDataHora(b.termino),
    ticket_softplan: s(b.ticket_softplan).slice(0, 60), status: normStatus(b.status),
    encaminhado_para: ENCAMINHADO_PARA.includes(s(b.encaminhado_para).toUpperCase()) ? s(b.encaminhado_para).toUpperCase() : '',
    home_local: normHomeLocal(b.home_local), agendamento: normDataHora(b.agendamento),
    usuario_atendido: s(b.usuario_atendido).slice(0, 120), obs: s(b.obs).slice(0, 2000),
  };
  at.data_ref = (at.inicio || at.agendamento || '').slice(0, 10) || hojeISO();
  at.mes = at.data_ref.slice(0, 7);
  return at;
}
function validar(at) {
  if (!at.smax && !at.ticket_softplan) return 'Informe o nº da solicitação SMAX (ou o ticket Softplan).';
  if (!at.comarca) return 'Informe a comarca.';
  if (at.inicio && at.termino && at.termino < at.inicio) return 'O término não pode ser antes do início.';
  return null;
}

// --------------------------------------------------------------- campanha do mês (cores de conscientização)
// claro: true = cor clara, usa texto escuro na barra do topo
const CAMPANHAS = [
  { mes: 'Janeiro', nome: 'Janeiro Branco', cor: '#eef1f5', claro: true, tema: 'Saúde mental',
    texto: 'Mês de cuidar da saúde mental e emocional. Converse, peça ajuda e acolha quem precisa. Apoio emocional gratuito: CVV 188 (24h).' },
  { mes: 'Fevereiro', nome: 'Fevereiro Roxo', cor: '#6b2fa0', tema: 'Lúpus, fibromialgia e Alzheimer',
    texto: 'Conscientização sobre doenças crônicas sem cura, como lúpus, fibromialgia e Alzheimer. O diagnóstico precoce melhora a qualidade de vida.' },
  { mes: 'Março', nome: 'Março Lilás', cor: '#8450b8', tema: 'Câncer de colo de útero',
    texto: 'Prevenção ao câncer de colo do útero. O exame preventivo (Papanicolau) e a vacina contra o HPV salvam vidas.' },
  { mes: 'Abril', nome: 'Abril Azul', cor: '#1f5fae', tema: 'Autismo',
    texto: 'Conscientização sobre o Transtorno do Espectro Autista (TEA). Informação e respeito promovem inclusão.' },
  { mes: 'Maio', nome: 'Maio Amarelo', cor: '#f5c518', claro: true, tema: 'Segurança no trânsito',
    texto: 'Atenção pela vida no trânsito. No deslocamento entre comarcas: cinto, velocidade adequada e celular longe do volante.' },
  { mes: 'Junho', nome: 'Junho Vermelho', cor: '#b3202a', tema: 'Doação de sangue',
    texto: 'Incentivo à doação de sangue. Uma doação pode ajudar várias pessoas. Procure o hemocentro mais próximo.' },
  { mes: 'Julho', nome: 'Julho Amarelo', cor: '#f5c518', claro: true, tema: 'Hepatites virais',
    texto: 'Prevenção e diagnóstico das hepatites virais. Faça o teste e mantenha a vacinação em dia.' },
  { mes: 'Agosto', nome: 'Agosto Dourado', cor: '#d4a72c', claro: true, tema: 'Aleitamento materno',
    texto: 'Incentivo ao aleitamento materno, que protege a saúde do bebê e da mãe.' },
  { mes: 'Setembro', nome: 'Setembro Amarelo', cor: '#f5c518', claro: true, tema: 'Prevenção ao suicídio',
    texto: 'Falar é a melhor solução. Se você ou alguém próximo precisa de ajuda, ligue para o CVV 188 (gratuito, 24h) ou acesse cvv.org.br.' },
  { mes: 'Outubro', nome: 'Outubro Rosa', cor: '#c2386f', tema: 'Câncer de mama',
    texto: 'Prevenção e diagnóstico precoce do câncer de mama. Faça o autoexame e mantenha a mamografia em dia.' },
  { mes: 'Novembro', nome: 'Novembro Azul', cor: '#1d4e89', tema: 'Saúde do homem',
    texto: 'Cuidado com a saúde do homem e prevenção ao câncer de próstata. Consulte um médico regularmente.' },
  { mes: 'Dezembro', nome: 'Dezembro Vermelho', cor: '#b3202a', tema: 'HIV/AIDS',
    texto: 'Prevenção ao HIV/AIDS e outras ISTs. Faça o teste: é gratuito no SUS, e o tratamento também.' },
];
// dentro do sistema segue o mês selecionado no filtro; na tela de login, o mês de hoje
const campanhaAtual = () => CAMPANHAS[S.perfil && S.perfil.ativo && S.mes ? Number(S.mes.slice(5, 7)) - 1 : new Date().getMonth()];
function seloCampanha() {
  const c = campanhaAtual();
  return `<div class="campanha">
    <button type="button" class="campanha-btn" aria-expanded="false" title="${esc(c.nome)}: ${esc(c.tema)}">
      <span class="laco" style="background:${c.cor}"></span>${esc(c.nome)}</button>
    <div class="campanha-aviso" role="dialog" aria-label="${esc(c.nome)}">
      <div class="campanha-topo" style="background:${c.cor};color:${c.claro ? '#1f2937' : '#fff'}">🎗 ${esc(c.nome)}</div>
      <div class="campanha-corpo"><b>${esc(c.tema)}</b><p>${esc(c.texto)}</p></div>
    </div></div>`;
}
function ligarCampanha(raiz = document) {
  const box = $('.campanha', raiz); if (!box) return;
  const btn = $('.campanha-btn', box);
  btn.onclick = e => { e.stopPropagation(); const ab = box.classList.toggle('aberta'); btn.setAttribute('aria-expanded', ab); };
  $('.campanha-aviso', box).onclick = e => e.stopPropagation();
}
// fecha o aviso ao clicar fora ou apertar Esc (um único ouvinte para a página toda)
const fecharCampanha = () => $$('.campanha.aberta').forEach(b => { b.classList.remove('aberta'); $('.campanha-btn', b).setAttribute('aria-expanded', 'false'); });
document.addEventListener('click', fecharCampanha);
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharCampanha(); });

// --------------------------------------------------------------- fluxo de login
let iniciado = false;
api.aoMudarLogin(async conta => {
  S.conta = conta; S.perfil = null; S.usuarios = null; S.erroPerfil = null; S.filtros.tecnico = null;
  if (conta) S.telaAuth = 'entrar'; // ao sair, volta para a tela de login
  if (conta && conta.verificado && emailDaEmpresa(conta.email)) {
    try {
      S.perfil = await api.meuPerfil();
      if (!S.perfil) S.perfil = await api.criarMeuPerfil(conta.nome || conta.email.split('@')[0]);
    } catch (e) {
      S.erroPerfil = e.message;
    }
  }
  if (!iniciado) { window.addEventListener('hashchange', render); iniciado = true; }
  render();
});

function rota() { return (location.hash.replace(/^#\/?/, '') || 'atendimentos').split('?')[0]; }

async function render() {
  if (!S.conta) return telaAuth();
  if (!emailDaEmpresa(S.conta.email)) return telaBloqueio('Conta sem acesso', `Você entrou como <b>${esc(S.conta.email)}</b>. Só e-mails ${api.DOMINIOS.map(d => '@' + d).join(' ou ')} têm acesso.`);
  if (!S.conta.verificado) return telaVerificar();
  if (!S.perfil) return telaBloqueio('Não foi possível carregar seu acesso', S.erroPerfil || 'Tente sair e entrar de novo.');
  if (!S.perfil.ativo) return telaBloqueio('Aguardando liberação', `Sua conta (${esc(S.conta.email)}) foi criada. Avise o líder da equipe para liberar seu acesso em <b>Usuários</b>. Depois é só recarregar esta página.`, true);
  if (!S.usuarios) { try { S.usuarios = await api.listarUsuarios(); } catch (e) { toast(e.message, true); S.usuarios = [S.perfil]; } }
  const r = rota();
  layout(r);
  const main = $('main');
  if (r === 'painel') return telaPainel(main);
  if (r === 'agenda') return telaAgenda(main);
  if (r === 'usuarios' && isAdmin()) return telaUsuarios(main);
  return telaAtendimentos(main);
}

function authShell(inner) {
  app.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-cab"><div class="brandmark"><i></i>Atendimento Field</div>${seloCampanha()}</div>${inner}</div></div>`;
  ligarCampanha(app);
}

function telaAuth() {
  const t = S.telaAuth;
  const doms = api.DOMINIOS.map(x => '@' + x).join(' ou ');
  if (t === 'criar') {
    authShell(`<h1>Criar conta</h1><p class="sub">Use seu e-mail da empresa (${esc(doms)}). Você vai receber um link no Outlook para confirmar.</p>
      <form id="f" novalidate><div id="e"></div>
        <label class="f"><span>Seu nome (como aparece no painel)</span><input type="text" name="nome" required autofocus></label>
        <label class="f"><span>E-mail da empresa</span><input type="email" name="email" placeholder="${esc(dominioTxt())}" autocomplete="username" required></label>
        <label class="f"><span>Senha</span><input type="password" name="senha" autocomplete="new-password" required><div class="hint">Mínimo de 8 caracteres, com letras e números. Use uma senha só para este sistema.</div></label>
        <label class="f"><span>Repita a senha</span><input type="password" name="senha2" autocomplete="new-password" required></label>
        <button class="btn primary block" type="submit">Criar conta</button>
        <p class="hint" style="margin-top:14px">Já tem conta? <a href="#" data-ir="entrar">Entrar</a></p></form>`);
    $('#f').onsubmit = async ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target)); const e = $('#e');
      if (!d.nome.trim()) return erroBox(e, 'Informe seu nome.');
      if (!emailDaEmpresa(d.email)) return erroBox(e, `Use o e-mail da empresa (${doms}).`);
      const f = senhaFraca(d.senha); if (f) return erroBox(e, f);
      if (d.senha !== d.senha2) return erroBox(e, 'As senhas não conferem.');
      const b = $('button[type=submit]', ev.target); b.disabled = true;
      try { await api.criarConta(d.nome, d.email, d.senha); toast('Conta criada. Confira seu e-mail.'); }
      catch (er) { erroBox(e, er.message); b.disabled = false; }
    };
  } else if (t === 'esqueci') {
    authShell(`<h1>Esqueci minha senha</h1><p class="sub">Enviaremos um link para você criar uma nova senha.</p>
      <form id="f" novalidate><div id="e"></div>
        <label class="f"><span>E-mail da empresa</span><input type="email" name="email" placeholder="${esc(dominioTxt())}" required autofocus></label>
        <button class="btn primary block" type="submit">Enviar link</button>
        <p class="hint" style="margin-top:14px"><a href="#" data-ir="entrar">Voltar para o login</a></p></form>`);
    $('#f').onsubmit = async ev => {
      ev.preventDefault(); const email = new FormData(ev.target).get('email');
      try { await api.esqueciSenha(email); $('#e').innerHTML = `<div class="err ok">Se esse e-mail tiver conta, o link chegou nele. Confira também o lixo eletrônico.</div>`; }
      catch (er) { erroBox($('#e'), er.message); }
    };
  } else {
    authShell(`<h1>Entrar</h1><p class="sub">Use seu e-mail da empresa e a senha do sistema.</p>
      <form id="f" novalidate><div id="e"></div>
        <label class="f"><span>E-mail</span><input type="email" name="email" autocomplete="username" placeholder="${esc(dominioTxt())}" required autofocus></label>
        <label class="f"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
        <button class="btn primary block" type="submit">Entrar</button>
        <p class="hint" style="margin-top:14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <a href="#" data-ir="esqueci">Esqueci minha senha</a><a href="#" data-ir="criar">Primeiro acesso? Criar conta</a></p></form>`);
    $('#f').onsubmit = async ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      const b = $('button[type=submit]', ev.target); b.disabled = true;
      try { await api.entrar(d.email, d.senha); } catch (er) { erroBox($('#e'), er.message); b.disabled = false; }
    };
  }
  $$('[data-ir]').forEach(a => a.onclick = ev => { ev.preventDefault(); S.telaAuth = a.dataset.ir; telaAuth(); });
}

function telaVerificar() {
  authShell(`<h1>Confirme seu e-mail</h1>
    <p class="sub">Enviamos um link para <b>${esc(S.conta.email)}</b>. Abra o e-mail (veja também o lixo eletrônico), clique no link e depois volte aqui.</p>
    <div id="e"></div>
    <button class="btn primary block" id="ja">Já confirmei</button>
    <p class="hint" style="margin-top:14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <a href="#" id="reenv">Reenviar e-mail</a><a href="#" id="sair">Sair</a></p>`);
  $('#ja').onclick = async () => {
    try {
      if (await api.conferirVerificacao()) {
        S.conta.verificado = true;
        S.perfil = await api.meuPerfil() || await api.criarMeuPerfil(S.conta.nome || S.conta.email.split('@')[0]);
        render();
      } else erroBox($('#e'), 'Ainda não aparece como confirmado. Clique no link do e-mail e tente de novo.');
    } catch (er) { erroBox($('#e'), er.message); }
  };
  $('#reenv').onclick = async ev => { ev.preventDefault(); try { await api.reenviarVerificacao(); toast('E-mail reenviado.'); } catch (er) { toast(er.message, true); } };
  $('#sair').onclick = ev => { ev.preventDefault(); api.sair(); };
}

function telaBloqueio(titulo, msg, recarregar) {
  authShell(`<h1>${titulo}</h1><p class="sub">${msg}</p>
    ${recarregar ? '<button class="btn primary block" id="rec">Recarregar</button>' : ''}
    <p class="hint" style="margin-top:14px"><a href="#" id="sair">Sair</a></p>`);
  if (recarregar) $('#rec').onclick = () => location.reload();
  $('#sair').onclick = ev => { ev.preventDefault(); api.sair(); };
}

// --------------------------------------------------------------- layout
function layout(r) {
  const tabs = [['atendimentos', isAdmin() ? 'Atendimentos' : 'Meus atendimentos'], ['agenda', 'Agenda'], ['painel', 'Painel']];
  if (isAdmin()) {
    const pend = S.usuarios.filter(u => !u.ativo && !u.bloqueado).length;
    tabs.push(['usuarios', `Usuários${pend ? ` <span class="badge">${pend}</span>` : ''}`]);
  }
  const atual = tabs.some(x => x[0] === r) ? r : 'atendimentos';
  app.innerHTML = `
  <header class="top ${campanhaAtual().claro ? 'claro' : ''}" style="--top:${campanhaAtual().cor}"><div class="top-in">
    <div class="brandmark"><i></i><span>Atendimento Field</span></div>
    ${seloCampanha()}
    <nav class="tabs">${tabs.map(([k, t]) => `<a href="#/${k}" class="${atual === k ? 'on' : ''}">${t}</a>`).join('')}</nav>
    <div class="me">
      <button id="meBtn" aria-haspopup="true"><span class="avatar">${esc(iniciais(S.perfil.nome))}</span><span class="nm">${esc(S.perfil.nome.split(' ')[0])}</span></button>
      <div class="menu" id="meMenu">
        <div class="who"><b>${esc(S.perfil.nome)}</b><small>${esc(S.perfil.email)}</small><small>${isAdmin() ? 'Líder / administrador' : 'Técnico'}</small></div>
        <button id="mSenha">Trocar senha</button>
        <button id="mSair">Sair</button>
      </div>
    </div>
  </div></header>
  <main></main>`;
  $('#meBtn').onclick = e => { e.stopPropagation(); $('#meMenu').classList.toggle('open'); };
  document.onclick = () => $('#meMenu') && $('#meMenu').classList.remove('open');
  ligarCampanha($('header.top'));
  $('#mSair').onclick = () => api.sair();
  $('#mSenha').onclick = trocarSenha;
}

function trocarSenha() {
  modal('Trocar senha', `<form novalidate><div id="e"></div>
      <label class="f"><span>Senha atual</span><input type="password" name="atual" autocomplete="current-password"></label>
      <label class="f"><span>Nova senha</span><input type="password" name="nova" autocomplete="new-password"><div class="hint">Mínimo de 8 caracteres, com letras e números.</div></label>
      <label class="f"><span>Repita a nova senha</span><input type="password" name="nova2" autocomplete="new-password"></label></form>`,
  [{ t: 'Cancelar' }, { t: 'Salvar', primary: true, fn: async ov => {
    const d = Object.fromEntries(new FormData($('form', ov))); const e = $('#e', ov);
    const f = senhaFraca(d.nova); if (f) { erroBox(e, f); return false; }
    if (d.nova !== d.nova2) { erroBox(e, 'As senhas não conferem.'); return false; }
    try { await api.trocarSenha(d.atual, d.nova); toast('Senha alterada.'); return true; } catch (er) { erroBox(e, er.message); return false; }
  } }], 'sm');
}

// --------------------------------------------------------------- modal genérico
function modal(titulo, body, botoes, size = '', aoAbrir) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><header><h3>${titulo}</h3><button class="x" aria-label="Fechar">×</button></header>
    <div class="body">${body}</div><footer>${botoes.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger left' : ''}" data-i="${i}">${b.t}</button>`).join('')}</footer></div>`;
  document.body.appendChild(ov);
  const fechar = () => { ov.remove(); document.removeEventListener('keydown', escK); };
  const escK = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', escK);
  $('.x', ov).onclick = fechar;
  ov.addEventListener('mousedown', e => { if (e.target === ov) fechar(); });
  $$('footer button', ov).forEach(btn => btn.onclick = async () => {
    const b = botoes[btn.dataset.i];
    if (!b.fn) return fechar();
    btn.disabled = true;
    const ok = await b.fn(ov);
    btn.disabled = false;
    if (ok !== false) fechar();
  });
  const form = $('form', ov);
  if (form) form.addEventListener('submit', e => { e.preventDefault(); const p = botoes.findIndex(b => b.primary); if (p >= 0) $(`footer button[data-i="${p}"]`, ov).click(); });
  if (aoAbrir) aoAbrir(ov, fechar);
  const first = $('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])', ov); if (first) first.focus();
  return { ov, fechar };
}

// --------------------------------------------------------------- Atendimentos
async function telaAtendimentos(main) {
  const admin = isAdmin();
  if (S.filtros.tecnico === null) S.filtros.tecnico = admin ? '' : S.perfil.id;
  const equipe = S.usuarios.filter(u => u.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  main.innerHTML = `
    <div class="head"><div><h2>${admin ? 'Atendimentos da equipe' : 'Atendimentos'}</h2><p>${esc(nomeMes(S.mes))}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="exp">Exportar Excel</button>
        <button class="btn primary" id="novo">+ Novo atendimento</button>
      </div></div>
    <div class="kpis" id="kpis"></div>
    <div class="toolbar">
      <input type="month" id="fMes" value="${S.mes}" aria-label="Mês">
      <input type="search" id="fQ" placeholder="Buscar SMAX, comarca, ticket, usuário…" value="${esc(S.filtros.q)}">
      <select id="fSt" aria-label="Status"><option value="">Todos os status</option>${STATUS.map(x => `<option ${S.filtros.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select id="fTec" aria-label="Técnico"><option value="">${admin ? 'Todos os técnicos' : 'Toda a equipe'}</option>${equipe.map(t => `<option value="${t.id}" ${S.filtros.tecnico === t.id ? 'selected' : ''}>${t.id === S.perfil.id ? 'Só os meus' : esc(t.nome)}</option>`).join('')}</select>
    </div>
    <div class="card"><div class="tablewrap" id="tab"><div class="empty">Carregando…</div></div></div>`;
  $('#novo').onclick = () => formAtendimento(null);
  $('#exp').onclick = exportarExcel;
  $('#fMes').onchange = e => { if (e.target.value) { S.mes = e.target.value; render(); } };
  let deb; $('#fQ').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { S.filtros.q = e.target.value; mostrar(); }, 200); };
  $('#fSt').onchange = e => { S.filtros.status = e.target.value; mostrar(); };
  $('#fTec').onchange = e => { S.filtros.tecnico = e.target.value; carregar(); };

  let base = [];
  async function carregar() {
    try { base = ordenar(await api.listarAtendimentos({ mes: S.mes, uid: S.filtros.tecnico || null })); }
    catch (e) { toast(e.message, true); base = []; }
    S.comarcas = [...new Set([...(S.comarcas || []), ...base.map(a => a.comarca).filter(Boolean)])];
    mostrar();
  }
  function mostrar() {
    const q = S.filtros.q.trim().toLowerCase();
    let lista = base;
    if (S.filtros.status) lista = lista.filter(a => a.status === S.filtros.status);
    if (q) lista = lista.filter(a => [a.smax, a.comarca, a.ticket_softplan, a.usuario_atendido, a.obs].some(v => (v || '').toLowerCase().includes(q)));
    const c = k => lista.filter(a => a.status === k).length;
    $('#kpis').innerHTML = `
      <div class="kpi enc"><span>Encaminhado</span><b>${c('ENCAMINHADO')}</b></div>
      <div class="kpi tent"><span>Tent. contato</span><b>${c('TENT CONTATO')}</b></div>
      <div class="kpi ag"><span>Agendado</span><b>${c('AGENDADO')}</b></div>
      <div class="kpi fech"><span>Fechado</span><b>${c('FECHADO')}</b></div>
      <div class="kpi"><span>Home / Local</span><b>${lista.filter(a => a.home_local === 'HOME').length} / ${lista.filter(a => a.home_local === 'LOCAL').length}</b></div>
      <div class="kpi tot"><span>Total</span><b>${lista.length}</b></div>`;
    if (!lista.length) {
      $('#tab').innerHTML = `<div class="empty">Nenhum atendimento em ${esc(nomeMes(S.mes))}${q || S.filtros.status ? ' com esses filtros' : ''}.<br><br><button class="btn primary" id="novo2">+ Registrar atendimento</button></div>`;
      $('#novo2').onclick = () => formAtendimento(null); return;
    }
    const mostraTec = S.filtros.tecnico !== S.perfil.id;
    $('#tab').innerHTML = `<table><thead><tr>
      <th>Solicitação SMAX</th><th>Comarca</th><th>Início</th><th>Término</th><th class="num">Tempo</th><th>Ticket Softplan</th><th>Status</th><th>Encaminhado p/</th><th>Home/Local</th>${mostraTec ? '<th>Técnico</th>' : ''}</tr></thead>
      <tbody>${lista.map(a => `<tr class="click" data-id="${esc(a.id)}">
        <td class="mono"><b>${esc(a.smax) || '<span class="muted">—</span>'}</b></td>
        <td>${esc(a.comarca)}</td><td>${fmtDH(a.inicio)}</td><td>${fmtDH(a.termino)}</td>
        <td class="num">${duracao(a.inicio, a.termino)}</td><td class="mono">${esc(a.ticket_softplan)}</td>
        <td>${chip(a.status)}</td><td>${a.encaminhado_para ? `<span class="tag">${esc(a.encaminhado_para)}</span>` : ''}</td>
        <td>${esc(a.home_local)}</td>${mostraTec ? `<td>${esc(nomeDe(a.uid, a.tecnico))}</td>` : ''}
      </tr>`).join('')}</tbody></table>`;
    $$('#tab tr[data-id]').forEach(tr => tr.onclick = () => formAtendimento(lista.find(a => a.id === tr.dataset.id)));
  }
  S.recarregar = carregar;
  carregar();
}
function nomeDe(uid, reserva) { const u = (S.usuarios || []).find(x => x.id === uid); return u ? u.nome : (reserva || '—'); }

function formAtendimento(a) {
  const novo = !a; a = a || { inicio: agoraLocal(), status: '', home_local: '', uid: S.perfil.id };
  const admin = isAdmin();
  const podeEditar = novo || admin || a.uid === S.perfil.id;
  const dis = podeEditar ? '' : 'disabled';
  const equipe = S.usuarios.filter(u => u.ativo || u.id === a.uid).sort((x, y) => x.nome.localeCompare(y.nome));
  const comarcas = [...new Set((S.comarcas || []))];
  const body = `<form id="fa" novalidate>
    <div id="e"></div>
    ${!podeEditar ? `<div class="err" style="background:var(--brand-soft);color:var(--brand)">Atendimento de ${esc(nomeDe(a.uid, a.tecnico))}. Só ele ou o líder podem alterar.</div>` : ''}
    ${admin ? `<label class="f"><span>Técnico</span><select name="uid">${equipe.map(t => `<option value="${t.id}" ${a.uid === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>` : ''}
    <div class="row">
      <label class="f"><span>Solicitação SMAX <em>*</em></span><input type="text" name="smax" value="${esc(a.smax)}" placeholder="ex.: 1234567" inputmode="numeric" ${dis}></label>
      <label class="f"><span>Comarca <em>*</em></span><input type="text" name="comarca" value="${esc(a.comarca)}" list="dlComarcas" autocomplete="off" ${dis}></label>
    </div>
    <datalist id="dlComarcas">${comarcas.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row">
      <label class="f"><span>Início do atendimento</span><div class="with-btn"><input type="datetime-local" name="inicio" value="${esc(a.inicio)}" ${dis}><button type="button" class="btn sm" data-agora="inicio" ${dis}>Agora</button></div></label>
      <label class="f"><span>Término do atendimento</span><div class="with-btn"><input type="datetime-local" name="termino" value="${esc(a.termino)}" ${dis}><button type="button" class="btn sm" data-agora="termino" ${dis}>Agora</button></div><div class="hint" id="dur"></div></label>
    </div>
    <div class="row">
      <label class="f"><span>Ticket Softplan</span><input type="text" name="ticket_softplan" value="${esc(a.ticket_softplan)}" ${dis}></label>
      <label class="f"><span>Encaminhado para</span><select name="encaminhado_para" ${dis}><option value="">—</option>${ENCAMINHADO_PARA.map(x => `<option ${a.encaminhado_para === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <label class="f"><span>Status</span><div class="seg" data-name="status">${STATUS.map(x => `<button type="button" data-v="${x}" class="${a.status === x ? 'on' : ''}" ${dis}>${x}</button>`).join('')}</div></label>
    <label class="f"><span>Home / Local</span><div class="seg" data-name="home_local">${HOME_LOCAL.map(x => `<button type="button" data-v="${x}" class="${a.home_local === x ? 'on' : ''}" ${dis}>${x === 'HOME' ? 'HOME (remoto)' : 'LOCAL'}</button>`).join('')}</div></label>
    <fieldset class="ag" id="agBox" ${a.status === 'AGENDADO' ? '' : 'hidden'}><legend>Agendamento</legend>
      <div class="row">
        <label class="f"><span>Horário agendado</span><input type="datetime-local" name="agendamento" value="${esc(a.agendamento)}" ${dis}></label>
        <label class="f"><span>Usuário (quem será atendido)</span><input type="text" name="usuario_atendido" value="${esc(a.usuario_atendido)}" ${dis}></label>
      </div>
    </fieldset>
    <label class="f"><span>Observações</span><textarea name="obs" rows="3" ${dis}>${esc(a.obs)}</textarea></label>
    ${!novo ? `<p class="hint">Registrado por ${esc(nomeDe(a.uid, a.tecnico))}</p>` : ''}
  </form>`;
  const salvar = async ov => {
    const f = $('#fa', ov); const d = Object.fromEntries(new FormData(f));
    $$('.seg', f).forEach(sg => { const on = $('button.on', sg); d[sg.dataset.name] = on ? on.dataset.v : ''; });
    if (d.status !== 'AGENDADO') { d.agendamento = d.agendamento || ''; }
    const uid = admin && d.uid ? d.uid : (a.uid || S.perfil.id);
    const at = montarAtendimento(d, uid, nomeDe(uid, S.perfil.nome));
    const er = validar(at); if (er) { erroBox($('#e', ov), er); ov.scrollTop = 0; return false; }
    try {
      await api.salvarAtendimento(novo ? null : a.id, at);
      toast(novo ? 'Atendimento registrado.' : 'Atendimento atualizado.');
      if (at.mes !== S.mes && novo) toast(`Registrado em ${nomeMes(at.mes)} (data do início).`);
      S.comarcas = [at.comarca, ...(S.comarcas || [])];
      refresh(); return true;
    } catch (e) { erroBox($('#e', ov), e.message); ov.scrollTop = 0; return false; }
  };
  const botoes = [];
  if (!novo && podeEditar) botoes.push({ t: 'Excluir', danger: true, fn: async () => {
    if (!confirm('Excluir este atendimento? Essa ação não pode ser desfeita.')) return false;
    try { await api.excluirAtendimento(a.id); toast('Atendimento excluído.'); refresh(); return true; } catch (e) { toast(e.message, true); return false; }
  } });
  if (podeEditar) botoes.push({ t: 'Cancelar' }, { t: novo ? 'Registrar' : 'Salvar', primary: true, fn: salvar });
  else botoes.push({ t: 'Fechar', primary: true });
  modal(novo ? 'Novo atendimento' : `Atendimento ${esc(a.smax || '')}`, body, botoes, '', ov => {
    const f = $('#fa', ov);
    const atualizaDur = () => { const d = duracao(f.inicio.value, f.termino.value); $('#dur', ov).textContent = d ? `Tempo de atendimento: ${d}` : ''; };
    $$('[data-agora]', f).forEach(b => b.onclick = () => { f[b.dataset.agora].value = agoraLocal(); atualizaDur(); });
    f.inicio.oninput = f.termino.oninput = atualizaDur; atualizaDur();
    $$('.seg', f).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => {
      const was = b.classList.contains('on');
      $$('button', sg).forEach(x => x.classList.remove('on'));
      if (!was) b.classList.add('on');
      if (sg.dataset.name === 'status') {
        const v = $('button.on', sg)?.dataset.v;
        $('#agBox', ov).hidden = v !== 'AGENDADO';
        if (v === 'AGENDADO') f.agendamento.focus();
        if (v === 'FECHADO' && !f.termino.value) { f.termino.value = agoraLocal(); atualizaDur(); }
      }
    }));
  });
}
function refresh() { if (S.recarregar && rota() === 'atendimentos') S.recarregar(); else render(); }

// --------------------------------------------------------------- Agenda
async function telaAgenda(main) {
  S.recarregar = null;
  main.innerHTML = `<div class="head"><div><h2>Agenda</h2><p>Atendimentos com status AGENDADO, em ordem de horário.</p></div>
    <button class="btn primary" id="novo">+ Novo atendimento</button></div><div id="lista"><div class="empty">Carregando…</div></div>`;
  $('#novo').onclick = () => formAtendimento(null);
  let lista; try { lista = await api.listarAgendados({ uid: isAdmin() ? null : S.perfil.id }); } catch (e) { return toast(e.message, true); }
  lista.sort((a, b) => (a.agendamento || '9999').localeCompare(b.agendamento || '9999'));
  if (!lista.length) { $('#lista').innerHTML = `<div class="card"><div class="empty">Nenhum atendimento agendado no momento.</div></div>`; return; }
  const agora = agoraLocal();
  $('#lista').innerHTML = `<div class="agenda">${lista.map(a => {
    const late = a.agendamento && a.agendamento < agora;
    const [d, t] = (a.agendamento || '').split('T');
    return `<div class="ag-item ${late ? 'late' : ''}" data-id="${esc(a.id)}">
      <div class="when"><b>${t || '--:--'}</b><small>${d ? fmtData(d) : 'sem horário'}${late ? ' · atrasado' : ''}</small></div>
      <div class="what"><b>SMAX ${esc(a.smax)} · ${esc(a.comarca)}</b><small>${esc(a.usuario_atendido || 'usuário não informado')}${a.obs ? ' — ' + esc(a.obs) : ''}</small></div>
      <div class="muted">${isAdmin() ? esc(nomeDe(a.uid, a.tecnico)) : ''}</div></div>`;
  }).join('')}</div>`;
  $$('.ag-item').forEach(el => el.onclick = () => formAtendimento(lista.find(a => a.id === el.dataset.id)));
}

// --------------------------------------------------------------- Painel
function diasUteis(mes) {
  const [y, m] = mes.split('-').map(Number);
  const h = new Date(); let ate = new Date(y, m, 0).getDate();
  if (h.getFullYear() === y && h.getMonth() + 1 === m) ate = h.getDate();
  else if (new Date(y, m - 1, 1) > h) return 0;
  let n = 0; for (let d = 1; d <= ate; d++) { const w = new Date(y, m - 1, d).getDay(); if (w && w < 6) n++; }
  return n;
}
// minutos de um atendimento (só quando tem início e término)
function minutosDe(a) {
  if (!a.inicio || !a.termino) return null;
  const m = Math.round((new Date(a.termino) - new Date(a.inicio)) / 60000);
  return isNaN(m) || m < 0 ? null : m;
}
// soma as horas e calcula o tempo médio por atendimento
function tempos(r, lista) {
  const ms = lista.map(minutosDe).filter(m => m !== null);
  r.min_total = ms.reduce((t, m) => t + m, 0);
  r.com_tempo = ms.length;
  r.min_medio = ms.length ? Math.round(r.min_total / ms.length) : null;
}
const fmtMin = m => m === null || m === undefined ? '—' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

function montarPainel(mes, lista) {
  const ids = new Set(S.usuarios.filter(u => u.ativo).map(u => u.id));
  lista.forEach(a => ids.add(a.uid));
  const linhas = [...ids].map(uid => {
    const m = lista.filter(a => a.uid === uid); const c = k => m.filter(a => a.status === k).length;
    const r = { uid, nome: nomeDe(uid, (m[0] || {}).tecnico), encaminhado: c('ENCAMINHADO'), tent_contato: c('TENT CONTATO'), agendado: c('AGENDADO'), fechado: c('FECHADO'),
      home: m.filter(a => a.home_local === 'HOME').length, local: m.filter(a => a.home_local === 'LOCAL').length };
    r.total = r.encaminhado + r.tent_contato + r.agendado + r.fechado;
    tempos(r, m); return r;
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  const total = { nome: 'TOTAL' };
  for (const k of ['encaminhado', 'tent_contato', 'agendado', 'fechado', 'home', 'local', 'total']) total[k] = linhas.reduce((t, r) => t + r[k], 0);
  tempos(total, lista);
  const destinos = ENCAMINHADO_PARA.map(d => ({ destino: d, n: lista.filter(a => a.encaminhado_para === d).length }));
  const cont = {}; lista.forEach(a => { if (a.comarca) cont[a.comarca] = (cont[a.comarca] || 0) + 1; });
  const porComarca = Object.entries(cont).map(([comarca, n]) => ({ comarca, n })).sort((a, b) => b.n - a.n).slice(0, 10);
  const du = diasUteis(mes);
  return { mes, linhas, total, destinos, porComarca, diasUteis: du, mediaDiaria: du ? +(total.total / du).toFixed(1) : 0 };
}
async function telaPainel(main) {
  S.recarregar = null;
  main.innerHTML = `<div class="head"><div><h2>Painel — Atendimento Técnico Field</h2><p>${esc(nomeMes(S.mes))}</p></div>
    <div class="toolbar" style="margin:0"><input type="month" id="fMes" value="${S.mes}"><button class="btn" id="exp">Exportar Excel</button></div></div>
    <div id="pn"><div class="empty">Carregando…</div></div>`;
  $('#fMes').onchange = e => { if (e.target.value) { S.mes = e.target.value; render(); } };
  $('#exp').onclick = exportarExcel;
  let lista; try { lista = await api.listarAtendimentos({ mes: S.mes }); } catch (e) { return toast(e.message, true); }
  S.comarcas = [...new Set([...lista.map(a => a.comarca), ...(S.comarcas || [])])];
  const geral = montarPainel(S.mes, lista);           // tabela "Por técnico" sempre com a equipe toda
  if (S.painelTec && !geral.linhas.some(r => r.uid === S.painelTec)) S.painelTec = '';

  const desenhar = () => {
    const uid = S.painelTec || '';
    const sel = geral.linhas.find(r => r.uid === uid);
    const doSel = uid ? lista.filter(a => a.uid === uid) : lista;
    const p = uid ? montarPainel(S.mes, doSel) : geral;  // cartões, gráficos e calendário seguem o filtro
    const T = uid ? sel : geral.total;
    const media = p.diasUteis ? +(T.total / p.diasUteis).toFixed(1) : 0;
    const linha = (r, tot) => `<tr class="${tot ? 'total' : ''} click ${!tot && r.uid === uid ? 'sel' : ''} ${uid && !tot && r.uid !== uid ? 'apagado' : ''}" data-uid="${tot ? '' : esc(r.uid)}" title="${tot ? 'Ver todos os técnicos' : 'Ver só ' + esc(r.nome)}">
      <td>${esc(r.nome)}</td><td class="num">${r.encaminhado}</td><td class="num">${r.tent_contato}</td><td class="num">${r.agendado}</td><td class="num">${r.fechado}</td><td class="num">${r.home}</td><td class="num">${r.local}</td><td class="num"><b>${r.total}</b></td><td class="num">${r.com_tempo ? fmtMin(r.min_total) : '—'}</td><td class="num tempo" title="${r.com_tempo} atendimento(s) com início e término">${fmtMin(r.min_medio)}</td></tr>`;
    const maxD = Math.max(1, ...p.destinos.map(d => d.n)), maxC = Math.max(1, ...p.porComarca.map(d => d.n));
    $('#pn').innerHTML = `
      <div class="filtro-tec">
        <label>Técnico:
          <select id="pTec"><option value="">Todos os técnicos</option>${geral.linhas.map(r => `<option value="${esc(r.uid)}" ${r.uid === uid ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
        ${uid ? `<span class="filtro-info">Mostrando apenas <b>${esc(sel.nome)}</b> · <a href="#" id="verTodos">ver todos</a></span>` : '<span class="filtro-info">Clique em um técnico na tabela para ver só as informações dele.</span>'}
      </div>
      <div class="kpis">
        <div class="kpi enc"><span>Encaminhado</span><b>${T.encaminhado}</b></div>
        <div class="kpi tent"><span>Tent. contato</span><b>${T.tent_contato}</b></div>
        <div class="kpi ag"><span>Agendado</span><b>${T.agendado}</b></div>
        <div class="kpi fech"><span>Fechado</span><b>${T.fechado}</b></div>
        <div class="kpi tot"><span>Total geral</span><b>${T.total}</b></div>
        <div class="kpi"><span>Média diária</span><b>${String(media).replace('.', ',')}</b></div>
        <div class="kpi"><span>Tempo médio</span><b>${fmtMin(T.min_medio)}</b></div>
      </div>
      <div class="grid2">
        <div class="card"><h3>Por técnico</h3><div class="tablewrap"><table>
          <thead><tr><th>Técnico</th><th class="num">Encaminhado</th><th class="num">Tent. contato</th><th class="num">Agendado</th><th class="num">Fechado</th><th class="num">Remoto/Home</th><th class="num">Local</th><th class="num">Total geral</th><th class="num">Horas totais</th><th class="num">Tempo médio</th></tr></thead>
          <tbody>${geral.linhas.map(r => linha(r)).join('')}${linha(geral.total, true)}</tbody></table></div>
          <div class="pad hint">Média diária = total geral ÷ ${p.diasUteis} dias úteis ${p.mes === mesAtual() ? 'até hoje' : 'do mês'}.
            Tempo médio = horas de atendimento ÷ atendimentos com início e término preenchidos.</div></div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card"><h3>Atendimento SAJ — encaminhados para${uid ? ` <span class="muted">· ${esc(sel.nome)}</span>` : ''}</h3><div class="pad bars">${p.destinos.map(d => `<div class="bar"><span>${esc(d.destino)}</span><div class="t"><i style="width:${d.n / maxD * 100}%"></i></div><b>${d.n}</b></div>`).join('')}</div></div>
          <div class="card"><h3>Comarcas com mais atendimentos${uid ? ` <span class="muted">· ${esc(sel.nome)}</span>` : ''}</h3><div class="pad bars">${p.porComarca.length ? p.porComarca.map(d => `<div class="bar"><span title="${esc(d.comarca)}">${esc(d.comarca)}</span><div class="t"><i style="width:${d.n / maxC * 100}%"></i></div><b>${d.n}</b></div>`).join('') : '<div class="muted">Sem dados no mês.</div>'}</div></div>
        </div>
      </div>
      <div class="card cal-card">
        <div class="cal-head"><h3>Calendário de ${esc(nomeMes(S.mes))}${uid ? ` <span class="muted">· ${esc(sel.nome)}</span>` : ' <span class="muted">· todos os técnicos</span>'}</h3>
          <select id="calTec" aria-label="Técnico"><option value="">Todos os técnicos</option>${geral.linhas.map(r => `<option value="${esc(r.uid)}" ${r.uid === uid ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
        <div class="pad" id="cal"></div>
      </div>`;
    calendario($('#cal'), doSel, '');
    const escolher = v => { S.painelTec = v; desenhar(); };
    $('#pTec').onchange = e => escolher(e.target.value);
    $('#calTec').onchange = e => escolher(e.target.value);
    if ($('#verTodos')) $('#verTodos').onclick = e => { e.preventDefault(); escolher(''); };
    $$('#pn tbody tr[data-uid]').forEach(tr => tr.onclick = () => escolher(tr.dataset.uid === uid ? '' : tr.dataset.uid));
  };
  desenhar();
}

// calendário do mês: quantidade de atendimentos por dia; clique no dia mostra a lista
function calendario(el, lista, uid) {
  const [y, m] = S.mes.split('-').map(Number);
  const dias = new Date(y, m, 0).getDate(), inicioSem = new Date(y, m - 1, 1).getDay();
  const doMes = uid ? lista.filter(a => a.uid === uid) : lista;
  const porDia = {}; doMes.forEach(a => { const d = Number((a.data_ref || '').slice(8, 10)); if (d) (porDia[d] = porDia[d] || []).push(a); });
  const max = Math.max(1, ...Object.values(porDia).map(l => l.length));
  const hoje = hojeISO();
  let html = '<div class="cal">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="cal-sem">${d}</div>`).join('');
  for (let i = 0; i < inicioSem; i++) html += '<div class="cal-dia vazio"></div>';
  for (let d = 1; d <= dias; d++) {
    const l = porDia[d] || [], n = l.length, w = new Date(y, m - 1, d).getDay();
    const iso = `${S.mes}-${String(d).padStart(2, '0')}`;
    const fech = l.filter(a => a.status === 'FECHADO').length, min = l.map(minutosDe).filter(x => x !== null).reduce((t, x) => t + x, 0);
    const alpha = n ? 0.12 + 0.55 * (n / max) : 0;
    html += `<button type="button" class="cal-dia ${w === 0 || w === 6 ? 'fds' : ''} ${iso === hoje ? 'hoje' : ''} ${n ? 'tem' : ''}" data-dia="${d}"
      style="${n ? `background:rgba(44,82,130,${alpha.toFixed(2)});${alpha > .45 ? 'color:#fff' : ''}` : ''}" ${n ? '' : 'disabled'}
      title="${n ? `${n} atendimento(s) · ${fech} fechado(s)${min ? ' · ' + fmtMin(min) : ''}` : 'Sem atendimentos'}">
      <span class="cal-n">${d}</span>${n ? `<b>${n}</b><small>${n === 1 ? 'atendimento' : 'atendimentos'}</small>` : ''}</button>`;
  }
  html += '</div><div class="hint" style="margin-top:10px">Clique em um dia para ver os atendimentos. Quanto mais escuro, mais atendimentos no dia.</div>';
  el.innerHTML = html;
  $$('.cal-dia.tem', el).forEach(b => b.onclick = () => diaDetalhe(Number(b.dataset.dia), porDia[b.dataset.dia]));
}
function diaDetalhe(d, l) {
  l = [...l].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  const data = `${String(d).padStart(2, '0')}/${S.mes.slice(5, 7)}/${S.mes.slice(0, 4)}`;
  const min = l.map(minutosDe).filter(x => x !== null);
  const { fechar } = modal(`Atendimentos de ${data}`, `
    <p class="hint" style="margin-top:0">${l.length} atendimento(s)${min.length ? ` · ${fmtMin(min.reduce((t, x) => t + x, 0))} de atendimento · média ${fmtMin(Math.round(min.reduce((t, x) => t + x, 0) / min.length))}` : ''}</p>
    <div class="tablewrap"><table><thead><tr><th>Início</th><th>SMAX</th><th>Comarca</th><th>Técnico</th><th class="num">Tempo</th><th>Status</th></tr></thead><tbody>
    ${l.map(a => `<tr class="click" data-id="${esc(a.id)}"><td>${esc((a.inicio || '').slice(11, 16))}</td><td class="mono"><b>${esc(a.smax)}</b></td><td>${esc(a.comarca)}</td><td>${esc(nomeDe(a.uid, a.tecnico))}</td><td class="num">${duracao(a.inicio, a.termino)}</td><td>${chip(a.status)}</td></tr>`).join('')}
    </tbody></table></div>`, [{ t: 'Fechar', primary: true }], '', ov => {
    $$('tr[data-id]', ov).forEach(tr => tr.onclick = () => { fechar(); formAtendimento(l.find(a => a.id === tr.dataset.id)); });
  });
}

// --------------------------------------------------------------- Exportar Excel (mesmo layout da planilha)
async function exportarExcel() {
  if (!window.ExcelJS) return toast('Aguarde o carregamento e tente de novo.', true);
  toast('Gerando planilha…');
  let lista; try { lista = await api.listarAtendimentos({ mes: S.mes }); } catch (e) { return toast(e.message, true); }
  const p = montarPainel(S.mes, lista);
  const wb = new ExcelJS.Workbook();
  const azul = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  const cinza = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF2' } };
  const ln = { style: 'thin', color: { argb: 'FFB8C2CC' } }; const borda = { top: ln, left: ln, bottom: ln, right: ln };
  const cab = c => { c.fill = azul; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = borda; };
  const toDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : null; };

  const ws = wb.addWorksheet('PAINEL');
  ws.getCell('A1').value = 'DASHBOARD =>  ATENDIMENTO TÉCNICO FIELD'; ws.getCell('A1').font = { bold: true, size: 14 };
  const [yy, mm] = S.mes.split('-').map(Number);
  ws.getCell('B2').value = new Date(Date.UTC(yy, mm - 1, 1)); ws.getCell('B2').numFmt = 'mmm/yyyy';
  ws.getCell('E2').value = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
  ['TÉCNICO', 'ENCAMINHADO', 'TENT CONTATO', 'AGENDADO', 'FECHADO', 'REMOTO/HOME', 'LOCAL', 'TOTAL GERAL', 'HORAS TOTAIS', 'TEMPO MÉDIO'].forEach((h, i) => { const c = ws.getCell(3, 2 + i); c.value = h; cab(c); });
  [...p.linhas, p.total].forEach((r, i) => {
    [r.nome, r.encaminhado, r.tent_contato, r.agendado, r.fechado, r.home, r.local, r.total,
      r.com_tempo ? r.min_total / 1440 : '', r.min_medio !== null ? r.min_medio / 1440 : ''].forEach((v, j) => {
      const c = ws.getCell(4 + i, 2 + j); c.value = v; c.border = borda; if (j) c.alignment = { horizontal: 'center' };
      if (j >= 8 && v !== '') c.numFmt = '[h]:mm';
      if (r === p.total) { c.font = { bold: true }; c.fill = cinza; }
    });
  });
  ws.getCell('M3').value = 'MÉDIA DIÁRIA'; cab(ws.getCell('M3')); ws.getCell('N3').value = p.mediaDiaria; ws.getCell('N3').border = borda;
  ws.getCell('M4').value = `(${p.diasUteis} dias úteis)`; ws.getCell('M4').font = { italic: true, size: 9 };
  ws.getCell('P3').value = 'ATENDIMENTO SAJ'; cab(ws.getCell('P3')); ws.getCell('Q3').value = 'QTD'; cab(ws.getCell('Q3'));
  p.destinos.forEach((d, i) => { ws.getCell(4 + i, 16).value = d.destino; ws.getCell(4 + i, 17).value = d.n; ws.getCell(4 + i, 16).border = borda; ws.getCell(4 + i, 17).border = borda; });
  ws.getColumn(2).width = 18; for (let c = 3; c <= 11; c++) ws.getColumn(c).width = 14; ws.getColumn(13).width = 14; ws.getColumn(16).width = 18;

  const usados = new Set();
  for (const lin of p.linhas) {
    let nomeAba = lin.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (usados.has(nomeAba.toLowerCase())) nomeAba = nomeAba.slice(0, 27) + ' ' + usados.size;
    usados.add(nomeAba.toLowerCase());
    const w = wb.addWorksheet(nomeAba);
    ['Solicitação SMAX', 'Comarca', 'Inicio Atendimento', 'Termino Atendimento', 'Tempo Atendimento', 'Ticket Softplan', 'STATUS', 'Encaminhado para', 'HOME/LOCAL', 'Usuário', 'Obs']
      .forEach((h, i) => { const c = w.getCell(1, 1 + i); c.value = h; cab(c); });
    w.getRow(1).height = 30;
    const meus = lista.filter(a => a.uid === lin.uid).sort((a, b) => (a.inicio || a.data_ref).localeCompare(b.inicio || b.data_ref));
    meus.forEach((a, i) => {
      const r = 2 + i, ini = toDate(a.inicio), fim = toDate(a.termino);
      w.getCell(r, 1).value = a.smax; w.getCell(r, 2).value = a.comarca;
      if (ini) { w.getCell(r, 3).value = ini; w.getCell(r, 3).numFmt = 'dd/mm/yyyy hh:mm'; }
      if (fim) { w.getCell(r, 4).value = fim; w.getCell(r, 4).numFmt = 'dd/mm/yyyy hh:mm'; }
      if (ini && fim) { w.getCell(r, 5).value = { formula: `D${r}-C${r}` }; w.getCell(r, 5).numFmt = '[h]:mm'; }
      w.getCell(r, 6).value = a.ticket_softplan; w.getCell(r, 7).value = a.status; w.getCell(r, 8).value = a.encaminhado_para;
      w.getCell(r, 9).value = a.home_local; w.getCell(r, 10).value = a.usuario_atendido; w.getCell(r, 11).value = a.obs;
      for (let c = 1; c <= 11; c++) w.getCell(r, c).border = borda;
    });
    w.getCell('P2').value = 'TOTAIS'; cab(w.getCell('P2')); cab(w.getCell('Q2'));
    [['ENCAMINHADO', lin.encaminhado], ['TENT CONTATO', lin.tent_contato], ['AGENDADO', lin.agendado], ['FECHADO', lin.fechado], ['HOME', lin.home], ['LOCAL', lin.local], ['TOTAL', lin.total]]
      .forEach(([k, v], i) => { const a = w.getCell(3 + i, 16), b = w.getCell(3 + i, 17); a.value = k; b.value = v; a.border = b.border = borda; if (k === 'TOTAL') a.font = b.font = { bold: true }; });
    w.getCell('S1').value = 'Agendamento'; w.getCell('S1').font = { bold: true };
    ['Horário', 'SMAX', 'Usuário', 'Obs'].forEach((h, i) => { const c = w.getCell(2, 19 + i); c.value = h; cab(c); });
    meus.filter(a => a.status === 'AGENDADO').forEach((a, i) => {
      const d = toDate(a.agendamento); if (d) { w.getCell(3 + i, 19).value = d; w.getCell(3 + i, 19).numFmt = 'dd/mm hh:mm'; }
      w.getCell(3 + i, 20).value = a.smax; w.getCell(3 + i, 21).value = a.usuario_atendido; w.getCell(3 + i, 22).value = a.obs;
    });
    [18, 22, 18, 18, 14, 16, 15, 17, 12, 22, 40, 2, 2, 2, 2, 15, 8, 2, 14, 16, 20, 30].forEach((wd, i) => w.getColumn(i + 1).width = wd);
    w.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `atendimentos-${S.mes}.xlsx` });
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --------------------------------------------------------------- Usuários (líder)
async function telaUsuarios(main) {
  S.recarregar = null;
  try { S.usuarios = await api.listarUsuarios(); } catch (e) { toast(e.message, true); }
  const lista = [...S.usuarios].sort((a, b) => (a.ativo - b.ativo) || a.nome.localeCompare(b.nome));
  const link = location.href.split('#')[0];
  main.innerHTML = `<div class="head"><div><h2>Usuários</h2>
      <p>Para entrar alguém novo: mande o link do sistema, a pessoa cria a conta com o e-mail ${api.DOMINIOS.map(d => '@' + esc(d)).join(' ou ')} e você libera aqui.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="cop">Copiar convite</button><button class="btn" id="imp">Importar planilha antiga</button></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
    ${lista.map(u => {
      const eu = u.id === S.perfil.id;
      const situacao = u.ativo ? '<span class="chip FECHADO">Ativo</span>' : (u.bloqueado ? '<span class="chip">Bloqueado</span>' : '<span class="chip TENT">Aguardando liberação</span>');
      return `<tr data-id="${esc(u.id)}">
      <td><b>${esc(u.nome)}</b>${eu ? ' <span class="muted">(você)</span>' : ''}</td><td>${esc(u.email)}</td>
      <td><select data-acao="perfil" ${eu ? 'disabled' : ''} style="width:auto;height:30px"><option value="tecnico" ${u.perfil === 'tecnico' ? 'selected' : ''}>Técnico</option><option value="admin" ${u.perfil === 'admin' ? 'selected' : ''}>Líder / admin</option></select></td>
      <td>${situacao}</td>
      <td style="text-align:right">${eu ? '' : (u.ativo ? '<button class="btn sm danger" data-acao="bloquear">Bloquear</button>' : '<button class="btn sm primary" data-acao="liberar">Liberar acesso</button>')}</td></tr>`;
    }).join('')}</tbody></table></div></div>
    <p class="hint" style="margin-top:12px">Esqueceu a senha? A própria pessoa usa "Esqueci minha senha" na tela de login. Bloquear tira o acesso na hora, mas mantém os atendimentos registrados.</p>
    <input type="file" id="arq" accept=".xlsx" hidden>`;
  $('#cop').onclick = async () => {
    const msg = `Acesse o sistema de atendimentos: ${link}\nClique em "Primeiro acesso? Criar conta", use seu e-mail da empresa e confirme pelo link que chega no Outlook. Depois me avise que eu libero seu acesso.`;
    try { await navigator.clipboard.writeText(msg); toast('Convite copiado. Cole no WhatsApp/Teams.'); } catch { prompt('Copie o convite:', msg); }
  };
  $('#imp').onclick = () => $('#arq').click();
  $('#arq').onchange = importar;
  $$('tr[data-id]', main).forEach(tr => {
    const u = lista.find(x => x.id === tr.dataset.id);
    const mudar = async (dados, msg) => { try { await api.atualizarUsuario(u.id, dados); toast(msg); S.usuarios = null; render(); } catch (e) { toast(e.message, true); } };
    const pf = $('[data-acao=perfil]', tr); pf.onchange = () => mudar({ perfil: pf.value }, 'Perfil atualizado.');
    const lib = $('[data-acao=liberar]', tr); if (lib) lib.onclick = () => mudar({ ativo: true, bloqueado: false }, `${u.nome} liberado.`);
    const blq = $('[data-acao=bloquear]', tr); if (blq) blq.onclick = () => confirm(`Bloquear ${u.nome}? Ele não conseguirá mais acessar.`) && mudar({ ativo: false, bloqueado: true }, `${u.nome} bloqueado.`);
  });
}

async function idImportacao(uid, at) {
  const bytes = new TextEncoder().encode([uid, at.smax, at.inicio, at.comarca].join('|'));
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return 'imp_' + [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
function normNome(n) { return s(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1'); }

async function importar(ev) {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  if (!window.XLSX) return toast('Aguarde o carregamento e tente de novo.', true);
  toast('Lendo a planilha…');
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', sheetRows: 20000, cellFormula: false, cellStyles: false });
    const resumo = { porAba: {}, semTecnico: [], novos: 0, jaExistiam: 0 };
    const itens = [];
    for (const aba of wb.SheetNames) {
      if (/painel/i.test(aba)) continue;
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '' });
      if (!linhas.length || !s(linhas[0][0]).toLowerCase().includes('smax')) continue;
      const u = S.usuarios.find(x => normNome(x.nome) === normNome(aba)) || S.usuarios.find(x => normNome(x.nome.split(' ')[0]) === normNome(aba));
      if (!u) { resumo.semTecnico.push(aba); continue; }
      let n = 0;
      for (const row of linhas.slice(1)) {
        if (!s(row[0]) && !s(row[1])) continue;
        const at = montarAtendimento({ smax: row[0], comarca: row[1], inicio: row[2], termino: row[3], ticket_softplan: row[5], status: row[6], encaminhado_para: row[7], home_local: row[8] }, u.id, u.nome);
        if (!at.comarca) at.comarca = '(não informada)';
        itens.push({ id: await idImportacao(u.id, at), dados: at }); n++;
      }
      resumo.porAba[aba] = n;
    }
    const existentes = await api.idsExistentes(itens.map(i => i.id));
    const novos = itens.filter(i => !existentes.has(i.id));
    resumo.jaExistiam = itens.length - novos.length; resumo.novos = novos.length;
    if (novos.length) { toast(`Gravando ${novos.length} atendimento(s)…`); await api.gravarLote(novos); }
    const abas = Object.entries(resumo.porAba).map(([k, v]) => `<li>${esc(k)}: ${v} linha(s)</li>`).join('');
    modal('Importação concluída', `<p><b>${resumo.novos}</b> atendimento(s) importado(s).${resumo.jaExistiam ? ` ${resumo.jaExistiam} já existiam e foram ignorados.` : ''}</p>
      ${abas ? `<ul>${abas}</ul>` : ''}
      ${resumo.semTecnico.length ? `<div class="err">Abas sem técnico com esse nome (não importadas): ${esc(resumo.semTecnico.join(', '))}. Quando a pessoa criar a conta com o mesmo nome da aba, importe de novo — o que já entrou não duplica.</div>` : ''}`,
      [{ t: 'OK', primary: true }], 'sm');
  } catch (e) { console.error(e); toast(e.message || 'Não consegui ler esse arquivo.', true); }
}
