import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, onSnapshot, getDoc, setDoc, updateDoc } from './firebase';
import { UserProfile } from './types';
import Login from './components/Login';
import Register from './components/Register';
import Feed from './components/Feed';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import Messenger from './components/Messenger';
import { seedInitialData } from './seed';


export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<string>('login');
  
  // Track continuous view inside callbacks safely without dependency re-triggers
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  
  // O username visitado quando exibindo o Perfil
  const [targetUsernameProfile, setTargetUsernameProfile] = useState<string>('jpvano_admin');
  
  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Status de conexão à Internet em tempo real
  const [isOnline, setIsOnline] = useState<boolean>(window.navigator.onLine);

  // Controle global do painel Messenger (Directs e Ligações)
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [messengerTargetUser, setMessengerTargetUser] = useState<string | null>(null);

  function openMessengerWithUser(username: string | null) {
    setMessengerTargetUser(username);
    setIsMessengerOpen(true);
  }

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
  }

  // Monitora conexões de rede em tempo real
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      showToast("📶 Conexão restabelecida! Sincronizando dados com o Firestore.");
    }
    function handleOffline() {
      setIsOnline(false);
      showToast("🔌 Você está desconectado. O JPvano continuará funcionando com dados persistidos localmente!");
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Controla desaparecimento do toast automaticamente
  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => {
        setToastVisible(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

  // Semeia banco de dados Firestore no primeiro carregamento caso esteja vazio
  useEffect(() => {
    seedInitialData();
  }, []);

  // Monitora mudanças no estado de login com Firestore em tempo real
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      // Limpa listener anterior se houver
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (user) {
        // Escuta o documento do usuário logado no Firestore em tempo real para obter privilégios, banimentos etc.
        const userRef = doc(db, 'users', user.uid);
        
        // Auto-heal de privilégios para os administradores principais do JPvano
        const loggedEmail = user.email?.toLowerCase();
        if (loggedEmail === 'joaopedromoladeoliveira@gmail.com' || loggedEmail === 'jpvanoredesocial@gmail.com') {
          getDoc(userRef).then(async (snap) => {
            if (snap.exists()) {
              const uData = snap.data();
              if (uData.role !== 'superadmin' || uData.status !== 'ativo') {
                await updateDoc(userRef, { role: 'superadmin', status: 'ativo' });
              }
            } else {
              // Criação resiliente caso o documento mestre tenha sido deletado
              const defaultUsername = loggedEmail === 'joaopedromoladeoliveira@gmail.com' ? 'joaopedro_owner' : 'jpvano_admin';
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                username: defaultUsername,
                firstName: loggedEmail === 'joaopedromoladeoliveira@gmail.com' ? 'João Pedro' : 'JP',
                lastName: loggedEmail === 'joaopedromoladeoliveira@gmail.com' ? 'Mola de Oliveira' : 'Vano',
                role: 'superadmin',
                avatar: '👑',
                bio: 'Administrador Principal do JPvano 📸',
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                status: 'ativo',
                createdAt: Date.now()
              });
            }
          }).catch(err => {
            console.error("Erro ao verificar/auto-heal de administradores principais:", err);
          });
        }

        unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;
            if (profile.status === 'banido') {
              showToast("⚠️ Sua conta está banida.");
              auth.signOut();
              setCurrentUser(null);
              setView('login');
            } else {
              setCurrentUser(profile);
              // Avança automaticamente se o usuário estiver logado e estiver na login/register
              const currentView = viewRef.current;
              if (currentView === 'login' || currentView === 'register') {
                setView('feed');
              }
            }
          }
        }, (error) => {
          console.error("Erro ao escutar dados do usuário logado:", error);
        });
      } else {
        setCurrentUser(null);
        const currentView = viewRef.current;
        if (currentView !== 'register' && currentView !== 'admin-anonymous') {
          setView('login');
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // View Router Render
  function renderView() {
    switch (view) {
      case 'login':
        return (
          <Login 
            onNavigate={(v) => setView(v)} 
            onSetUser={(u) => setCurrentUser(u)} 
            showToast={showToast} 
          />
        );
      case 'register':
        return (
          <Register 
            onNavigate={(v) => setView(v)} 
            onSetUser={(u) => setCurrentUser(u)} 
            showToast={showToast} 
          />
        );
      case 'feed':
        return (
          <Feed 
            user={currentUser} 
            onNavigate={(v) => setView(v)} 
            onSelectUserProps={(username) => setTargetUsernameProfile(username)}
            showToast={showToast}
            isOnline={isOnline}
            onOpenMessenger={openMessengerWithUser}
          />
        );
      case 'profile':
        return (
          <Profile 
            currentLoggedUser={currentUser} 
            targetUsername={targetUsernameProfile}
            onNavigate={(v) => setView(v)}
            onSelectUserProps={(username) => setTargetUsernameProfile(username)}
            showToast={showToast}
            onOpenMessenger={openMessengerWithUser}
          />
        );
      case 'admin':
        if (!currentUser || !['superadmin', 'admin', 'moderator'].includes(currentUser.role)) {
          return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
              <span className="text-4xl mb-4">🛡️</span>
              <h2 className="text-lg font-bold text-gray-800">Acesso Restrito</h2>
              <p className="text-sm text-gray-400 mt-2 max-w-sm">Esta área administrativa destina-se apenas a administradores e fundadores.</p>
              <button onClick={() => setView('feed')} className="mt-4 px-4 py-2 bg-[#E1306C] text-white text-xs font-bold rounded-lg hover:bg-opacity-90">
                Voltar para o Feed
              </button>
            </div>
          );
        }
        return (
          <AdminPanel 
            user={currentUser} 
            onNavigate={(v) => setView(v)} 
            showToast={showToast} 
          />
        );
      case 'admin-anonymous': // Visão demonstrativa do painel administrative se o usuário assim desejar
        return (
          <AdminPanel 
            user={{
              uid: 'demo_uid',
              email: 'jpvanoredesocial@gmail.com',
              username: 'jpvano_admin',
              firstName: 'JP',
              lastName: 'Vano',
              role: 'superadmin',
              avatar: '👑',
              bio: 'Fundador Demonstração',
              followersCount: 0,
              followingCount: 0,
              postsCount: 0,
              birthdate: '2000-01-01',
              status: 'ativo',
              createdAt: Date.now()
            }} 
            onNavigate={(v) => setView(v)} 
            showToast={showToast} 
          />
        );
      default:
        return (
          <Feed 
            user={currentUser} 
            onNavigate={(v) => setView(v)} 
            onSelectUserProps={(username) => setTargetUsernameProfile(username)}
            showToast={showToast}
            isOnline={isOnline}
            onOpenMessenger={openMessengerWithUser}
          />
        );
    }
  }

  return (
    <div className="relative font-sans antialiased text-gray-800">
      
      {/* RENDER PRINCIPAL DA ROTA */}
      {renderView()}

      {/* MESSENGER DRAWER CONTROLLER */}
      {currentUser && (
        <Messenger 
          user={currentUser}
          isOpen={isMessengerOpen}
          onClose={() => { setIsMessengerOpen(false); setMessengerTargetUser(null); }}
          showToast={showToast}
          isOnline={isOnline}
          targetUserOnOpen={messengerTargetUser}
        />
      )}

      {/* TOAST SYSTEM POPUP */}
      {toastVisible && toastMessage && (
        <div 
          className="fixed bottom-6 right-6 bg-gray-900 border border-gray-800 text-white px-5 py-3.5 rounded-xl text-xs font-semibold shadow-2xl z-50 flex items-center gap-2 max-w-sm transition-transform duration-300 animate-slide-up"
          style={{ animation: 'slideUp 0.3s ease-out forwards' }}
          id="toast-notification-id"
        >
          <span className="text-rose-500 text-sm">✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* STYLES AUXILIARES DO TOAST */}
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(1.5rem);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
