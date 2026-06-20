import React, { useState } from 'react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  db, 
  doc, 
  getDoc, 
  setDoc,
  collection,
  getDocs,
  query,
  where
} from '../firebase';
import { UserProfile } from '../types';

interface LoginProps {
  onNavigate: (view: string) => void;
  onSetUser: (user: UserProfile | null) => void;
  showToast: (msg: string) => void;
}

export default function Login({ onNavigate, onSetUser, showToast }: LoginProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProviderWarning, setShowProviderWarning] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      let emailAddress = identifier.trim();
      
      // Suporte mágico para login via username
      if (!emailAddress.includes('@')) {
        try {
          const q = query(collection(db, 'users'), where('username', '==', emailAddress.toLowerCase()));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            showToast("❌ Nome de usuário não encontrado.");
            setLoading(false);
            return;
          }
          const foundUser = querySnapshot.docs[0].data() as UserProfile;
          emailAddress = foundUser.email;
        } catch (err) {
          console.error("Erro ao identificar username:", err);
          showToast("❌ Erro ao converter login pelo nome de usuário.");
          setLoading(false);
          return;
        }
      }

      const userCredential = await signInWithEmailAndPassword(auth, emailAddress, password);
      const user = userCredential.user;

      // Buscar perfil no Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      let profileData: UserProfile;

      if (userDocSnap.exists()) {
        profileData = userDocSnap.data() as UserProfile;
        
        // Garante que o fundador sempre seja superadmin no banco (comparações com case insensitive)
        const userEmailLower = user.email?.toLowerCase() || '';
        const hasAdminEmail = userEmailLower === 'jpvanoredesocial@gmail.com' || userEmailLower === 'joaopedromoladeoliveira@gmail.com';
        if (hasAdminEmail && profileData.role !== 'superadmin') {
          profileData.role = 'superadmin';
          await setDoc(userDocRef, { role: 'superadmin' }, { merge: true });
        }
      } else {
        // Cria perfil básico se não existir
        const userEmailLower = user.email?.toLowerCase() || emailAddress.toLowerCase();
        const isSuperAdmin = userEmailLower === 'jpvanoredesocial@gmail.com' || userEmailLower === 'joaopedromoladeoliveira@gmail.com';
        const defaultUsername = userEmailLower.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
        
        profileData = {
          uid: user.uid,
          email: user.email || emailAddress,
          username: defaultUsername,
          firstName: isSuperAdmin ? (userEmailLower === 'jpvanoredesocial@gmail.com' ? 'JP' : 'João Pedro') : 'Usuário',
          lastName: isSuperAdmin ? (userEmailLower === 'jpvanoredesocial@gmail.com' ? 'Vano' : 'Mola') : 'Novo',
          role: isSuperAdmin ? 'superadmin' : 'user',
          avatar: isSuperAdmin ? '👑' : '👤',
          bio: isSuperAdmin ? 'Administrador e Proprietário do JPvano 📸' : 'Olá! Acabei de me juntar ao JPvano.',
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          birthdate: '2000-01-01',
          status: 'ativo',
          createdAt: Date.now()
        };

        await setDoc(userDocRef, profileData);
      }

      if (profileData.status === 'banido') {
        showToast("⚠️ Esta conta foi banida do JPvano.");
        await auth.signOut();
        setLoading(false);
        return;
      }

      onSetUser(profileData);
      showToast(`Bem-vindo de volta, @${profileData.username}! 👋`);

      if (['superadmin', 'admin'].includes(profileData.role)) {
        onNavigate('admin');
      } else {
        onNavigate('feed');
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = "Erro ao fazer login. Verifique suas credenciais.";
      if (err.code === "auth/operation-not-allowed") {
        errorMsg = "O provedor de login com E-mail/Senha não está ativado no Firebase Console para este projeto.";
        setShowProviderWarning(true);
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorMsg = "E-mail ou senha incorretos.";
      }
      showToast(`❌ ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      let profileData: UserProfile;

      if (userDocSnap.exists()) {
        profileData = userDocSnap.data() as UserProfile;
        
        // Garante que o fundador sempre seja superadmin no banco (comparações com case insensitive)
        const userEmailLower = user.email?.toLowerCase() || '';
        const hasAdminEmail = userEmailLower === 'jpvanoredesocial@gmail.com' || userEmailLower === 'joaopedromoladeoliveira@gmail.com';
        if (hasAdminEmail && profileData.role !== 'superadmin') {
          profileData.role = 'superadmin';
          await setDoc(userDocRef, { role: 'superadmin' }, { merge: true });
        }
      } else {
        // Se não existir, registrar usuário do Google no Firestore automaticamente
        const userEmailLower = user.email?.toLowerCase() || '';
        const isSuperAdmin = userEmailLower === 'jpvanoredesocial@gmail.com' || userEmailLower === 'joaopedromoladeoliveira@gmail.com';
        const rawName = user.displayName || "Google User";
        const nameParts = rawName.split(" ");
        const first = nameParts[0] || "Usuário";
        const last = nameParts.slice(1).join(" ") || "Social";
        const cleanUsername = (user.email ? user.email.split('@')[0] : 'user_' + user.uid.slice(0, 5)).toLowerCase().replace(/[^a-z0-9_]/g, '');

        profileData = {
          uid: user.uid,
          email: user.email || `${cleanUsername}@gmail.com`,
          username: cleanUsername,
          firstName: first,
          lastName: last,
          role: isSuperAdmin ? 'superadmin' : 'user',
          avatar: isSuperAdmin ? '👑' : '✨',
          bio: isSuperAdmin ? 'Administrador e Proprietário do JPvano 📸' : 'Compartilhando meus horizontes.',
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          birthdate: '1998-05-12',
          status: 'ativo',
          createdAt: Date.now()
        };

        await setDoc(userDocRef, profileData);
      }

      if (profileData.status === 'banido') {
        showToast("⚠️ Esta conta foi banida.");
        await auth.signOut();
        setLoading(false);
        return;
      }

      onSetUser(profileData);
      showToast(`Conectado com sucesso via Google como @${profileData.username}!`);
      
      if (['superadmin', 'admin'].includes(profileData.role)) {
        onNavigate('admin');
      } else {
        onNavigate('feed');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`❌ Erro no login social: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-[#FAFAFA]">
      <div className="flex w-full max-w-[900px] min-h-[580px] rounded-2xl overflow-hidden shadow-2xl bg-white border border-gray-100">
        
        {/* VISUAL / GRADIENT SIDE */}
        <div className="hidden md:flex flex-1 bg-gradient-to-br from-black via-zinc-800 to-zinc-900 flex-col items-center justify-center p-12 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent pointer-events-none" />
          <h1 className="font-['Space_Grotesk'] tracking-tight font-bold text-5xl mb-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.15)] z-10 text-white">
            JPvano
          </h1>
          <p className="text-base text-zinc-300 text-center max-w-[240px] leading-relaxed z-10 font-sans">
            Compartilhe seus melhores momentos com o mundo em tempo real
          </p>
          <div className="z-10 mt-8 w-[120px] h-[220px] bg-white/10 rounded-[24px] border-3 border-white/20 flex items-center justify-center text-4xl backdrop-blur-md shadow-inner">
            📸
          </div>
        </div>

        {/* FORM SIDE */}
        <div className="flex-[0.9] md:flex-none md:w-[380px] p-10 flex flex-col items-center justify-center bg-white">
          <div className="font-['Space_Grotesk'] tracking-tight font-bold text-4xl text-black mb-2">
            JPvano
          </div>
          <p className="text-sm text-gray-400 mb-8 font-medium">Faça login para continuar</p>

          {showProviderWarning && (
            <div className="w-full mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs leading-relaxed max-w-full">
              <strong className="font-bold block mb-1">⚠️ Ativação Necessária no Firebase</strong>
              Para permitir login e cadastro por E-mail/Senha, siga estes passos rápidos:
              <ol className="list-decimal pl-4 mt-2 space-y-1 font-medium">
                <li>Abra o <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-red-900 hover:text-red-950">Console do Firebase</a>.</li>
                <li>Vá em <strong className="font-bold">Authentication</strong> {`->`} <strong className="font-bold">Sign-in method</strong>.</li>
                <li>Ative o provedor de <strong className="font-bold">E-mail/Senha</strong> (Email/Password) e clique em <strong className="font-bold">Salvar</strong>.</li>
              </ol>
            </div>
          )}

          <form onSubmit={handleLogin} className="w-full">
            <div className="w-full mb-4 relative">
              <input 
                type="text" 
                id="identifier" 
                placeholder="exemplo@email.com" 
                required 
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
              />
              <span className="text-[11px] text-gray-400 mt-1 block">Digite seu endereço de e-mail</span>
            </div>

            <div className="w-full mb-3 relative">
              <input 
                type="password" 
                id="password" 
                placeholder="Senha" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none transition-colors"
              />
            </div>

            <div className="text-right mb-4">
              <button 
                type="button" 
                onClick={() => showToast("Funcionalidade de recuperação enviada para os logs de suporte offline.")}
                className="text-xs text-gray-400 hover:text-black transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 bg-black hover:bg-zinc-900 border-none rounded-xl text-white font-semibold text-sm cursor-pointer transition-opacity active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="flex items-center gap-3 w-full my-5 text-gray-400 text-xs before:content-[''] before:flex-1 before:h-[1px] before:bg-gray-200 after:content-[''] after:flex-1 after:h-[1px] after:bg-gray-200">
            ou
          </div>

          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 px-4 bg-white border-1.5 border-gray-200 rounded-xl text-sm font-medium cursor-pointer flex items-center justify-center gap-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continuar com Google
          </button>

          <div className="mt-6 text-sm text-gray-500 text-center">
            Não tem uma conta?{" "}
            <button 
              type="button"
              onClick={() => onNavigate('register')}
              className="text-[#E1306C] hover:underline font-medium bg-transparent border-none cursor-pointer"
            >
              Cadastre-se
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex gap-2 justify-center w-full">
            <button 
              type="button"
              onClick={() => onNavigate('admin-anonymous')}
              className="text-[11px] text-gray-400 hover:text-[#E1306C] transition-colors"
            >
              Acessar Painel como Admin Demonstrativo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
