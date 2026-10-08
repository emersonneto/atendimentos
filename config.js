// =====================================================================
//  CONFIGURAÇÃO — edite este arquivo antes de publicar
// =====================================================================

// 1) Cole aqui o objeto que o Firebase mostra em:
//    Console do Firebase > ⚙ Configurações do projeto > Seus apps > App da Web > Config
//    (Essas chaves podem ficar públicas: quem protege os dados são as regras do Firestore.)
export const firebaseConfig = {
  apiKey: 'AIzaSyACIsVft8YwYvQmrrQes7HJZWQEBVEtPWM',
  authDomain: 'atendimentos-field.firebaseapp.com',
  projectId: 'atendimentos-field',
  storageBucket: 'atendimentos-field.firebasestorage.app',
  messagingSenderId: '719459468235',
  appId: '1:719459468235:web:3886d753242a90ca37ec4e',
};

// 2) Domínio(s) do e-mail da empresa. Só esses e-mails conseguem criar conta.
//    IMPORTANTE: coloque o mesmo domínio no arquivo firestore.rules (função dominioOk).
export const DOMINIOS = ['it2b.com.br'];

// 3) E-mail(s) do líder. Essas contas já entram liberadas e como administrador.
//    IMPORTANTE: coloque os mesmos e-mails no arquivo firestore.rules (função adminInicial).
export const ADMINS_INICIAIS = ['emerson.araujo@it2b.com.br'];
