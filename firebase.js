// Camada de dados: tudo que fala com o Firebase fica aqui.
// O app.js só usa as funções exportadas em `api`.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, updateProfile, reauthenticateWithCredential,
  EmailAuthProvider, updatePassword, setPersistence, browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  serverTimestamp, writeBatch, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, DOMINIOS, ADMINS_INICIAIS } from './config.js';

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
auth.languageCode = 'pt-BR';
setPersistence(auth, browserLocalPersistence).catch(() => {});
const db = getFirestore(fb);

const col = n => collection(db, n);
const lista = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const usuarioAtual = () => auth.currentUser;
const emailDe = u => (u.email || '').toLowerCase();

// Traduz os erros do Firebase para mensagens em português
function erro(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Esqueci minha senha" se precisar.',
    'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres, com letras e números.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de trocar a senha.',
    'auth/unauthorized-domain': 'Este endereço do site não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).',
    'auth/operation-not-allowed': 'O login por e-mail/senha não está ativado no Firebase (Authentication > Método de login).',
    'permission-denied': 'Sem permissão para isso. Se acabou de confirmar o e-mail, saia e entre de novo.',
    'unavailable': 'Sem conexão com o servidor. Tente de novo.',
  };
  const err = new Error(m[c] || (e && e.message) || 'Erro inesperado.');
  err.code = c;
  return err;
}
const tentar = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw erro(e); } };

export const api = {
  DOMINIOS, ADMINS_INICIAIS,

  // ---------- autenticação
  aoMudarLogin(cb) {
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: emailDe(u), nome: u.displayName || '', verificado: u.emailVerified } : null));
  },
  entrar: tentar(async (email, senha) => { await signInWithEmailAndPassword(auth, email.trim(), senha); }),
  sair: tentar(async () => { await signOut(auth); }),
  criarConta: tentar(async (nome, email, senha) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
    await updateProfile(cred.user, { displayName: nome.trim() });
    await sendEmailVerification(cred.user);
  }),
  reenviarVerificacao: tentar(async () => { await sendEmailVerification(usuarioAtual()); }),
  // recarrega o usuário (para ler emailVerified) e renova o token usado pelas regras
  conferirVerificacao: tentar(async () => {
    const u = usuarioAtual(); await u.reload(); await u.getIdToken(true); return usuarioAtual().emailVerified;
  }),
  esqueciSenha: tentar(async email => { await sendPasswordResetEmail(auth, email.trim()); }),
  trocarSenha: tentar(async (atual, nova) => {
    const u = usuarioAtual();
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, atual));
    await updatePassword(u, nova);
  }),

  // ---------- perfil (coleção "usuarios", id = uid do Firebase Auth)
  meuPerfil: tentar(async () => {
    const s = await getDoc(doc(db, 'usuarios', usuarioAtual().uid));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }),
  criarMeuPerfil: tentar(async nome => {
    const u = usuarioAtual(); const email = emailDe(u);
    const lider = ADMINS_INICIAIS.map(x => x.toLowerCase()).includes(email);
    const p = { nome: nome.trim().slice(0, 80), email, perfil: lider ? 'admin' : 'tecnico', ativo: lider, criado_em: serverTimestamp() };
    await setDoc(doc(db, 'usuarios', u.uid), p);
    return { id: u.uid, ...p };
  }),
  listarUsuarios: tentar(async () => lista(await getDocs(col('usuarios')))),
  atualizarUsuario: tentar(async (uid, dados) => { await updateDoc(doc(db, 'usuarios', uid), dados); }),

  // ---------- atendimentos
  listarAtendimentos: tentar(async ({ mes, uid }) => {
    const f = [where('mes', '==', mes)];
    if (uid) f.push(where('uid', '==', uid));
    return lista(await getDocs(query(col('atendimentos'), ...f)));
  }),
  // usado para não deixar registrar o mesmo chamado SMAX duas vezes
  buscarPorSmax: tentar(async smax => lista(await getDocs(query(col('atendimentos'), where('smax', '==', String(smax).trim()))))),
  // todos os atendimentos de um técnico (qualquer mês) — usado ao desligar alguém
  listarPorTecnico: tentar(async uid => lista(await getDocs(query(col('atendimentos'), where('uid', '==', uid))))),
  // passa chamados para outro técnico (só o líder consegue, pelas regras)
  transferirAtendimentos: tentar(async itens => {
    for (let i = 0; i < itens.length; i += 400) {
      const b = writeBatch(db);
      for (const { id, uid, tecnico, historico } of itens.slice(i, i + 400))
        b.update(doc(db, 'atendimentos', id), { uid, tecnico, historico, atualizado_em: serverTimestamp() });
      await b.commit();
    }
  }),
  // lista oficial de comarcas (documento config/comarcas)
  lerComarcas: tentar(async () => { const d = await getDoc(doc(db, 'config', 'comarcas')); return d.exists() ? [...(d.data().lista || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')) : []; }),
  // acrescenta sem sobrescrever (funciona mesmo se duas pessoas cadastrarem ao mesmo tempo)
  adicionarComarca: tentar(async (nome, por) => { await setDoc(doc(db, 'config', 'comarcas'), { lista: arrayUnion(nome), por, atualizado_em: serverTimestamp() }, { merge: true }); }),
  salvarComarcas: tentar(async (lista, por) => { await setDoc(doc(db, 'config', 'comarcas'), { lista, por, atualizado_em: serverTimestamp() }); }),
  listarTodosAtendimentos: tentar(async () => lista(await getDocs(col('atendimentos')))),
  atualizarComarcas: tentar(async itens => {
    for (let i = 0; i < itens.length; i += 400) {
      const b = writeBatch(db);
      for (const { id, comarca } of itens.slice(i, i + 400)) b.update(doc(db, 'atendimentos', id), { comarca, atualizado_em: serverTimestamp() });
      await b.commit();
    }
  }),
  listarAgendados: tentar(async ({ uid }) => {
    const f = [where('status', '==', 'AGENDADO')];
    if (uid) f.push(where('uid', '==', uid));
    return lista(await getDocs(query(col('atendimentos'), ...f)));
  }),
  salvarAtendimento: tentar(async (id, dados) => {
    const d = { ...dados, atualizado_em: serverTimestamp() };
    if (id) { await setDoc(doc(db, 'atendimentos', id), d, { merge: true }); return id; }
    const r = await addDoc(col('atendimentos'), { ...d, criado_em: serverTimestamp() });
    return r.id;
  }),
  excluirAtendimento: tentar(async id => { await deleteDoc(doc(db, 'atendimentos', id)); }),

  // importação: grava com id fixo (não duplica se importar o mesmo arquivo de novo)
  idsExistentes: tentar(async ids => {
    const out = new Set();
    for (let i = 0; i < ids.length; i += 50) {
      const r = await Promise.all(ids.slice(i, i + 50).map(id => getDoc(doc(db, 'atendimentos', id))));
      r.forEach(s => s.exists() && out.add(s.id));
    }
    return out;
  }),
  gravarLote: tentar(async itens => {
    for (let i = 0; i < itens.length; i += 400) {
      const b = writeBatch(db);
      for (const { id, dados } of itens.slice(i, i + 400)) b.set(doc(db, 'atendimentos', id), { ...dados, criado_em: serverTimestamp(), atualizado_em: serverTimestamp() });
      await b.commit();
    }
  }),
};
