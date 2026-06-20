import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  addDoc,
  where,
  auth,
  deleteDoc,
  increment
} from '../firebase';
import { UserProfile, Post, Story, Suggestion, Reel, Song } from '../types';

interface FeedProps {
  user: UserProfile | null;
  onNavigate: (view: string) => void;
  onSelectUserProps: (username: string) => void;
  showToast: (msg: string) => void;
  isOnline: boolean;
  onOpenMessenger?: (username: string | null) => void;
}

export default function Feed({ user, onNavigate, onSelectUserProps, showToast, isOnline, onOpenMessenger }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);

  // Navigation and play states
  const [activeTab, setActiveTab] = useState<'posts' | 'reels'>('posts');
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [activeReelCommentsId, setActiveReelCommentsId] = useState<string | null>(null);
  
  // States para novos posts e comentários
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [pubType, setPubType] = useState<'post' | 'story' | 'reel'>('post');
  const [newPostCaption, setNewPostCaption] = useState('');
  const [newPostEmoji, setNewPostEmoji] = useState('🌅');

  // Mini editor states (upload e filtros)
  const [selectedMediaFile, setSelectedMediaFile] = useState<string>('');
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | 'emoji'>('emoji');
  const [fileError, setFileError] = useState('');
  const [filter, setFilter] = useState(''); // None, grayscale, sepia, etc.
  
  // Custom fine tuning photo/video adjustments
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(100);
  
  // Soundtrack / Music states
  const [selectedSongUrl, setSelectedSongUrl] = useState('');
  const [selectedSongTitle, setSelectedSongTitle] = useState('');

  // Floating text overlay states
  const [textOverlay, setTextOverlay] = useState('');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlaySize, setOverlaySize] = useState('text-lg');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  const [submittingPost, setSubmittingPost] = useState(false);
  const [commentInputs, setCommentInputs] = useState<{[key: string]: string}>({});
  const [reelCommentInputs, setReelCommentInputs] = useState<{[key: string]: string}>({});

  const emojisList = ['🏖️', '🎸', '🌸', '🏄', '🍕', '🎨', '🌅', '🏖️', '🎭', '🦋', '🌿', '⭐', '🎯', '🔥', '💎', '🌈', '🎪', '🦊', '🌙', '🎲', '🌺', '🎬', '🏔️', '🦅'];

  // Helper de CSS de Filtros
  function getFilterCss(filterName: string) {
    switch (filterName) {
      case 'grayscale': return 'grayscale(100%)';
      case 'sepia': return 'sepia(100%)';
      case 'vintage': return 'sepia(40%) saturate(140%) contrast(90%) hue-rotate(-10deg)';
      case 'cool': return 'contrast(115%) saturate(120%) hue-rotate(15deg)';
      case 'neon': return 'saturate(200%) hue-rotate(180deg) brightness(1.25)';
      default: return 'none';
    }
  }

  function getMediaStyle(item: any) {
    const filterName = item.filter || '';
    let filterStr = getFilterCss(filterName);
    if (filterStr === 'none') filterStr = '';
    
    if (item.brightness !== undefined) filterStr += ` brightness(${item.brightness}%)`;
    if (item.contrast !== undefined) filterStr += ` contrast(${item.contrast}%)`;
    if (item.saturation !== undefined) filterStr += ` saturate(${item.saturation}%)`;
    
    const rotateVal = item.rotation || 0;
    const zoomVal = item.zoom || 100;
    
    return {
      filter: filterStr.trim() || 'none',
      transform: `rotate(${rotateVal}deg) scale(${zoomVal / 100})`,
    };
  }

  function getPreviewStyle() {
    let filterStr = getFilterCss(filter);
    if (filterStr === 'none') filterStr = '';
    
    filterStr += ` brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    
    return {
      filter: filterStr.trim(),
      transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
    };
  }

  // 1. Escuta posts do Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData: Post[] = [];
      snapshot.forEach((doc) => {
        postsData.push({ id: doc.id, ...doc.data() } as Post);
      });
      setPosts(postsData);
    }, (error) => {
      console.error("Erro ao obter posts em tempo real: ", error);
    });

    return () => unsubscribe();
  }, []);

  // Escuta Reels em tempo real
  useEffect(() => {
    const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reelsData: Reel[] = [];
      snapshot.forEach((doc) => {
        reelsData.push({ id: doc.id, ...doc.data() } as Reel);
      });
      setReels(reelsData);
    }, (error) => {
      console.error("Erro ao carregar Reels do Firestore: ", error);
    });

    return () => unsubscribe();
  }, []);

  // Escuta Biblioteca de Músicas do Admin em tempo real
  useEffect(() => {
    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songsData: Song[] = [];
      snapshot.forEach((doc) => {
        songsData.push({ id: doc.id, ...doc.data() } as Song);
      });
      setSongs(songsData);
    }, (error) => {
      console.error("Erro ao carregar faixas de música: ", error);
    });

    return () => unsubscribe();
  }, []);

  // 2. Escuta stories do Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storiesData: Story[] = [];
      snapshot.forEach((doc) => {
        storiesData.push({ id: doc.id, ...doc.data() } as Story);
      });
      setStories(storiesData);
    }, (error) => {
      console.error("Erro ao obter stories em tempo real: ", error);
    });

    return () => unsubscribe();
  }, []);

  // 3. Escuta sugestões em tempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'suggestions'), (snapshot) => {
      const suggestionsData: Suggestion[] = [];
      snapshot.forEach((doc) => {
        suggestionsData.push({ id: doc.id, ...doc.data() } as Suggestion);
      });
      setSuggestions(suggestionsData);
    });

    return () => unsubscribe();
  }, []);

  // Timer funcional auto-avançável para os Stories (5 segundos por story)
  useEffect(() => {
    if (activeStoryIndex === null) {
      setStoryProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setStoryProgress((prev) => {
        if (prev >= 100) {
          // Próximo story
          if (activeStoryIndex < stories.length - 1) {
            setActiveStoryIndex(activeStoryIndex + 1);
            return 0;
          } else {
            setActiveStoryIndex(null);
            return 0;
          }
        }
        return prev + 1; // Incrementa 1%
      });
    }, 50); // 100 * 50ms = 5000ms (5 segundos totais)

    return () => clearInterval(interval);
  }, [activeStoryIndex, stories.length]);

  // Resetar a barra toda vez que mudar de story
  useEffect(() => {
    setStoryProgress(0);
  }, [activeStoryIndex]);

  // Handler para processar carregar arquivo de imagem/vídeo local
  function handleMediaFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError('');
    const isImg = file.type.startsWith('image/');
    const isVid = file.type.startsWith('video/');

    if (!isImg && !isVid) {
      setFileError("⚠️ Tipo de arquivo incompatível. Escolha uma imagem ou vídeo.");
      return;
    }

    setSelectedMediaType(isImg ? 'image' : 'video');

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedMediaFile(event.target.result as string);
        showToast("✓ Mídia importada com sucesso para o mini editor!");
      }
    };
    reader.onerror = () => {
      setFileError("❌ Ocorreu um erro ao ler o arquivo.");
    };
    reader.readAsDataURL(file);
  }

  // Excluir postagem (Post)
  async function handleDeletePost(post: Post) {
    if (!user) return;
    if (confirm("Deseja realmente deletar esta publicação do Feed?")) {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
        if (post.userId === user.uid) {
          await updateDoc(doc(db, 'users', user.uid), {
            postsCount: increment(-1)
          });
        }
        showToast("✓ Publicação deletada com sucesso!");
      } catch (err) {
        console.error("Erro ao deletar post:", err);
        showToast("❌ Erro ao deletar publicação.");
      }
    }
  }

  // Excluir story
  async function handleDeleteStory(storyId: string) {
    if (!user) return;
    if (confirm("Deseja realmente deletar este Story?")) {
      try {
        await deleteDoc(doc(db, 'stories', storyId));
        setActiveStoryIndex(null); // Fecha se estiver visualizando
        showToast("✓ Story deletado com sucesso!");
      } catch (err) {
        console.error("Erro ao deletar story:", err);
        showToast("❌ Erro ao deletar Story.");
      }
    }
  }

  // Excluir reel
  async function handleDeleteReel(reelId: string) {
    if (!user) return;
    if (confirm("Deseja realmente deletar este Reel?")) {
      try {
        await deleteDoc(doc(db, 'reels', reelId));
        showToast("✓ Reel deletado com sucesso!");
      } catch (err) {
        console.error("Erro ao deletar reel:", err);
        showToast("❌ Erro ao deletar Reel.");
      }
    }
  }

  // Toggle Like em tempo real com offline cache imediato!
  async function toggleLike(post: Post) {
    if (!user) {
      showToast("Por favor, faça login para curtir.");
      return;
    }

    const postRef = doc(db, 'posts', post.id);
    const hasLiked = post.likes.includes(user.uid);

    try {
      if (hasLiked) {
        await updateDoc(postRef, {
          likes: arrayRemove(user.uid)
        });
        showToast("Você descurtiu este post.");
      } else {
        await updateDoc(postRef, {
          likes: arrayUnion(user.uid)
        });
        showToast("Você curtiu este post! ❤️");
      }
    } catch (err) {
      console.error("Erro ao curtir post: ", err);
    }
  }

  // Comenta em tempo real em um post
  async function handleAddComment(postId: string, text: string) {
    if (!user) {
      showToast("Por favor, identifique-se para comentar.");
      return;
    }
    if (!text.trim()) return;

    const postRef = doc(db, 'posts', postId);
    const postObj = posts.find(p => p.id === postId);
    if (!postObj) return;

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      username: user.username,
      text: text,
      createdAt: Date.now()
    };

    try {
      await updateDoc(postRef, {
        comments: arrayUnion(newComment),
        commentsCount: (postObj.commentsCount || 0) + 1
      });
      
      // Limpar input
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      showToast("Comentário publicado! 💬");
    } catch (err) {
      console.error("Erro ao publicar comentário: ", err);
    }
  }

  // Cria nova publicação unificada (Post, Story ou Reel) com fotos, vídeos, filtros, música e text overlay
  async function handleCreateUnifiedPublication(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      showToast("Por favor, faça login para publicar.");
      return;
    }

    // Se for post comum ou reel, requer legenda
    if ((pubType === 'post' || pubType === 'reel') && !newPostCaption.trim()) {
      showToast("⚠️ Escreva uma legenda para a sua publicação!");
      return;
    }

    setSubmittingPost(true);
    try {
      const isEmojiType = !selectedMediaFile;
      const finalMediaType = isEmojiType ? 'emoji' : selectedMediaType;

      const baseDoc = {
        userId: user.uid,
        username: user.username,
        emoji: newPostEmoji,
        createdAt: Date.now(),
        mediaUrl: selectedMediaFile || null,
        mediaType: finalMediaType,
        filter: filter || null,
        musicUrl: selectedSongUrl || null,
        musicTitle: selectedSongTitle || null,
        textOverlay: textOverlay || null,
        overlayColor: overlayColor || null,
        overlaySize: overlaySize || null,
        brightness: brightness,
        contrast: contrast,
        saturation: saturation,
        rotation: rotation,
        zoom: zoom,
      };

      if (pubType === 'post') {
        const newPost = {
          ...baseDoc,
          name: `${user.firstName} ${user.lastName}`,
          likes: [],
          caption: newPostCaption.trim(),
          comments: [],
          commentsCount: 0,
          timeLabel: "AGORA MESMO"
        };
        await addDoc(collection(db, 'posts'), newPost);
        
        // Atualizar contador no perfil do usuário
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          postsCount: (user.postsCount || 0) + 1
        });
        showToast("📸 Publicação enviada para o Feed com sucesso!");

      } else if (pubType === 'story') {
        const newStory = {
          ...baseDoc,
          seenBy: []
        };
        await addDoc(collection(db, 'stories'), newStory);
        showToast("✨ Novo Story publicado com sucesso!");

      } else if (pubType === 'reel') {
        const newReel = {
          ...baseDoc,
          caption: newPostCaption.trim(),
          likes: [],
          comments: [],
          commentsCount: 0
        };
        await addDoc(collection(db, 'reels'), newReel);
        showToast("🎬 Novo Reel de vídeo/foto publicado com sucesso!");
        setActiveTab('reels'); // focar na aba dos reels
      }

      // Resetar states do editor
      setNewPostCaption('');
      setSelectedMediaFile('');
      setSelectedMediaType('emoji');
      setFilter('');
      setTextOverlay('');
      setOverlayColor('#ffffff');
      setOverlaySize('text-lg');
      setSelectedSongUrl('');
      setSelectedSongTitle('');
      setPubType('post');
      setBrightness(100);
      setContrast(100);
      setSaturation(100);
      setRotation(0);
      setZoom(100);
      setIsCreatingPost(false);

    } catch (err) {
      console.error("Erro ao sincronizar publicação no Firestore: ", err);
      showToast("❌ Erro ao enviar publicação.");
    } finally {
      setSubmittingPost(false);
    }
  }

  // Adiciona story por clique rápido
  async function handleQuickCreateStory() {
    if (!user) return;
    const randomEmoji = emojisList[Math.floor(Math.random() * emojisList.length)];
    try {
      const newStory = {
        userId: user.uid,
        username: user.username,
        emoji: randomEmoji,
        seenBy: [],
        createdAt: Date.now(),
        mediaType: 'emoji' as const,
        mediaUrl: null,
        filter: null,
        musicUrl: null,
        musicTitle: null,
        textOverlay: "Passando para dar um oi! 👋",
        overlayColor: "#ffffff",
        overlaySize: "text-lg"
      };

      await addDoc(collection(db, 'stories'), newStory);
      showToast(`✨ Story rápido criado com o emoji ${randomEmoji}! Para criar com fotos/vídeos e música, clique em ➕ no topo!`);
    } catch (err) {
      console.error(err);
    }
  }

  // Curtir Reel
  async function toggleReelLike(reel: Reel) {
    if (!user) {
      showToast("Por favor, faça login para curtir.");
      return;
    }
    const reelRef = doc(db, 'reels', reel.id);
    const hasLiked = reel.likes?.includes(user.uid) || false;

    try {
      if (hasLiked) {
        await updateDoc(reelRef, {
          likes: arrayRemove(user.uid)
        });
        showToast("Você descurtiu este Reel.");
      } else {
        await updateDoc(reelRef, {
          likes: arrayUnion(user.uid)
        });
        showToast("Você curtiu este Reel! 🔥");
      }
    } catch (err) {
      console.error("Erro ao curtir Reel: ", err);
    }
  }

  // Comentar Reel
  async function handleAddReelComment(reelId: string, text: string) {
    if (!user) {
      showToast("Por favor, identifique-se para comentar.");
      return;
    }
    if (!text.trim()) return;

    const reelRef = doc(db, 'reels', reelId);
    const reelObj = reels.find(r => r.id === reelId);
    if (!reelObj) return;

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      username: user.username,
      text: text.trim(),
      createdAt: Date.now()
    };

    try {
      await updateDoc(reelRef, {
        comments: arrayUnion(newComment),
        commentsCount: (reelObj.commentsCount || 0) + 1
      });
      setReelCommentInputs(prev => ({ ...prev, [reelId]: '' }));
      showToast("Comentário publicado no Reel! 💬");
    } catch (err) {
      console.error("Erro ao comentar Reel: ", err);
    }
  }

  // Filtra posts baseado em busca por username ou legenda
  const filteredPosts = posts.filter(post => {
    const q = searchQuery.toLowerCase();
    return post.username.toLowerCase().includes(q) || 
           post.caption.toLowerCase().includes(q) ||
           (post.name && post.name.toLowerCase().includes(q));
  });

  return (
    <div className="bg-[#FAFAFA] min-h-screen pb-12 font-['Inter']">
      
      {/* NAVIGATION BAR */}
      <nav className="fixed top-0 left-0 right-0 h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-5 md:px-[10%] z-50">
        <div 
          onClick={() => onNavigate('feed')}
          className="font-['Space_Grotesk'] tracking-tight font-bold text-2xl cursor-pointer text-black"
        >
          JPvano
        </div>

        {/* SEARCH */}
        <div className="hidden sm:flex items-center gap-2 bg-[#EFEFEF] rounded-lg px-3 py-1.5 w-[240px]">
          <span className="text-gray-400 text-sm">🔍</span>
          <input 
            type="text" 
            placeholder="Pesquisar publicações..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border-none bg-transparent text-sm outline-none w-full text-gray-700 font-normal"
          />
        </div>

        {/* ICONS */}
        <div className="flex items-center gap-5 text-xl cursor-pointer text-gray-700">
          <span title="Página Inicial" onClick={() => { setSearchQuery(''); onNavigate('feed'); }} className="hover:opacity-60">🏠</span>
          <span title="Nova Publicação" onClick={() => setIsCreatingPost(true)} className="hover:opacity-60 text-2xl text-black font-bold">➕</span>
          <span title="Mensagens & Ligações Direct" onClick={() => { if (onOpenMessenger) onOpenMessenger(null); }} className="hover:opacity-60 relative">💬</span>
          <span title="Notificações" onClick={() => showToast("❤️ Suas interações do Firestore estão sincronizadas offline.")} className="hover:opacity-60">❤️</span>
          
          {user ? (
            <div 
              title="Meu Perfil" 
              onClick={() => { onSelectUserProps(user.username); onNavigate('profile'); }}
              className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white border-2 border-white shadow-sm overflow-hidden"
            >
              {user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('http')) ? (
                <img 
                  src={user.avatar} 
                  alt={user.firstName} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xs font-bold">{user.avatar || user.firstName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
          ) : (
            <button 
              onClick={() => onNavigate('login')}
              className="text-xs font-semibold px-3 py-1.5 bg-[#E1306C] text-white rounded-lg hover:bg-[#C13584]"
            >
              Entrar
            </button>
          )}

          {user && ['superadmin', 'admin', 'moderator'].includes(user.role) && (
            <span 
              title="Painel Admin" 
              onClick={() => onNavigate('admin')}
              className="text-sm bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-full animate-pulse border border-purple-300"
            >
              🛡️ Admin
            </span>
          )}
        </div>
      </nav>

      {/* OFFLINE STATUS HEADER OVERLAY */}
      <div className="pt-[60px]">
        {isOnline ? (
          <div className="bg-emerald-50 border-b border-emerald-100 py-1.5 text-center text-xs text-emerald-700 font-medium flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Banco de dados e sincronização em tempo real Firebase ativa
          </div>
        ) : (
          <div className="bg-amber-50 border-b border-amber-200 py-2.5 text-center text-xs text-amber-800 font-semibold flex items-center justify-center gap-2">
            <span>🔌</span>
            Modo Offline Ativado · As alterações serão sincronizadas assim que houver conexão.
          </div>
        )}
      </div>

      <div className="max-w-[960px] mx-auto px-4 mt-4 flex justify-center gap-7">
        
        {/* FEED BODY */}
        <div className="w-full max-w-[470px]">
          
          {/* STORIES BAR */}
          <div className="border border-gray-200 rounded-xl bg-white p-4 mb-5 flex gap-4 overflow-x-auto scrollbar-none shadow-sm">
            {user && (
              <div 
                className="flex flex-col items-center gap-1 cursor-pointer flex-shrink-0" 
                onClick={() => { setPubType('story'); setIsCreatingPost(true); }}
              >
                <div className="w-[66px] h-[66px] rounded-full p-[3px] bg-gray-200 hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full border-3 border-white bg-gray-100 flex items-center justify-center text-xl font-bold text-gray-500 shadow-inner">
                    ➕
                  </div>
                </div>
                <span className="text-[11px] text-gray-600 font-medium">Novo Story</span>
              </div>
            )}

            {stories.map((st, idx) => (
              <div 
                key={st.id} 
                onClick={() => { setActiveStoryIndex(idx); }}
                className="flex flex-col items-center gap-1 cursor-pointer flex-shrink-0"
              >
                <div className="w-[66px] h-[66px] rounded-full p-[3px] bg-gradient-to-tr from-[#f1001d] via-[#f134c4] to-[#fec107] hover:scale-105 transition-transform duration-200">
                  <div className="w-full h-full rounded-full border-3 border-white bg-slate-50 flex items-center justify-center overflow-hidden">
                    {st.mediaUrl ? (
                      st.mediaType === 'video' ? (
                        <video src={st.mediaUrl} className="w-full h-full object-cover" muted style={getMediaStyle(st)} />
                      ) : (
                        <img src={st.mediaUrl} className="w-full h-full object-cover" style={getMediaStyle(st)} />
                      )
                    ) : (
                      <span className="text-2xl shadow-sm">{st.emoji || "✨"}</span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-gray-700 max-w-[66px] truncate text-center">@{st.username}</span>
              </div>
            ))}

            {stories.length === 0 && (
              <div className="text-gray-400 text-xs text-center py-4 w-full">Nenhum story sincronizado. Comece você mesmo!</div>
            )}
          </div>

          {/* ABA / SELEÇÃO DE CRONOLOGIA (POSTS vs REELS) */}
          <div className="flex border border-gray-200 bg-white mb-5 rounded-2xl shadow-sm p-1 gap-1.5 overflow-hidden">
            <button 
              onClick={() => setActiveTab('posts')}
              className={`flex-1 py-3 text-xs font-bold rounded-xl uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'posts' ? 'bg-black text-white shadow-md' : 'text-gray-550 hover:bg-gray-105'}`}
            >
              📸 Publicações ({filteredPosts.length})
            </button>
            <button 
              onClick={() => setActiveTab('reels')}
              className={`flex-1 py-3 text-xs font-bold rounded-xl uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'reels' ? 'bg-black text-white shadow-md' : 'text-gray-550 hover:bg-gray-105'}`}
            >
              🎬 Reels ({reels.length})
            </button>
          </div>

          {activeTab === 'posts' ? (
            /* LIST OF STANDARD POSTS */
            <div className="flex flex-col gap-6">
              {filteredPosts.map(post => {
                const hasLiked = user ? post.likes.includes(user.uid) : false;
                
                return (
                  <div key={post.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    
                    {/* POST USER HEADER */}
                    <div className="flex items-center p-4 gap-3 bg-white border-b border-gray-50">
                      <div 
                        onClick={() => { onSelectUserProps(post.username); onNavigate('profile'); }}
                        className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold text-sm cursor-pointer shadow-sm overflow-hidden"
                      >
                        {post.emoji}
                      </div>
                      <div className="flex flex-col">
                        <strong 
                          onClick={() => { onSelectUserProps(post.username); onNavigate('profile'); }}
                          className="text-sm font-semibold text-gray-800 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          @{post.username}
                          {post.isFeatured && <span className="text-xs text-[#1DA1F2]" title="Verificado">✅</span>}
                        </strong>
                        <span className="text-xs text-gray-400 font-medium">{post.name}</span>
                      </div>
                      
                      <div className="ml-auto flex items-center gap-2">
                        {user && (post.userId === user.uid || ['superadmin', 'admin'].includes(user.role)) && (
                          <button 
                            onClick={() => handleDeletePost(post)}
                            className="text-gray-300 hover:text-red-500 font-bold p-1 cursor-pointer transition-colors"
                            title="Deletar Publicação"
                          >
                            🗑️
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            if (confirm(`Denunciar esta publicação por spam ou discurso de ódio?`)) {
                              try {
                                await addDoc(collection(db, "reports"), {
                                  targetId: post.id,
                                  title: `Post de @${post.username}`,
                                  subtitle: `Denunciado por ${user?.email || "Anônimo"}`,
                                  type: "Ódio",
                                  status: "pendente",
                                  count: 1
                                });
                                showToast("🚩 Post denunciado com sucesso. Sincronizado com os logs administrativos.");
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }}
                          className="text-gray-300 hover:text-red-500 font-bold p-1 cursor-pointer"
                          title="Denunciar Post"
                        >
                          🚩
                        </button>
                      </div>
                    </div>

                    {/* POST CONTENT/IMAGE AREA WITH MULTIMEDIA AND FILTERS */}
                    <div className="w-full aspect-square bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center select-none text-8xl shadow-inner relative overflow-hidden">
                      {post.mediaUrl ? (
                        post.mediaType === 'video' ? (
                          <video 
                            src={post.mediaUrl} 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                            className="w-full h-full object-cover" 
                            style={getMediaStyle(post)}
                          />
                        ) : (
                          <img 
                            src={post.mediaUrl} 
                            className="w-full h-full object-cover" 
                            style={getMediaStyle(post)}
                          />
                        )
                      ) : (
                        <span className="z-10 drop-shadow-[0_8px_20px_rgba(0,0,0,0.15)]">{post.emoji}</span>
                      )}

                      {/* Floating Text Sticker Overlay */}
                      {post.textOverlay && (
                        <div 
                          className={`absolute p-2 rounded max-w-[80%] text-center break-words font-semibold pointer-events-none drop-shadow-md z-10 ${post.overlaySize || 'text-md'}`} 
                          style={{ color: post.overlayColor || '#ffffff', backgroundColor: 'rgba(0,0,0,0.4)' }}
                        >
                          {post.textOverlay}
                        </div>
                      )}

                      {/* Music Soundtrack Tag & Audio Playing */}
                      {post.musicTitle && (
                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white flex items-center gap-1 z-10 font-medium">
                          <span>🎵</span> {post.musicTitle}
                          <audio src={post.musicUrl} autoPlay loop muted={isAudioMuted} className="hidden" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/5 flex items-end p-4 pointer-events-none">
                        <span className="text-white/65 text-[10px] font-mono">ID: {post.id}</span>
                      </div>
                    </div>

                    {/* POST ACTIONS BAR */}
                    <div className="flex items-center gap-4 px-4 pt-3 pb-1 text-2xl font-light">
                      <span 
                        onClick={() => toggleLike(post)}
                        className={`cursor-pointer select-none transition-transform active:scale-130 ${hasLiked ? 'text-red-500 fill-current' : 'text-gray-700 hover:opacity-70'}`}
                      >
                        {hasLiked ? '❤️' : '🤍'}
                      </span>
                      <span 
                        onClick={() => {
                          const inputEl = document.getElementById(`reply-${post.id}`);
                          if (inputEl) inputEl.focus();
                        }}
                        className="cursor-pointer hover:opacity-75"
                      >
                        💬
                      </span>
                      <span 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                          showToast("Link copiado para a área de transferência! 🔗");
                        }}
                        className="cursor-pointer hover:opacity-75 text-xl"
                        title="Copiar Link"
                      >
                        ↗️
                      </span>
                      {post.musicUrl && (
                        <span 
                          onClick={() => setIsAudioMuted(!isAudioMuted)} 
                          className="cursor-pointer text-base ml-2 bg-gray-150 p-1.5 rounded-full hover:bg-gray-200" 
                          title="Alternar Som do Post"
                        >
                          {isAudioMuted ? '🔇' : '🔊'}
                        </span>
                      )}
                      <span 
                        onClick={() => showToast("Guardado na sua coleção! 🔖")}
                        className="ml-auto cursor-pointer text-xl hover:opacity-75"
                      >
                        🔖
                      </span>
                    </div>

                    {/* LIKES COUNT */}
                    <div className="px-4 py-1 text-sm font-semibold text-gray-800">
                      {(post.likes?.length || 0).toLocaleString('pt-BR')} curtidas
                    </div>

                    {/* CAPTION */}
                    <div className="px-4 py-1 text-sm text-gray-700 leading-relaxed font-normal">
                      <strong className="font-semibold text-gray-900 mr-1.5">@{post.username}</strong>
                      {post.caption}
                    </div>

                    {/* REPLIES / COMMENTS */}
                    <div className="px-4 py-2 border-t border-gray-50 bg-slate-50/50">
                      {post.comments && post.comments.length > 0 ? (
                        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                          {post.comments.map((comm) => (
                            <div key={comm.id} className="text-xs text-gray-700 font-normal">
                              <strong className="font-semibold text-gray-900 mr-1">@{comm.username}</strong>
                              {comm.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Nenhum comentário. Seja o primeiro a comentar!</p>
                      )}
                    </div>

                    {/* DATE TIME */}
                    <div className="px-4 py-2.5 text-[10px] text-gray-400 font-mono tracking-widest uppercase">
                      {post.timeLabel || "POSTADO RECENTEMENTE"}
                    </div>

                    {/* COMMENT INPUT */}
                    <div className="flex items-center px-4 py-3 border-t border-gray-100 gap-3 bg-white">
                      <input 
                        type="text" 
                        id={`reply-${post.id}`}
                        placeholder="Adicionar um comentário..." 
                        value={commentInputs[post.id] || ''}
                        onChange={e => {
                          const text = e.target.value;
                          setCommentInputs(prev => ({ ...prev, [post.id]: text }));
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleAddComment(post.id, commentInputs[post.id]);
                          }
                        }}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 font-normal placeholder-gray-400"
                      />
                      <button 
                        onClick={() => handleAddComment(post.id, commentInputs[post.id])}
                        className="text-black hover:text-zinc-700 text-sm font-semibold bg-transparent border-none cursor-pointer disabled:opacity-50"
                        disabled={!commentInputs[post.id]?.trim()}
                      >
                        Publicar
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredPosts.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
                  Nenhuma publicação encontrada para o termo digitado.
                </div>
              )}
            </div>
          ) : (
            /* LIST OF REELS SCREEN */
            <div className="flex flex-col gap-8 w-full">
              {reels.map((reel) => {
                const isLikedByMe = user ? reel.likes?.includes(user.uid) : false;
                
                return (
                  <div 
                    key={reel.id} 
                    className="w-full max-w-[420px] aspect-[9/16] bg-black rounded-3xl relative shadow-2xl mx-auto overflow-hidden border border-gray-250 flex flex-col justify-end"
                  >
                    {/* Background audio track playing in sync */}
                    {reel.musicUrl && (
                      <audio src={reel.musicUrl} autoPlay loop muted={isAudioMuted} className="hidden" />
                    )}

                    {/* Toggle Audio Status badge overlay */}
                    <button 
                      type="button"
                      onClick={() => setIsAudioMuted(!isAudioMuted)}
                      className="absolute top-4 right-4 bg-black/60 hover:bg-black p-2.5 rounded-full text-white text-xs z-20 font-bold transition-all shadow border border-white/10"
                    >
                      {isAudioMuted ? '🔇 Mudo' : '🔊 Som'}
                    </button>

                    {/* Deletar Reel button overlay */}
                    {user && (reel.userId === user.uid || ['superadmin', 'admin'].includes(user.role)) && (
                      <button 
                        type="button"
                        onClick={() => handleDeleteReel(reel.id)}
                        className="absolute top-4 left-4 bg-black/60 hover:bg-red-600 p-2.5 rounded-full text-white text-xs z-20 font-bold transition-all shadow border border-white/10 flex items-center gap-1 cursor-pointer"
                        title="Deletar Reel"
                      >
                        🗑️ Deletar
                      </button>
                    )}

                    {/* REEL VISUAL ELEMENT */}
                    <div className="absolute inset-0 z-0 flex items-center justify-center bg-zinc-950 pointer-events-none">
                      {reel.mediaUrl ? (
                        reel.mediaType === 'video' ? (
                          <video 
                            src={reel.mediaUrl} 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                            className="w-full h-full object-cover" 
                            style={getMediaStyle(reel)}
                          />
                        ) : (
                          <img 
                            src={reel.mediaUrl} 
                            className="w-full h-full object-cover" 
                            style={getMediaStyle(reel)}
                          />
                        )
                      ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center w-full h-full bg-gradient-to-tr from-indigo-900 via-purple-900 to-rose-900">
                          <span className="text-7xl animate-bounce mb-3">{reel.emoji || '🎬'}</span>
                          <span className="text-[10px] text-white/50 tracking-wider">JPVANO REELS</span>
                        </div>
                      )}

                      {/* Text Overlay Sticker Sticker */}
                      {reel.textOverlay && (
                        <div 
                          className={`absolute p-2.5 rounded max-w-[80%] text-center break-words font-semibold drop-shadow-lg z-10 ${reel.overlaySize || 'text-lg'}`} 
                          style={{ color: reel.overlayColor || '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)' }}
                        >
                          {reel.textOverlay}
                        </div>
                      )}
                    </div>

                    {/* GLASS CONTAINER INFORMATION CAPTION OVERLAY */}
                    <div className="absolute bottom-0 left-0 right-14 p-4 pb-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white z-10 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/25 flex items-center justify-center text-sm shadow-inner">
                          {reel.emoji || '🎬'}
                        </div>
                        <strong className="text-sm font-bold text-white shadow-sm truncate">@{reel.username}</strong>
                      </div>
                      <p className="text-xs text-white/95 leading-relaxed font-normal shadow-sm pr-2 text-left">{reel.caption}</p>
                      
                      {reel.musicTitle && (
                        <div className="flex items-center gap-1 text-purple-200 text-xs font-semibold mt-1">
                          <span className="animate-pulse">🎵</span>
                          <span className="truncate bg-purple-900/50 border border-purple-500/25 px-2 py-0.5 rounded text-[10px]">
                            {reel.musicTitle}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* RIGHT FIXED SOCIAL SIDERAIL CONTROLS */}
                    <div className="absolute bottom-6 right-2 flex flex-col items-center gap-4 z-10">
                      
                      {/* LIKES CONTROLLER */}
                      <div className="flex flex-col items-center">
                        <button 
                          onClick={() => toggleReelLike(reel)}
                          className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center text-lg hover:scale-110 active:scale-90 transition-transform shadow cursor-pointer"
                        >
                          {isLikedByMe ? '❤️' : '🤍'}
                        </button>
                        <span className="text-[10px] text-white font-extrabold shadow mt-0.5">{reel.likes?.length || 0}</span>
                      </div>

                      {/* COMMENTS DRAWER CONTROLLER */}
                      <div className="flex flex-col items-center">
                        <button 
                          onClick={() => setActiveReelCommentsId(activeReelCommentsId === reel.id ? null : reel.id)}
                          className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center text-lg hover:scale-110 active:scale-90 transition-transform shadow cursor-pointer"
                        >
                          💬
                        </button>
                        <span className="text-[10px] text-white font-extrabold shadow mt-0.5">{reel.commentsCount || 0}</span>
                      </div>

                      {/* SPINNING VINYL MEDIA DISC */}
                      <div className="w-9 h-9 rounded-full bg-zinc-950 border-2 border-white/40 flex items-center justify-center shadow-lg animate-spin-slow">
                        💿
                      </div>
                    </div>

                    {/* INNER REEL COMMENTS SLIDING DRAWER PANEL */}
                    {activeReelCommentsId === reel.id && (
                      <div className="absolute inset-x-0 bottom-0 bg-white text-gray-800 rounded-t-3xl z-35 p-4 border-t border-gray-150 max-h-[60%] flex flex-col shadow-2xl animate-fade-in">
                        <div className="flex justify-between items-center mb-3 pb-1 border-b border-gray-50">
                          <strong className="text-xs font-bold text-gray-800 uppercase tracking-wider block">💬 Comentários ({reel.commentsCount || 0})</strong>
                          <button 
                            onClick={() => setActiveReelCommentsId(null)} 
                            className="text-gray-400 hover:text-black font-semibold text-xs py-0.5 px-2 bg-gray-50/50 rounded-lg"
                          >
                            Fechar
                          </button>
                        </div>

                        {/* COMMENTS CONTENT LIST */}
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5 mb-3">
                          {reel.comments && reel.comments.length > 0 ? (
                            reel.comments.map((c) => (
                              <div key={c.id} className="text-xs bg-gray-50/40 p-2 rounded-xl text-left border border-gray-100">
                                <span className="font-bold text-gray-900">@{c.username}</span>
                                <p className="text-gray-700 mt-0.5">{c.text}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-gray-400 text-center py-6">Nenhum comentário. Comece a conversa!</p>
                          )}
                        </div>

                        {/* INPUT BOX */}
                        <div className="flex gap-2 border-t border-gray-100 pt-3">
                          <input 
                            type="text" 
                            placeholder="Adicione uma resposta..." 
                            value={reelCommentInputs[reel.id] || ''}
                            onChange={e => setReelCommentInputs(prev => ({ ...prev, [reel.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleAddReelComment(reel.id, reelCommentInputs[reel.id]);
                              }
                            }}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:border-black bg-gray-50 focus:bg-white"
                          />
                          <button 
                            onClick={() => handleAddReelComment(reel.id, reelCommentInputs[reel.id])}
                            disabled={!reelCommentInputs[reel.id]?.trim()}
                            className="px-3 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
                          >
                            Enviar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {reels.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm">
                  🎬 Nenhum Reel carregado ainda. Faça o upload do primeiro!
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDEBAR SUGGESTIONS */}
        <aside className="hidden lg:block w-[300px] flex-shrink-0 pt-2 font-['Inter']">
          {user && (
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-white border-2 border-white shadow-sm overflow-hidden">
                {user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('http')) ? (
                  <img 
                    src={user.avatar} 
                    alt={user.firstName} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-lg font-bold">{user.avatar || user.firstName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex flex-col">
                <strong className="text-sm font-bold text-gray-800 flex items-center gap-1">
                  @{user.username} {['superadmin', 'admin'].includes(user.role) && <span className="text-xs">👑</span>}
                </strong>
                <span className="text-xs text-gray-400 font-medium">{user.firstName} {user.lastName}</span>
              </div>
              <button 
                onClick={async () => {
                  if (confirm("Deseja sair da sua conta no JPvano?")) {
                    try {
                      await auth.signOut();
                      onNavigate('login');
                    } catch (err) {
                      console.error("Erro ao deslogar:", err);
                    }
                  }
                }}
                className="ml-auto text-xs text-zinc-650 hover:text-red-500 font-extrabold bg-transparent border-none cursor-pointer flex items-center gap-1"
              >
                🚪 Sair
              </button>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sugestões para você</h4>
            <a href="#" onClick={e => { e.preventDefault(); showToast("Todas as sugestões estão disponíveis localmente!"); }} className="text-xs font-semibold text-gray-800 hover:underline">Ver tudo</a>
          </div>

          <div className="flex flex-col gap-3">
            {suggestions.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm">
                  {s.emoji || "👤"}
                </div>
                <div className="flex flex-col">
                  <strong className="text-xs font-semibold text-gray-800">@{s.user}</strong>
                  <span className="text-[11px] text-gray-400">{s.reason}</span>
                </div>
                <button 
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    const isFollowing = btn.textContent === 'Seguindo ✓';
                    btn.textContent = isFollowing ? 'Seguir' : 'Seguindo ✓';
                    btn.className = isFollowing 
                      ? "ml-auto text-xs font-bold text-black cursor-pointer bg-transparent border-none" 
                      : "ml-auto text-xs font-bold text-zinc-400 cursor-pointer bg-transparent border-none";
                    showToast(isFollowing ? `Deixou de seguir @${s.user}` : `Seguindo @${s.user} ✅`);
                  }}
                  className="ml-auto text-xs font-bold text-black cursor-pointer bg-transparent border-none"
                >
                  Seguir
                </button>
              </div>
            ))}
          </div>

          <div className="mt-8 text-[11px] text-gray-400 leading-relaxed">
            <div className="flex flex-wrap gap-2 mb-3">
              <a href="#" className="hover:underline">Sobre</a>
              <a href="#" className="hover:underline">Ajuda</a>
              <a href="#" className="hover:underline">Privacidade</a>
              <a href="#" className="hover:underline">Termos</a>
              <a href="#" className="hover:underline">Idioma</a>
            </div>
            <span>© 2026 JPVANO REDE SOCIAL <br /> Sincronização e Auth integrada no Firestore.</span>
          </div>
        </aside>
      </div>

      {/* OVERLAY/MODAL DE NOVA PUBLICAÇÃO UNIFICADA E MINI-EDITOR */}
      {isCreatingPost && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-[460px] p-6 shadow-2xl relative font-['Inter'] max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setIsCreatingPost(false);
                setSelectedMediaFile('');
                setSelectedMediaType('emoji');
                setFilter('');
                setTextOverlay('');
                setSelectedSongUrl('');
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-black font-extrabold text-xl cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>🎨</span> Estúdio de Criação
            </h2>
            <p className="text-xs text-gray-400 mb-4 font-normal">Crie fotos, vídeos, stories e reels com trilha sonora e filtros!</p>
            
            <form onSubmit={handleCreateUnifiedPublication} className="flex flex-col gap-4">
              
              {/* Escolha do canal de transmissão */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">Como deseja publicar?</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['post', 'story', 'reel'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPubType(type)}
                      className={`py-2 text-xs rounded-xl font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        pubType === type 
                          ? 'bg-black text-white shadow-md scale-102' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      <span>{type === 'post' ? '📸 Post Feed' : type === 'story' ? '✨ Story' : '🎬 Reel'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Uploader de mídia local */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">Carregar imagem ou vídeo (Opcional)</label>
                {!selectedMediaFile ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:bg-gray-50 transition-all cursor-pointer relative group">
                    <input 
                      type="file" 
                      accept="image/*,video/*" 
                      onChange={handleMediaFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📁</div>
                    <span className="text-xs font-semibold text-gray-700 block">Arraste ou clique para carregar imagem/vídeo</span>
                    <span className="text-[10px] text-gray-400 mt-1 block">Sem limite de tamanho · Imagens ou vídeos</span>
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden shadow-md aspect-video w-full bg-black flex items-center justify-center border border-gray-150">
                    {selectedMediaType === 'video' ? (
                      <video 
                        src={selectedMediaFile} 
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        className="w-full h-full object-cover" 
                        style={getPreviewStyle()}
                      />
                    ) : (
                      <img 
                        src={selectedMediaFile} 
                        className="w-full h-full object-cover" 
                        style={getPreviewStyle()}
                      />
                    )}

                    {/* Sticker flutuante no Canvas Draft */}
                    {textOverlay && (
                      <div 
                        className={`absolute p-2.5 rounded max-w-[80%] text-center break-words font-semibold pointer-events-none drop-shadow-md z-15 ${overlaySize}`} 
                        style={{ color: overlayColor, backgroundColor: 'rgba(0,0,0,0.45)' }}
                      >
                        {textOverlay}
                      </div>
                    )}

                    <button 
                      type="button" 
                      onClick={() => { setSelectedMediaFile(''); setSelectedMediaType('emoji'); }}
                      className="absolute top-2 right-2 bg-black/75 hover:bg-black text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold transition-all shadow"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Preview Ativo
                    </span>
                  </div>
                )}
                {fileError && <p className="text-[11px] text-red-500 font-semibold mt-1">{fileError}</p>}
              </div>

              {/* Seletor de emojis - fallback ou decalque */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">Emoji de Identificação</label>
                <div className="grid grid-cols-8 gap-1.5 bg-gray-50 p-2.5 rounded-2xl max-h-[85px] overflow-y-auto border border-gray-150">
                  {emojisList.map((emo, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      onClick={() => setNewPostEmoji(emo)}
                      className={`text-xl p-1 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer text-center ${newPostEmoji === emo ? 'bg-white shadow border border-gray-300' : 'border border-transparent'}`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtros criativos de imagem/vídeo */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>🪄</span> Filtros do Mini Editor
                </label>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {['none', 'grayscale', 'sepia', 'vintage', 'cool', 'neon'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f === 'none' ? '' : f)}
                      className={`px-3 py-1.5 text-xs rounded-full border-1.5 capitalize whitespace-nowrap cursor-pointer transition-colors ${
                        (f === 'none' && !filter) || filter === f 
                          ? 'bg-black text-white border-black' 
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Controles do Mini Editor Avançado (apenas visíveis se houver mídia carregada) */}
              {selectedMediaFile && (
                <div className="bg-gray-50 border border-gray-150 rounded-2xl p-4 flex flex-col gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-700 mb-1 block">🛠️ Mini Editor de Vídeos e Fotos</span>
                  
                  {/* Slider Brilho */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-gray-600">
                      <span>☀️ Brilho</span>
                      <span>{brightness}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={brightness} 
                      onChange={e => setBrightness(Number(e.target.value))}
                      className="w-full accent-black h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Slider Contraste */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-gray-600">
                      <span>🌓 Contraste</span>
                      <span>{contrast}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={contrast} 
                      onChange={e => setContrast(Number(e.target.value))}
                      className="w-full accent-black h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Slider Saturação */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-gray-600">
                      <span>🌈 Saturação</span>
                      <span>{saturation}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={saturation} 
                      onChange={e => setSaturation(Number(e.target.value))}
                      className="w-full accent-black h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Slider Rotação e Zoom */}
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-gray-600">
                        <span>🔄 Rotação</span>
                        <span>{rotation}°</span>
                      </div>
                      <select 
                        value={rotation} 
                        onChange={e => setRotation(Number(e.target.value))}
                        className="py-1 px-2 border border-gray-200 rounded-lg text-[11px] bg-white text-gray-700 font-semibold outline-none focus:border-black cursor-pointer"
                      >
                        <option value="0">0° (Normal)</option>
                        <option value="90">90°</option>
                        <option value="180">180°</option>
                        <option value="270">270°</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-gray-600">
                        <span>🔍 Zoom</span>
                        <span>{zoom}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="100" 
                        max="150" 
                        value={zoom} 
                        onChange={e => setZoom(Number(e.target.value))}
                        className="w-full accent-black h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Customização Trilha Sonora */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>🎵</span> Trilha Sonora do Editor (Enviada pelos Admins)
                </label>
                <select 
                  value={selectedSongUrl}
                  onChange={(e) => {
                    const found = songs.find(s => s.url === e.target.value);
                    if (found) {
                      setSelectedSongUrl(found.url);
                      setSelectedSongTitle(`${found.title} - ${found.artist}`);
                      showToast(`Sincronizando áudio: "${found.title}"`);
                    } else {
                      setSelectedSongUrl('');
                      setSelectedSongTitle('');
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs outline-none bg-gray-50 focus:bg-white"
                >
                  <option value="">Sem música de fundo (Silencioso)</option>
                  {songs.map((song) => (
                    <option key={song.id} value={song.url}>
                      🎵 {song.title} ({song.artist})
                    </option>
                  ))}
                </select>
                {selectedSongUrl && (
                  <div className="mt-1.5 p-2 bg-purple-50 text-purple-800 rounded-xl">
                    <span className="text-[10px] font-bold block mb-1">🎧 Executando amostra em loop:</span>
                    <audio src={selectedSongUrl} autoPlay loop controls className="w-full h-8 text-xs" />
                  </div>
                )}
              </div>

              {/* Sticker com Texto Overlay */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">Texto Flutuante (Sticker Overlay)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Ex: Sextou! 🌟" 
                    value={textOverlay}
                    onChange={e => setTextOverlay(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-250 rounded-xl text-xs outline-none focus:border-black bg-gray-50 focus:bg-white"
                  />
                  <input 
                    type="color" 
                    value={overlayColor}
                    onChange={e => setOverlayColor(e.target.value)}
                    className="w-10 h-9 border border-gray-250 rounded-xl cursor-pointer p-1 bg-gray-50"
                    title="Cor da fonte"
                  />
                  <select 
                    value={overlaySize}
                    onChange={e => setOverlaySize(e.target.value)}
                    className="px-2 py-1 border border-gray-250 rounded-xl text-xs cursor-pointer bg-gray-50 font-medium"
                  >
                    <option value="text-xs">Pequeno</option>
                    <option value="text-sm">Médio</option>
                    <option value="text-lg">Grande</option>
                    <option value="text-2xl font-black">Super</option>
                  </select>
                </div>
              </div>

              {/* Legenda de post (Post/Reel) */}
              {(pubType === 'post' || pubType === 'reel') && (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">Legenda / Caption (Requerido)</label>
                  <textarea 
                    rows={3}
                    placeholder="Escreva algo sobre este conteúdo..."
                    value={newPostCaption}
                    onChange={e => setNewPostCaption(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-250 rounded-xl text-xs focus:border-black bg-gray-50 focus:bg-white outline-none transition-all resize-none"
                  />
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsCreatingPost(false);
                    setSelectedMediaFile('');
                    setSelectedMediaType('emoji');
                    setFilter('');
                    setTextOverlay('');
                    setSelectedSongUrl('');
                  }}
                  className="flex-1 py-3 border border-gray-250 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Descartar
                </button>
                <button 
                  type="submit" 
                  disabled={submittingPost}
                  className="flex-1 py-3 bg-black hover:bg-zinc-900 rounded-xl text-white font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 shadow-md shadow-black/10"
                >
                  {submittingPost ? 'Processando...' : 'Publicar Agora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPRODUTOR EM ALTA FIDELIDADE / MODAL DE STORIES (SLIDESHOW AUTO-PLAY) */}
      {activeStoryIndex !== null && stories[activeStoryIndex] && (
        <div className="fixed inset-0 bg-neutral-950/95 z-55 flex items-center justify-center p-0 md:p-4 select-none backdrop-blur-md">
          
          {/* Loop audio playlist if story has custom track */}
          {stories[activeStoryIndex].musicUrl && (
            <audio src={stories[activeStoryIndex].musicUrl} autoPlay loop muted={isAudioMuted} className="hidden" />
          )}

          {/* CLOSE BOX SENSITIVE TRIGGER */}
          <button 
            onClick={() => setActiveStoryIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 font-extrabold text-2xl cursor-pointer z-50 p-2 bg-black/40 rounded-full"
            title="Fechar Visualizador"
          >
            ✕
          </button>

          {/* Mute switcher sound indicator */}
          {stories[activeStoryIndex].musicTitle && (
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="absolute top-4 right-16 text-white text-xs z-50 p-2 bg-black/40 rounded-full font-bold hover:bg-black/80"
            >
              {isAudioMuted ? '🔇 Mudo' : '🔊 Ouvir'}
            </button>
          )}

          {/* MAIN PLAYER PIPELINE */}
          <div className="w-full max-w-[420px] h-full md:h-[90vh] md:max-h-[740px] bg-zinc-900 md:rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-2xl border border-zinc-805">
            
            {/* PROGRESS BARS STACK */}
            <div className="absolute top-3 inset-x-0 px-3 flex gap-1 z-30">
              {stories.map((st, i) => (
                <div role="progressbar" className="h-1 bg-white/20 rounded-full flex-1 overflow-hidden" key={st.id || i}>
                  <div 
                    className="h-full bg-white transition-all duration-75" 
                    style={{ 
                      width: i === activeStoryIndex 
                        ? `${storyProgress}%` 
                        : (i < activeStoryIndex ? '100%' : '0%') 
                    }}
                  ></div>
                </div>
              ))}
            </div>

            {/* HEADER METADATA (BYPASS USER CREDENTIALS) */}
            <div className="absolute top-7 inset-x-0 px-4 flex items-center gap-2.5 z-30 bg-gradient-to-b from-black/60 to-transparent pt-2 pb-4">
              <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xl shadow">
                {stories[activeStoryIndex].emoji || '✨'}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-white text-sm font-bold shadow-sm">@{stories[activeStoryIndex].username}</span>
                <span className="text-white/60 text-[10px] font-medium shadow-sm">Postado Recentemente</span>
              </div>
              <div className="ml-auto flex items-center gap-2 z-40">
                {user && (stories[activeStoryIndex].userId === user.uid || ['superadmin', 'admin'].includes(user.role)) && (
                  <button 
                    onClick={() => handleDeleteStory(stories[activeStoryIndex].id)}
                    className="bg-black/45 hover:bg-red-600 text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-all border border-white/20 whitespace-nowrap"
                    title="Deletar Story"
                  >
                    🗑️ Deletar
                  </button>
                )}
                {stories[activeStoryIndex].musicTitle && (
                  <div className="bg-purple-600/80 backdrop-blur-md text-white font-bold text-[9px] uppercase px-2.5 py-1 rounded-full border border-purple-400/25 animate-pulse">
                    🎵 {stories[activeStoryIndex].musicTitle}
                  </div>
                )}
              </div>
            </div>

            {/* CENTRAL STORY MEDIA CONTAINER PANEL */}
            <div className="flex-1 w-full h-full flex items-center justify-center relative bg-black">
              {stories[activeStoryIndex].mediaUrl ? (
                stories[activeStoryIndex].mediaType === 'video' ? (
                  <video 
                    src={stories[activeStoryIndex].mediaUrl} 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover" 
                    style={getMediaStyle(stories[activeStoryIndex])}
                  />
                ) : (
                  <img 
                    src={stories[activeStoryIndex].mediaUrl} 
                    className="w-full h-full object-cover" 
                    style={getMediaStyle(stories[activeStoryIndex])}
                  />
                )
              ) : (
                /* Fallback stylized brand template bubble */
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#E1306C] via-[#C13584] to-[#fec107] p-8 text-center">
                  <span className="text-9xl filter drop-shadow-xl animate-bounce">{stories[activeStoryIndex].emoji || '✨'}</span>
                  <p className="text-white/60 text-[11px] tracking-widest font-mono uppercase mt-4">JPVANO STORY SLIDE</p>
                </div>
              )}

              {/* Story Overlay Sticker message text */}
              {stories[activeStoryIndex].textOverlay && (
                <div 
                  className={`absolute p-3 rounded-2xl max-w-[85%] text-center break-words font-extrabold z-10 drop-shadow-xl ${stories[activeStoryIndex].overlaySize || 'text-xl'}`} 
                  style={{ 
                    color: stories[activeStoryIndex].overlayColor || '#ffffff', 
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                  }}
                >
                  {stories[activeStoryIndex].textOverlay}
                </div>
              )}

              {/* PREVIOUS / NEXT SIDE-TAP CHEAT BUTTONS */}
              <div 
                onClick={() => {
                  if (activeStoryIndex > 0) {
                    setActiveStoryIndex(activeStoryIndex - 1);
                  }
                }}
                className="absolute left-0 inset-y-16 w-1/4 cursor-pointer z-20 flex items-center pl-3 text-white/10 hover:text-white/50 transition-colors"
                title="Voltar Story"
              >
                ◀
              </div>
              <div 
                onClick={() => {
                  if (activeStoryIndex < stories.length - 1) {
                    setActiveStoryIndex(activeStoryIndex + 1);
                  } else {
                    setActiveStoryIndex(null);
                  }
                }}
                className="absolute right-0 inset-y-16 w-1/4 cursor-pointer z-20 flex items-center justify-end pr-3 text-white/10 hover:text-white/50 transition-colors"
                title="Avançar Story"
              >
                ▶
              </div>
            </div>

            {/* MINI INTERACTION FOOTER BAR */}
            <div className="bg-black/80 backdrop-blur px-4 py-4 z-30 pb-6 border-t border-zinc-800 flex items-center gap-3">
              <input 
                type="text" 
                placeholder={`Responder a @${stories[activeStoryIndex].username}...`}
                className="flex-1 bg-zinc-900 border border-zinc-850 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-zinc-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    showToast(`✓ Resposta enviada para o direct de @${stories[activeStoryIndex].username}!`);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <button 
                onClick={() => {
                  showToast("Reação enviada! ❤️");
                }}
                className="text-xl hover:scale-125 hover:rotate-12 transition-transform cursor-pointer"
              >
                ❤️
              </button>
              <button 
                onClick={() => {
                  showToast("Reação enviada! 🔥");
                }}
                className="text-xl hover:scale-125 transition-transform cursor-pointer"
              >
                🔥
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
