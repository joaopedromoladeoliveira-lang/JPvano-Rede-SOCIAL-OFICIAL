import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  addDoc,
  auth
} from '../firebase';
import { UserProfile, ReportItem, ActivityLog, Song } from '../types';
import { seedInitialData } from '../seed';

interface AdminPanelProps {
  user: UserProfile | null;
  onNavigate: (view: string) => void;
  showToast: (msg: string) => void;
}

export default function AdminPanel({ user, onNavigate, showToast }: AdminPanelProps) {
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [logsList, setLogsList] = useState<ActivityLog[]>([]);
  const [songsList, setSongsList] = useState<Song[]>([]);

  // State para novas músicas
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [newSongFile, setNewSongFile] = useState<string>('');
  const [uploadingSong, setUploadingSong] = useState(false);

  // 1. Escuta todos os usuários no Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const uList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        uList.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsersList(uList);
    });

    return () => unsubscribe();
  }, []);

  // Escuta músicas do repositório em tempo real
  useEffect(() => {
    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sList: Song[] = [];
      snapshot.forEach((doc) => {
        sList.push({ id: doc.id, ...doc.data() } as Song);
      });
      setSongsList(sList);
    }, (error) => {
      console.error("Erro ao carregar banco de músicas:", error);
    });

    return () => unsubscribe();
  }, []);

  // 2. Escuta todas as denúncias/reports no Firestore em tempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'reports'), (snapshot) => {
      const rList: ReportItem[] = [];
      snapshot.forEach((doc) => {
        rList.push({ id: doc.id, ...doc.data() } as ReportItem);
      });
      setReportsList(rList);
    });

    return () => unsubscribe();
  }, []);

  // 3. Escuta todos os logs de atividade em tempo real
  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lList: ActivityLog[] = [];
      snapshot.forEach((doc) => {
        lList.push({ id: doc.id, ...doc.data() } as ActivityLog);
      });
      setLogsList(lList);
    });

    return () => unsubscribe();
  }, []);

  // Função helper para criar log administrativo no Firestore
  async function logAdminAction(text: string, status: 'success' | 'danger' | 'info' | 'warning') {
    try {
      const authorEmail = user?.email || "admin_demo@jpvano.com";
      const newLog: Omit<ActivityLog, 'id'> = {
        text,
        author: authorEmail,
        timeLabel: "agora mesmo",
        status,
        createdAt: Date.now()
      };
      await addDoc(collection(db, "logs"), newLog);
    } catch (err) {
      console.error("Erro ao registrar log adm: ", err);
    }
  }

  // Ação de Verificação / Selo
  async function handleVerify(u: UserProfile) {
    try {
      const userRef = doc(db, 'users', u.uid);
      const isVerifiedStatus = u.isVerified || u.role === 'verified';
      const newVerified = !isVerifiedStatus;
      let newRole = u.role;
      if (['user', 'verified'].includes(u.role)) {
        newRole = newVerified ? 'verified' : 'user';
      }
      await updateDoc(userRef, { 
        role: newRole,
        isVerified: newVerified
      });
      
      const logMsg = newVerified 
        ? `@${u.username} recebeu o selo verificado ✅`
        : `@${u.username} teve o selo verificado removido ❌`;
        
      await logAdminAction(logMsg, newVerified ? "success" : "warning");
      showToast(logMsg);
    } catch (err) {
      console.error(err);
      showToast("❌ Erro ao alterar verificação de usuário.");
    }
  }

  // Ação de Promoção a Admin
  async function handlePromote(u: UserProfile) {
    const targetEmailLower = u.email?.toLowerCase();
    if (targetEmailLower === 'joaopedromoladeoliveira@gmail.com' || targetEmailLower === 'jpvanoredesocial@gmail.com') {
      showToast("❌ Proteção Mestre: Não é permitido alterar as funções dos administradores fundadores!");
      return;
    }
    
    // Bloqueia se o alvo já for admin ou superadmin para que ninguém (inclusive outro admin) possa rebaixar
    if (u.role === 'superadmin' || u.role === 'admin') {
      showToast("❌ Proteção Ativa: Não é permitido remover privilégios de Administradores ou Super Admins!");
      return;
    }

    try {
      const userRef = doc(db, 'users', u.uid);
      const isCurrentlyAdmin = false; // O guard de retorno acima garante que não seja admin
      const newRole = 'admin';

      await updateDoc(userRef, { role: newRole });

      const logMsg = `@${u.username} promovido à Administrador 🛡️`;

      await logAdminAction(logMsg, "info");
      showToast(logMsg);
    } catch (err) {
      console.error(err);
    }
  }

  // Excluir / Deletar / Banir usuário
  async function handleBanUser(u: UserProfile) {
    const targetEmailLower = u.email?.toLowerCase();
    if (targetEmailLower === 'joaopedromoladeoliveira@gmail.com' || targetEmailLower === 'jpvanoredesocial@gmail.com') {
      showToast("❌ Proteção Mestre: Não é permitido banir os administradores fundadores!");
      return;
    }

    if (u.role === 'superadmin' || u.role === 'admin') {
      showToast("❌ Proteção Ativa: Não é permitido banir Administradores ou Super Admins!");
      return;
    }

    if (confirm(`Tem certeza que deseja banir o usuário @${u.username} permanentemente do JPvano?`)) {
      try {
        const userRef = doc(db, 'users', u.uid);
        const isBanned = u.status === 'banido';
        const newStatus = isBanned ? 'ativo' : 'banido';

        await updateDoc(userRef, { status: newStatus });

        const logMsg = isBanned
          ? `@${u.username} foi desbanido do sistema`
          : `@${u.username} foi banido permanentemente 🔨`;

        await logAdminAction(logMsg, isBanned ? "success" : "danger");
        showToast(logMsg);
      } catch (err) {
        console.error(err);
      }
    }
  }

  // Ação em denúncias: Remover Post
  async function handleRemoveReportedPost(report: ReportItem) {
    try {
      // Deleta o post do Firestore
      await deleteDoc(doc(db, 'posts', report.targetId));
      
      // Deleta a denúncia
      await deleteDoc(doc(db, 'reports', report.id));

      const logMsg = `Publicação denunciada (${report.title}) foi removida pelo administrador.`;
      await logAdminAction(logMsg, "danger");
      showToast("Publicação denunciada removida com sucesso! 🗑️");
    } catch (err) {
      console.error(err);
      showToast("Erro ao processar remoção. O post pode não existir.");
    }
  }

  // Ação em denúncias: Ignorar
  async function handleIgnoreReport(report: ReportItem) {
    try {
      await deleteDoc(doc(db, 'reports', report.id));
      showToast("Denúncia ignorada e arquivada.");
    } catch (err) {
      console.error(err);
    }
  }

  // Semear dados default
  async function handleTriggerSeeding() {
    await seedInitialData();
    showToast("✨ Semente de re-população semeada com sucesso no Firestore!");
  }

  // Enviar anúncio aos logs globais
  async function handleGlobalAnnouncement() {
    const text = prompt("Digite a mensagem do anúncio administrativo global:");
    if (text?.trim()) {
      await logAdminAction(`📢 [ANÚNCIO] ${text.trim()}`, "info");
      showToast("Anúncio enviado aos logs globais!");
    }
  }

  // Realiza o upload do arquivo de áudio e converte em base64
  function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewSongFile(event.target.result as string);
        showToast("✓ Arquivo de áudio carregado e convertido com sucesso!");
      }
    };
    reader.onerror = () => {
      showToast("❌ Erro ao ler o arquivo de áudio.");
    };
    reader.readAsDataURL(file);
  }

  // Salva no banco de músicas do Firestore
  async function handleAddSong(e: React.FormEvent) {
    e.preventDefault();
    if (!newSongTitle.trim() || !newSongArtist.trim()) {
      showToast("⚠️ Por favor insira o título da música e o nome do artista.");
      return;
    }
    if (!newSongFile) {
      showToast("⚠️ Por favor faça o upload de uma música em formato de áudio.");
      return;
    }

    setUploadingSong(true);
    try {
      await addDoc(collection(db, 'songs'), {
        title: newSongTitle.trim(),
        artist: newSongArtist.trim(),
        url: newSongFile,
        createdAt: Date.now()
      });

      await logAdminAction(`🎵 Nova faixa sincronizada: "${newSongTitle}" por ${newSongArtist}`, "success");
      showToast("🎉 Música adicionada ao editor com sucesso!");
      
      // Limpa os campos
      setNewSongTitle('');
      setNewSongArtist('');
      setNewSongFile('');
      // Limpar input de upload
      const fileInput = document.getElementById('audio-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err) {
      console.error(err);
      showToast("❌ Erro ao salvar faixa de música no Firestore.");
    } finally {
      setUploadingSong(false);
    }
  }

  // Deleta música
  async function handleDeleteSong(song: Song) {
    if (confirm(`Excluir a música "${song.title}" de todos os editores de publicação?`)) {
      try {
        await deleteDoc(doc(db, 'songs', song.id));
        await logAdminAction(`🗑️ Música "${song.title}" de ${song.artist} removida do repositório`, "warning");
        showToast("Música removida.");
      } catch (err) {
        console.error(err);
        showToast("Erro ao excluir música.");
      }
    }
  }

  const roleStyle: {[key: string]: string} = {
    superadmin: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    admin: 'bg-rose-100 text-rose-800 border border-rose-300',
    moderator: 'bg-blue-100 text-blue-800 border border-blue-300',
    verified: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    user: 'bg-gray-100 text-gray-800 border border-gray-200'
  };

  const roleName: {[key: string]: string} = {
    superadmin: '👑 Super Admin',
    admin: '🛡️ Admin',
    moderator: '⚡ Moderador',
    verified: '✅ Verificado',
    user: 'Usuário'
  };

  return (
    <div className="flex bg-[#F4F5F7] min-h-screen text-[#1A1A2E] font-['Inter'] relative">
      
      {/* SIDEBAR */}
      <aside className="w-[240px] bg-[#1A1A2E] min-h-screen text-white/90 p-5 flex flex-col fixed left-0 top-0 bottom-0 z-40">
        <div className="py-6 border-b border-white/5 mb-6 text-center">
          <span className="font-['Space_Grotesk'] tracking-tight font-bold text-2xl text-white block">JPvano</span>
          <small className="text-[10px] text-white/40 block tracking-widest uppercase mt-0.5">Admin Panel</small>
        </div>

        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <strong className="text-orange-400 block text-xs">👑 Super Admin</strong>
          <span className="text-[11px] text-white/60 select-all truncate block">{user?.email || "jpvanoredesocial@gmail.com"}</span>
        </div>

        <nav className="flex flex-col gap-1.5 flex-1 text-sm font-medium">
          <div className="text-[10px] text-white/30 uppercase tracking-widest pl-3 mb-2">PRINCIPAL</div>
          <button onClick={() => onNavigate('feed')} className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-all">
            <span>🏠</span> Voltar para o Feed
          </button>
          <button onClick={() => showToast("Sincronização em tempo real ativa.")} className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-white/10 bg-white/15 border-l-3 border-white/50 flex items-center gap-2 text-white">
            <span>📊</span> Dashboard Geral
          </button>
          <button onClick={handleGlobalAnnouncement} className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-all">
            <span>📢</span> Anúncio Global
          </button>
          <button onClick={handleTriggerSeeding} className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-all text-xs text-orange-200">
            <span>🔄</span> Repopular Dados Firestore
          </button>
          <button 
            onClick={async () => {
              if (confirm("Deseja realmente sair e desconectar sua conta?")) {
                try {
                  await auth.signOut();
                  onNavigate('login');
                } catch (err) {
                  console.error("Erro ao deslogar:", err);
                }
              }
            }}
            className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-red-500/20 text-red-300 flex items-center gap-2 transition-all font-bold mt-4 border border-red-500/30"
          >
            <span>🚪</span> Sair da Conta
          </button>
        </nav>

        <div className="border-t border-white/5 pt-4 text-center mt-auto text-xs text-white/40">
          Versão 2.4.0 (Offline Cache)
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="ml-[240px] flex-1 p-8">
        
        {/* TOPBAR */}
        <div className="flex items-center justify-between mb-8 bg-white p-5 rounded-2xl shadow-sm border border-gray-150">
          <div>
            <h1 className="text-2xl font-bold font-sans tracking-tight text-gray-800">Painel Administrativo</h1>
            <p className="text-xs text-gray-400 mt-1">Sincronização de regras com Firestore e persistência offline ativa.</p>
          </div>
          <div className="text-xs font-semibold px-4 py-2 bg-black text-white rounded-full">
            Sincronizado: {user?.email || "jpvanoredesocial@gmail.com"}
          </div>
        </div>

        {/* COUNTERS STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
            <span className="text-2xl bg-zinc-800/10 p-2.5 rounded-xl block w-fit mb-3">👥</span>
            <div className="text-2xl font-extrabold">{usersList.length}</div>
            <div className="text-xs text-gray-400 font-medium">Usuários Registrados</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
            <span className="text-2xl bg-emerald-500/10 p-2.5 rounded-xl block w-fit mb-3">✅</span>
            <div className="text-2xl font-extrabold">{usersList.filter(u => u.role === 'verified' || u.isVerified).length}</div>
            <div className="text-xs text-gray-400 font-medium">Contas Verificadas</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
            <span className="text-2xl bg-amber-500/10 p-2.5 rounded-xl block w-fit mb-3">🔨</span>
            <div className="text-2xl font-extrabold">{usersList.filter(u => u.status === 'banido').length}</div>
            <div className="text-xs text-gray-400 font-medium">Usuários Banidos</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
            <span className="text-2xl bg-rose-500/10 p-2.5 rounded-xl block w-fit mb-3">🚩</span>
            <div className="text-2xl font-extrabold text-rose-600">{reportsList.length}</div>
            <div className="text-xs text-gray-400 font-medium">Denúncias Pendentes</div>
          </div>
        </div>

        {/* MAIN PANELS DIVISION */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* USERS MANAGEMENT TABLE */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 xl:col-span-3 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-base">👥 Gerenciamento de Usuários (Firestore)</h3>
              <button 
                onClick={() => {
                  const nameStr = prompt("Nome do novo usuário fictício a registrar:");
                  if (nameStr) {
                    const clean = nameStr.toLowerCase().replace(/\s/g, '');
                    addDoc(collection(db, 'users'), {
                      firstName: nameStr,
                      lastName: 'Admin Test',
                      email: `${clean}@jpvano.com`,
                      username: clean,
                      role: 'user',
                      avatar: '👤',
                      status: 'ativo',
                      createdAt: Date.now()
                    });
                    showToast(`Usuário @${clean} semeado no Firestore!`);
                  }
                }}
                className="text-xs font-bold px-4 py-2 bg-black text-white rounded-xl hover:opacity-90 cursor-pointer"
              >
                + Adicionar Usuário
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="py-3.5 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider">Nome de Usuário</th>
                    <th className="py-3.5 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider">Privilégio (Role)</th>
                    <th className="py-3.5 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider">Status</th>
                    <th className="py-3.5 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider text-right">Controles Rápidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {usersList.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#E1306C]/10 text-[#E1306C] flex items-center justify-center font-bold text-base">
                            {u.avatar || u.firstName.slice(0, 1)}
                          </div>
                          <div>
                            <strong className="text-gray-800 text-sm block">@{u.username}</strong>
                            <small className="text-gray-400 text-xs block">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${roleStyle[u.role] || 'bg-gray-100'}`}>
                          {roleName[u.role] || u.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-bold ${u.status === 'banido' ? 'text-red-500' : 'text-emerald-500'}`}>
                          {u.status === 'banido' ? '🚫 BANIDO' : '✅ ATIVO'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleVerify(u)}
                            className="bg-sky-50 text-[#0d8bd9] border border-sky-200 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-sky-100 transition-colors cursor-pointer"
                          >
                            {(u.isVerified || u.role === 'verified') ? 'Remover Selo' : 'Selo ✅'}
                          </button>
                          <button 
                            onClick={() => handlePromote(u)}
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            {u.role === 'admin' ? 'Retirar Admin' : 'Admin 🛡️'}
                          </button>
                          <button 
                            onClick={() => handleBanUser(u)}
                            className="bg-red-50 text-red-600 border border-red-200 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-red-100 transition-colors cursor-pointer"
                          >
                            {u.status === 'banido' ? 'Reativar' : 'Banir 🔨'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* COMPLAINTS & REPORTS LIST */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 xl:col-span-1 flex flex-col">
            <div className="mb-5 flex justify-between items-center pb-3 border-b border-gray-50">
              <h3 className="font-bold text-gray-800 text-base">🚩 Denúncias Pendentes</h3>
              <span className="text-xs text-red-500 font-bold">{reportsList.length} Pendentes</span>
            </div>

            <div className="flex flex-col gap-4 max-h-[360px] overflow-y-auto pr-1">
              {reportsList.map((rep) => (
                <div key={rep.id} className="p-4 border border-gray-150 rounded-xl flex flex-col gap-3 bg-[#FAFAFA]">
                  <div>
                    <strong className="text-gray-800 text-sm block">{rep.title}</strong>
                    <span className="text-xs text-gray-400">{rep.subtitle}</span>
                    <span className="inline-block mt-2 bg-red-100 text-red-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-lg">
                      {rep.type}
                    </span>
                  </div>
                  <div className="flex gap-1.5 font-bold mt-1">
                    <button 
                      onClick={() => handleRemoveReportedPost(rep)}
                      className="flex-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 cursor-pointer"
                    >
                      Remover Post
                    </button>
                    <button 
                      onClick={() => handleIgnoreReport(rep)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg cursor-pointer"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}

              {reportsList.length === 0 && (
                <div className="text-center py-12 text-sm text-gray-400">Nenhuma denúncia pendente de ação.</div>
              )}
            </div>
          </section>

          {/* REPOSITORY SONGS UPLODER & MANAGER */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 xl:col-span-1 flex flex-col">
            <div className="mb-5 pb-3 border-b border-gray-50">
              <h3 className="font-bold text-gray-800 text-base">🎵 Biblioteca do Editor</h3>
              <p className="text-xs text-gray-400 mt-1">Carregar faixas disponíveis de áudio para o mini-editor.</p>
            </div>

            {/* FORM ADICIONAR MÚSICA */}
            <form onSubmit={handleAddSong} className="flex flex-col gap-3 mb-6 bg-[#FAFAFA] p-4 rounded-xl border border-gray-200">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Título da Música</label>
                <input 
                  type="text" 
                  placeholder="Ex: Dance Pop, Summer Beats" 
                  value={newSongTitle}
                  onChange={e => setNewSongTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-white focus:border-purple-650"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Artista / Categoria</label>
                <input 
                  type="text" 
                  placeholder="Ex: Admin, Beats Club" 
                  value={newSongArtist}
                  onChange={e => setNewSongArtist(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-white focus:border-purple-650"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Arquivo da Música (.mp3, .wav, .m4a)</label>
                <input 
                  id="audio-upload-input"
                  type="file" 
                  accept="audio/*"
                  onChange={handleAudioFileChange}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                />
                {newSongFile && (
                  <div className="mt-2 text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span>✓ Áudio carregado e pronto para envio!</span>
                  </div>
                )}
              </div>

              <button 
                type="submit"
                disabled={uploadingSong || !newSongFile}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-40 transition-opacity"
              >
                {uploadingSong ? "Enviando..." : "Sincronizar Música"}
              </button>
            </form>

            {/* MÚSICAS GRAVADAS */}
            <div className="flex-1 max-h-[220px] overflow-y-auto pr-1">
              <strong className="text-[11px] text-gray-400 block mb-2 uppercase tracking-wider font-semibold">Faixas Ativas ({songsList.length})</strong>
              <div className="flex flex-col gap-2">
                {songsList.map((song) => (
                  <div key={song.id} className="p-2 border border-gray-150 rounded-xl flex items-center justify-between gap-1.5 bg-[#FAFAFA] hover:bg-gray-100/50">
                    <div className="flex-1 min-w-0">
                      <strong className="text-gray-800 text-[11px] font-bold block truncate">{song.title}</strong>
                      <span className="text-[9px] text-gray-400 truncate block">@{song.artist}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <audio src={song.url} controls className="w-20 h-5 text-xs opacity-70" />
                      <button 
                        type="button"
                        onClick={() => handleDeleteSong(song)}
                        className="text-[10px] p-1 bg-red-50 text-red-650 hover:bg-red-100 rounded-md font-bold cursor-pointer"
                        title="Excluir Música"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}

                {songsList.length === 0 && (
                  <div className="text-center py-6 text-xs text-gray-400">Nenhuma música adicionada ainda.</div>
                )}
              </div>
            </div>
          </section>

          {/* SYSTEM ACT LOGS */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 xl:col-span-1">
            <div className="mb-5 pb-3 border-b border-gray-50">
              <h3 className="font-bold text-gray-800 text-base">📋 Log de Atividades Admin</h3>
            </div>

            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
              {logsList.map((log) => {
                const badgeColor = {
                  success: 'bg-emerald-500',
                  danger: 'bg-red-500',
                  info: 'bg-blue-500',
                  warning: 'bg-amber-500'
                };
                
                return (
                  <div key={log.id} className="flex gap-3 text-xs p-2 rounded-lg hover:bg-gray-50 transition-colors border-b border-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${badgeColor[log.status] || 'bg-gray-400'}`}></span>
                    <div className="flex-1">
                      <strong className="text-gray-850 font-semibold block leading-tight">{log.text}</strong>
                      <span className="text-[10px] text-gray-400 mt-1 block">Responsável: {log.author} • {log.timeLabel}</span>
                    </div>
                  </div>
                );
              })}

              {logsList.length === 0 && (
                <div className="text-center py-12 text-sm text-gray-400">Nenhum log gravado no Firestore ainda.</div>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
