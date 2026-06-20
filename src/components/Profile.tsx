import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDocs,
  setDoc,
  deleteDoc,
  increment,
  auth
} from '../firebase';
import { UserProfile, Post } from '../types';

interface ProfileProps {
  currentLoggedUser: UserProfile | null;
  targetUsername: string; // O usuário cujo perfil estamos visualizando
  onNavigate: (view: string) => void;
  onSelectUserProps: (username: string) => void;
  showToast: (msg: string) => void;
  onOpenMessenger?: (username: string | null) => void;
}

export default function Profile({ currentLoggedUser, targetUsername, onNavigate, onSelectUserProps, showToast, onOpenMessenger }: ProfileProps) {
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // States para Edição de Perfil
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [updating, setUpdating] = useState(false);

  // Real-time seguidores system
  const [isFollowing, setIsFollowing] = useState(false);

  // monitora se o usuário logado segue o dono do perfil em tempo real
  useEffect(() => {
    if (!currentLoggedUser || !profileUser || currentLoggedUser.uid === profileUser.uid) {
      setIsFollowing(false);
      return;
    }
    const followDocId = `${currentLoggedUser.uid}_${profileUser.uid}`;
    const followRef = doc(db, 'follows', followDocId);

    const unsubscribe = onSnapshot(followRef, (docSnap) => {
      setIsFollowing(docSnap.exists());
    }, (error) => {
      console.error("Erro ao escutar follow status:", error);
    });

    return () => unsubscribe();
  }, [currentLoggedUser?.uid, profileUser?.uid]);

  // Alterna seguir/desseguir salvando no banco de dados
  async function handleFollowToggle() {
    if (!currentLoggedUser) {
      showToast("⚠️ Faça login para poder seguir usuários no JPvano.");
      return;
    }
    if (!profileUser) return;

    const followDocId = `${currentLoggedUser.uid}_${profileUser.uid}`;
    const followRef = doc(db, 'follows', followDocId);

    const loggedUserRef = doc(db, 'users', currentLoggedUser.uid);
    const targetUserRef = doc(db, 'users', profileUser.uid);

    try {
      if (isFollowing) {
        // Unfollow
        await deleteDoc(followRef);
        await updateDoc(targetUserRef, {
          followersCount: increment(-1)
        });
        await updateDoc(loggedUserRef, {
          followingCount: increment(-1)
        });
        showToast(`Você deixou de seguir @${profileUser.username}`);
      } else {
        // Follow
        await setDoc(followRef, {
          followerId: currentLoggedUser.uid,
          followedId: profileUser.uid,
          createdAt: Date.now()
        });
        await updateDoc(targetUserRef, {
          followersCount: increment(1)
        });
        await updateDoc(loggedUserRef, {
          followingCount: increment(1)
        });
        showToast(`Seguindo @${profileUser.username}! 🎉`);
      }
    } catch (err) {
      console.error("Erro ao seguir/desseguir:", err);
      showToast("❌ Erro ao salvar seguimento no Firestore.");
    }
  }

  // 1. Escuta dados do perfil em tempo real no Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'users'), where('username', '==', targetUsername));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const uDoc = snapshot.docs[0];
        const uData = { uid: uDoc.id, ...uDoc.data() } as UserProfile;
        setProfileUser(uData);
        
        // Inicializa inputs de edição
        setEditFirstName(uData.firstName || '');
        setEditLastName(uData.lastName || '');
        setEditBio(uData.bio || '');
        setEditWebsite(uData.website || '');
        setEditAvatar(uData.avatar || '');
      } else {
        setProfileUser(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Erro ao obter perfil: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [targetUsername]);

  // 2. Filtra e escuta posts desse usuário específico em tempo real
  useEffect(() => {
    const q = query(
      collection(db, 'posts'), 
      where('username', '==', targetUsername), 
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData: Post[] = [];
      snapshot.forEach((doc) => {
        postsData.push({ id: doc.id, ...doc.data() } as Post);
      });
      setUserPosts(postsData);
    }, (error) => {
      console.error("Erro ao buscar posts do usuário: ", error);
    });

    return () => unsubscribe();
  }, [targetUsername]);

  // Handler para processar e converter imagem selecionada
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Se o arquivo for muito grande, alertar amigavelmente (ex: > 1.2MB para caber bem no Firestore)
    if (file.size > 1200000) {
      showToast("⚠️ Imagem muito grande! Por favor, escolha outra foto de até 1.2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setEditAvatar(reader.result);
        showToast("✨ Foto carregada na memória offline!");
      }
    };
    reader.onerror = () => {
      showToast("❌ Erro ao ler a imagem selecionada.");
    };
    reader.readAsDataURL(file);
  }

  // Salva edições do perfil no Firestore em tempo real
  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileUser) return;

    setUpdating(true);
    try {
      const userRef = doc(db, 'users', profileUser.uid);
      await updateDoc(userRef, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        bio: editBio.trim(),
        website: editWebsite.trim(),
        avatar: editAvatar
      });

      setIsEditing(false);
      showToast("✨ Perfil atualizado com sucesso e replicado localmente!");
    } catch (err) {
      console.error(err);
      showToast("❌ Erro ao salvar alterações.");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center font-['Inter']">
        <div className="text-center font-semibold text-gray-500 animate-pulse text-sm">
          Carregando perfil e postagens...
        </div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center font-['Inter'] p-6">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Usuário não encontrado</h2>
        <p className="text-xs text-gray-400 text-center max-w-xs mb-6">Refaça a pesquisa ou verifique se o nome de usuário digitado está correto no Firestore.</p>
        <button onClick={() => onNavigate('feed')} className="px-5 py-2.5 bg-[#E1306C] text-white rounded-xl text-sm font-semibold hover:bg-[#C13584] transition-colors">
          Voltar para o Feed
        </button>
      </div>
    );
  }

  // Verifica se o perfil que está sendo visualizado é do usuário conectado
  const isSelf = currentLoggedUser ? currentLoggedUser.uid === profileUser.uid : false;

  const roleLabel = {
    superadmin: '👑 Super Admin',
    admin: '🛡️ Administrador',
    moderator: '⚡ Moderador',
    verified: '✅ Verificado',
    user: 'Usuário'
  };

  return (
    <div className="bg-[#FAFAFA] min-h-screen pb-12 font-['Inter']">
      
      {/* HEADER DE NAVEGAÇÃO COMPARTILHADO */}
      <nav className="fixed top-0 left-0 right-0 h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-5 md:px-[10%] z-50">
        <div className="flex items-center gap-2">
          <span onClick={() => onNavigate('feed')} className="text-xl cursor-pointer text-gray-700 hover:opacity-60 pr-2">←</span>
          <div 
            onClick={() => onNavigate('feed')}
            className="font-['Space_Grotesk'] tracking-tight font-bold text-2xl cursor-pointer text-black"
          >
            JPvano
          </div>
        </div>
        <div className="flex items-center gap-5 text-xl cursor-pointer text-gray-700">
          <span title="Página Inicial" onClick={() => onNavigate('feed')} className="hover:opacity-60">🏠</span>
          {currentLoggedUser ? (
            <div className="flex items-center gap-3">
              <div 
                title="Meu Perfil"
                onClick={() => { onSelectUserProps(currentLoggedUser.username); onNavigate('profile'); }}
                className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white border-2 border-white shadow-sm overflow-hidden"
              >
                {currentLoggedUser.avatar && (currentLoggedUser.avatar.startsWith('data:image/') || currentLoggedUser.avatar.startsWith('http')) ? (
                  <img 
                    src={currentLoggedUser.avatar} 
                    alt={currentLoggedUser.firstName} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-bold">{currentLoggedUser.avatar || currentLoggedUser.firstName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <button 
                onClick={async () => {
                  if (confirm("Deseja sair do JPvano e desconectar sua conta?")) {
                    await auth.signOut();
                    onNavigate('login');
                  }
                }}
                className="text-xs font-bold text-gray-500 hover:text-red-500 transition-colors bg-gray-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 border border-gray-200"
                title="Sair da Conta"
              >
                🚪 Sair
              </button>
            </div>
          ) : (
            <button onClick={() => onNavigate('login')} className="text-xs font-semibold px-3 py-1.5 bg-black hover:bg-zinc-900 text-white rounded-lg">Entrar</button>
          )}
        </div>
      </nav>

      {/* BODY DE PERFIL */}
      <div className="max-w-[935px] mx-auto pt-[90px] px-4">
        
        {/* HEADER DE INFORMAÇÕES DE USUÁRIO */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-10 md:gap-20 mb-11 pb-6 border-b border-gray-100">
          <div className="flex-shrink-0 relative">
            <div className="w-[150px] h-[150px] rounded-full bg-gradient-to-tr from-black via-zinc-400 to-zinc-800 flex items-center justify-center border-3 border-white shadow-lg overflow-hidden">
              {profileUser.avatar && (profileUser.avatar.startsWith('data:image/') || profileUser.avatar.startsWith('http')) ? (
                <img 
                  src={profileUser.avatar} 
                  alt={profileUser.firstName} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-6xl">{profileUser.avatar || "👤"}</span>
              )}
            </div>
          </div>

          <div className="flex-1 w-full text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5 flex-wrap">
              <h2 className="text-2xl font-light text-gray-800 flex items-center justify-center sm:justify-start gap-1.5 font-sans">
                @{profileUser.username}
                {(['superadmin', 'admin', 'verified'].includes(profileUser.role) || profileUser.isVerified) && (
                  <span className="text-blue-500 text-lg" title="Perfil Verificado">✅</span>
                )}
              </h2>
              
              <div className="flex justify-center gap-2">
                {isSelf ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-5 py-2 border border-gray-200 rounded-lg bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-sm"
                  >
                    Editar perfil
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleFollowToggle}
                      className={`px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all border ${
                        isFollowing 
                          ? 'bg-gray-150 border-gray-350 hover:bg-gray-200 text-gray-800' 
                          : 'bg-[#E1306C] border-none text-white hover:bg-[#C13584]'
                      }`}
                    >
                      {isFollowing ? 'Seguindo ✓' : 'Seguir'}
                    </button>
                    <button 
                      onClick={() => {
                        if (onOpenMessenger && profileUser) {
                          onOpenMessenger(profileUser.username);
                        } else {
                          showToast(`Enviando mensagem direta para @${profileUser?.username}...`);
                        }
                      }}
                      className="px-5 py-2 border border-gray-200 rounded-lg bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-sm"
                    >
                      Enviar mensagem
                    </button>
                  </>
                )}

                {isSelf && ['superadmin', 'admin'].includes(profileUser.role) && (
                  <button 
                    onClick={() => onNavigate('admin')}
                    className="px-4 py-2 bg-purple-600 border-none rounded-lg text-white text-xs font-semibold hover:bg-purple-700 cursor-pointer shadow-sm"
                  >
                    🛡️ Painel Admin
                  </button>
                )}
              </div>
            </div>

            {/* SEÇÃO DE ESTATÍSTICAS */}
            <div className="flex justify-center sm:justify-start gap-10 mb-5 text-sm text-gray-700">
              <div className="stat">
                <span className="font-semibold text-gray-900 block sm:inline mr-1">{userPosts.length}</span>
                <span className="text-gray-400">publicações</span>
              </div>
              <div className="stat">
                <span className="font-semibold text-gray-900 block sm:inline mr-1">{(profileUser.followersCount || 0).toLocaleString('pt-BR')}</span>
                <span className="text-gray-400">seguidores</span>
              </div>
              <div className="stat">
                <span className="font-semibold text-gray-900 block sm:inline mr-1">{(profileUser.followingCount || 0).toLocaleString('pt-BR')}</span>
                <span className="text-gray-400">seguindo</span>
              </div>
            </div>

            {/* BIO */}
            <div className="profile-bio max-w-md text-sm text-gray-800 leading-relaxed">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black text-white inline-block mb-2">
                {roleLabel[profileUser.role] || 'Usuário'}
              </span>
              <strong className="text-gray-900 font-bold block">{profileUser.firstName} {profileUser.lastName}</strong>
              <p className="whitespace-pre-line text-xs text-gray-600 mt-1">{profileUser.bio || 'Sem biografia.'}</p>
              {profileUser.website ? (
                <a 
                  href={profileUser.website.startsWith('http') ? profileUser.website : `https://${profileUser.website}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="font-semibold text-blue-600 hover:text-blue-800 text-xs hover:underline mt-2 inline-flex items-center gap-1 break-all"
                >
                  🔗 {profileUser.website}
                </a>
              ) : (
                <a href="#" className="font-medium text-[#00376B] text-xs hover:underline mt-2 block break-all">www.jpvano.com/{profileUser.username}</a>
              )}
            </div>
          </div>
        </div>

        {/* HIGHLIGHTS BAR */}
        <div className="flex gap-4 overflow-x-auto pb-6 mb-8 border-b border-gray-100 scrollbar-none font-sans">
          <div className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => showToast("Adicione novos destaques corporativos.")}>
            <div className="w-[77px] h-[77px] rounded-full border border-gray-200 flex items-center justify-center text-3xl bg-white shadow-sm hover:scale-105 transition-transform">
              ➕
            </div>
            <span className="text-xs text-gray-700">Destaque</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0">
            <div className="w-[77px] h-[77px] rounded-full border border-gray-200 flex items-center justify-center text-3xl bg-white shadow-sm">
              🌊
            </div>
            <span className="text-xs text-gray-700">Viagens</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0">
            <div className="w-[77px] h-[77px] rounded-full border border-gray-200 flex items-center justify-center text-3xl bg-white shadow-sm">
              🎸
            </div>
            <span className="text-xs text-gray-700">Música</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0">
            <div className="w-[77px] h-[77px] rounded-full border border-gray-200 flex items-center justify-center text-3xl bg-white shadow-sm">
              🌸
            </div>
            <span className="text-xs text-gray-700">Estampa</span>
          </div>
        </div>

        {/* TABS SELECT */}
        <div className="flex justify-center gap-10 border-t border-gray-200 -mt-px mb-6 font-sans">
          <div className="py-4 border-t-2 border-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-800 flex items-center gap-1.5 cursor-pointer">
            <span>⊞</span> Publicações
          </div>
          <div onClick={() => showToast("Visão Reels indisponível offline.")} className="py-4 border-t-2 border-transparent text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 flex items-center gap-1.5 cursor-pointer">
            <span>▷</span> Reels
          </div>
          <div onClick={() => showToast("Marcações indisponíveis no momento.")} className="py-4 border-t-2 border-transparent text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 flex items-center gap-1.5 cursor-pointer">
            <span>🏷️</span> Marcados
          </div>
        </div>

        {/* POSTS GRID */}
        <div className="grid grid-cols-3 gap-1 md:gap-3">
          {userPosts.map((post, idx) => (
            <div 
              key={post.id}
              onClick={() => showToast(`Detalhes: Legenda "${post.caption}"`)}
              className="aspect-square bg-gradient-to-tr from-black via-zinc-800 to-zinc-900 flex items-center justify-center text-4xl sm:text-5xl cursor-pointer relative group overflow-hidden rounded-lg shadow-sm"
            >
              <span className="transition-transform duration-300 group-hover:scale-110 drop-shadow-md select-none">{post.emoji}</span>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs sm:text-sm font-semibold select-none">
                ❤️ {post.likes?.length || 0}
              </div>
            </div>
          ))}

          {userPosts.length === 0 && (
            <div className="col-span-3 py-16 text-center text-gray-400 text-sm">
              Este usuário ainda não possui publicações sincronizadas.
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE EDIÇÃO DE BIOGRAFIA/PERFIL */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[420px] p-6 shadow-2xl relative font-['Inter']">
            <button 
              onClick={() => setIsEditing(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-xl cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Editar Perfil</h2>
            
            <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
              {/* UPLOAD DE FOTO DE PERFIL */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-semibold">Foto de Perfil</label>
                <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="w-[64px] h-[64px] rounded-full bg-zinc-800 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden flex-shrink-0">
                    {editAvatar && (editAvatar.startsWith('data:image/') || editAvatar.startsWith('http')) ? (
                      <img src={editAvatar} className="w-full h-full object-cover" alt="Preview do novo avatar" />
                    ) : (
                      <span className="text-2xl">{editAvatar || '👤'}</span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="cursor-pointer bg-black hover:bg-zinc-900 text-white text-xs px-3.5 py-1.5 rounded-lg font-semibold inline-block text-center hover:opacity-90 transition-opacity select-none shadow-sm max-w-[130px]">
                      Escolher arquivo
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileChange} 
                        className="hidden" 
                      />
                    </label>
                    <span className="text-[10px] text-gray-400">JPG ou PNG. Max 1.2MB para replicação offline.</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block font-medium">Nome</label>
                  <input 
                    type="text" 
                    required
                    value={editFirstName}
                    onChange={e => setEditFirstName(e.target.value)}
                    className="w-full px-4 py-2 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block font-medium">Sobrenome</label>
                  <input 
                    type="text" 
                    required
                    value={editLastName}
                    onChange={e => setEditLastName(e.target.value)}
                    className="w-full px-4 py-2 border-1.5 border-gray-250 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block font-medium">Escreva sua Biografia</label>
                <textarea 
                  rows={4}
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="w-full px-4 py-2 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block font-medium">Link na Bio (Website)</label>
                <input 
                  type="text" 
                  placeholder="https://meusite.com"
                  value={editWebsite}
                  onChange={e => setEditWebsite(e.target.value)}
                  className="w-full px-4 py-2 border-1.5 border-gray-200 rounded-xl text-sm focus:border-black bg-gray-50 focus:bg-white outline-none"
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={updating}
                  className="flex-1 py-3 bg-black hover:bg-zinc-900 rounded-xl text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                >
                  {updating ? 'Gravando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
