import React, { useState } from 'react';
import { 
  auth, 
  createUserWithEmailAndPassword, 
  db, 
  doc, 
  setDoc,
  collection,
  query,
  where,
  getDocs
} from '../firebase';
import { UserProfile } from '../types';

interface RegisterProps {
  onNavigate: (view: string) => void;
  onSetUser: (user: UserProfile | null) => void;
  showToast: (msg: string) => void;
}

export default function Register({ onNavigate, onSetUser, showToast }: RegisterProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProviderWarning, setShowProviderWarning] = useState(false);
  
  // Detecção de força de senha
  const [strengthScore, setStrengthScore] = useState(0);

  function checkStrength(val: string) {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    setStrengthScore(score);
  }

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^a-z0-9_.]/gi, '').toLowerCase();
    setUsername(val);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const cleanedUsername = username.trim().toLowerCase();
    
    if (cleanedUsername.length < 3) {
      showToast('❌ O nome de usuário deve ter pelo menos 3 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      showToast('❌ As senhas não coincidem!');
      return;
    }

    if (password.length < 6) {
      showToast('❌ A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verificar se o username já está sendo usado no Firestore por outra pessoa
      const q = query(collection(db, 'users'), where('username', '==', cleanedUsername));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        showToast('❌ Este nome de usuário já está sendo usado por outra pessoa. Escolha outro!');
        setLoading(false);
        return;
      }

      // 2. Criar usuário no Firebase Auth (Auth faz a verificação de e-mail duplicado nativamente)
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // 3. Criar perfil no Firestore
      const userEmailLower = email.trim().toLowerCase();
      const isSuperAdmin = userEmailLower === "jpvanoredesocial@gmail.com" || userEmailLower === "joaopedromoladeoliveira@gmail.com";
      const initialLetter = firstName.slice(0, 2).toUpperCase() || '✨';

      const profileData: UserProfile = {
        uid: user.uid,
        email: email.trim(),
        username: cleanedUsername,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: isSuperAdmin ? 'superadmin' : 'user',
        avatar: isSuperAdmin ? '👑' : initialLetter,
        bio: isSuperAdmin ? 'Administrador e Proprietário do JPvano 📸' : 'Olá! Acabei de me juntar ao JPvano.',
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        birthdate: birthdate || '2000-01-01', // Fallback caso esteja em branco
        status: 'ativo',
        createdAt: Date.now()
      };

      // Escrever no Firestore (isso cria ou atualiza localmente e sincroniza de forma resiliente)
      await setDoc(doc(db, 'users', user.uid), profileData);

      onSetUser(profileData);
      showToast('🎉 Conta criada com sucesso! Aproveite o JPvano.');
      onNavigate('feed');
    } catch (err: any) {
      console.error(err);
      let errMsg = "Erro ao cadastrar usuário.";
      if (err.code === "auth/operation-not-allowed") {
        errMsg = "O provedor de login com E-mail/Senha não está ativado no Firebase Console para este projeto.";
        setShowProviderWarning(true);
      } else if (err.code === "auth/email-already-in-use") {
        errMsg = "Este endereço de e-mail já está em uso.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "Endereço de e-mail inválido.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "A senha fornecida é muito fraca.";
      } else if (err.message) {
        errMsg = err.message;
      }
      showToast(`❌ ${errMsg}`);
    } finally {
      setLoading(false);
    }
  }

  const colors = ['bg-red-500', 'bg-amber-500', 'bg-green-500', 'bg-green-600'];
  const widths = ['w-1/4', 'w-1/2', 'w-3/4', 'w-full'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6 font-['Inter']">
      <div className="w-full max-w-[420px] bg-white rounded-2xl p-10 border border-gray-100 shadow-xl">
        <div className="font-['Space_Grotesk'] tracking-tight font-bold text-4xl text-center text-black mb-2">
          JPvano
        </div>
        <div className="text-center text-gray-400 text-sm mb-6 leading-relaxed">
          Cadastre-se para ver fotos e vídeos dos seus amigos.
        </div>

        {showProviderWarning && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs leading-relaxed">
            <strong className="font-bold block mb-1">⚠️ Ativação Necessária no Firebase</strong>
            Para permitir o cadastro por E-mail e Senha, siga estes passos rápidos no Console do Firebase:
            <ol className="list-decimal pl-4 mt-2 space-y-1 font-medium">
              <li>Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-red-900 hover:text-red-950">Console do Firebase</a> e clique no seu projeto.</li>
              <li>No menu lateral esquerdo, clique em <strong className="font-bold">Authentication</strong>.</li>
              <li>Vá para a aba <strong className="font-bold">Sign-in method</strong> (Método de login).</li>
              <li>Clique em <strong className="font-bold">Adicionar novo provedor</strong> e selecione <strong className="font-bold">E-mail/Senha</strong> (Email/Password).</li>
              <li>Habilite a primeira opção (Ativar) e clique em <strong className="font-bold">Salvar</strong>.</li>
            </ol>
            <p className="mt-2 text-[10px] text-red-650">Após ativar, você poderá criar sua conta normalmente clicando em Criar Conta!</p>
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block font-medium">Nome</label>
              <input 
                type="text" 
                required
                placeholder="João"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block font-medium">Sobrenome</label>
              <input 
                type="text" 
                required
                placeholder="Silva"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block font-medium">E-mail</label>
            <input 
              type="email" 
              required
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
            />
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block font-medium">Nome de usuário</label>
            <input 
              type="text" 
              required
              placeholder="seu_usuario"
              value={username}
              onChange={handleUsernameChange}
              className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
            />
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block font-medium">Data de nascimento</label>
            <input 
              type="date" 
              required
              value={birthdate}
              onChange={e => setBirthdate(e.target.value)}
              className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
            />
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block font-medium">Senha</label>
            <input 
              type="password" 
              required
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={e => { 
                setPassword(e.target.value); 
                checkStrength(e.target.value); 
              }}
              className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
            />
            {password.length > 0 && (
              <div className="h-1 rounded bg-gray-150 mt-2 overflow-hidden transition-all duration-300">
                <div className={`h-full transition-all duration-300 ${colors[strengthScore - 1] || 'bg-gray-200'} ${widths[strengthScore - 1] || 'w-0'}`} />
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-1 block font-medium">Confirmar senha</label>
            <input 
              type="password" 
              required
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
            />
          </div>

          <div className="text-[11px] text-gray-400 text-center my-4 leading-relaxed">
            Ao se cadastrar, você concorda com os nossos{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); showToast("Termos de Serviço."); }} className="text-black hover:underline font-semibold">Termos</a>, a{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); showToast("Política de Privacidade."); }} className="text-black hover:underline font-semibold">Política de Privacidade</a>{" "}
            e a{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); showToast("Política de Cookies."); }} className="text-black hover:underline font-semibold">Política de Cookies</a>.
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 bg-black hover:bg-zinc-900 border-none rounded-xl text-white font-semibold text-sm cursor-pointer transition-opacity active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {loading ? "Criando conta..." : "Criar Conta"}
          </button>
        </form>

        <div className="text-center mt-6 text-sm text-gray-500">
          Já tem uma conta?{" "}
          <button 
            type="button"
            onClick={() => onNavigate('login')}
            className="text-black hover:underline font-semibold bg-transparent border-none cursor-pointer"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
