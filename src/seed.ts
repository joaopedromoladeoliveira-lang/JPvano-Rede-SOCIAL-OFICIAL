import { db, collection, getDoc, setDoc, doc, addDoc, query, getDocs, limit } from "./firebase";
import { Post, Suggestion, ReportItem, ActivityLog, Story } from "./types";

export async function seedInitialData() {
  try {
    // 1. Verifica se já temos posts
    const postsCol = collection(db, "posts");
    const postsQuery = query(postsCol, limit(1));
    const postsSnap = await getDocs(postsQuery);

    if (postsSnap.empty) {
      console.log("Banco de dados vazio! Semeando dados iniciais no Firestore com suporte offline...");

      // Criar posts iniciais
      const initialPosts: Post[] = [
        {
          id: "post_1",
          userId: "gabi_arte_uid",
          username: "gabi_arte",
          name: "Gabi Arte",
          emoji: "🌊",
          likes: ["some_other_uid"],
          caption: "Tarde de verão deliciosa na praia! ☀️🌊 #natureza #foto #goodvibes",
          comments: [
            { id: "c1", username: "rock_vibes", text: "Que vibe maravilhosa!", createdAt: Date.now() - 3600000 },
            { id: "c2", username: "flora_jp", text: "Uau, que foto perfeita!", createdAt: Date.now() - 1800000 }
          ],
          commentsCount: 2,
          timeLabel: "2 HORAS ATRÁS",
          createdAt: Date.now() - 7200000,
          isFeatured: true
        },
        {
          id: "post_2",
          userId: "rock_vibes_uid",
          username: "rock_vibes",
          name: "Rock Vibes",
          emoji: "🎸",
          likes: [],
          caption: "Show incrível da banda ontem à noite! Galera pulou muito! 🤘🎸 #rock #musica #showtime",
          comments: [
            { id: "c3", username: "gabi_arte", text: "Vocês mandaram muito bem!!", createdAt: Date.now() - 7200000 }
          ],
          commentsCount: 1,
          timeLabel: "5 HORAS ATRÁS",
          createdAt: Date.now() - 18000000
        },
        {
          id: "post_3",
          userId: "flora_jp_uid",
          username: "flora_jp",
          name: "Flora JP",
          emoji: "🌸",
          likes: ["some_uid_1", "some_uid_2"],
          caption: "As flores e cores vibrantes da primavera que me encantam! 🌸🌺✨ #flores #jardim #primavera #beleza",
          comments: [],
          commentsCount: 0,
          timeLabel: "ONTEM",
          createdAt: Date.now() - 86400000,
          isFeatured: true
        }
      ];

      for (const p of initialPosts) {
        await setDoc(doc(db, "posts", p.id), p);
      }

      // Criar sugestões iniciais
      const initialSuggestions: Suggestion[] = [
        { id: "s_1", user: "surf_life", name: "Surf Life", emoji: "🏄", reason: "Seguido por gabi_arte" },
        { id: "s_2", user: "foodie_sp", name: "Foodie SP", emoji: "🍕", reason: "Sugerido para você" },
        { id: "s_3", user: "arte_moderna", name: "Arte Moderna", emoji: "🎨", reason: "Seguido por flora_jp" },
        { id: "s_4", user: "photo_braz", name: "Photo Brazil", emoji: "📸", reason: "Sugerido para você" }
      ];

      for (const s of initialSuggestions) {
        await setDoc(doc(db, "suggestions", s.id), s);
      }

      // Criar stories iniciais
      const initialStories: Story[] = [
        { id: "st_1", userId: "gabi_arte_uid", username: "gabi_arte", emoji: "🌊", seenBy: [], createdAt: Date.now() },
        { id: "st_2", userId: "rock_vibes_uid", username: "rock_vibes", emoji: "🎸", seenBy: [], createdAt: Date.now() },
        { id: "st_3", userId: "flora_jp_uid", username: "flora_jp", emoji: "🌸", seenBy: [], createdAt: Date.now() - 200000 },
        { id: "st_4", userId: "surf_uid", username: "surf_life", emoji: "🏄", seenBy: [], createdAt: Date.now() - 500000 },
        { id: "st_5", userId: "food_uid", username: "foodie_sp", emoji: "🍕", seenBy: [], createdAt: Date.now() - 800000 },
        { id: "st_6", userId: "art_uid", username: "arte_moderna", emoji: "🎨", seenBy: [], createdAt: Date.now() - 900000 }
      ];

      for (const st of initialStories) {
        await setDoc(doc(db, "stories", st.id), st);
      }

      // Criar denúncias iniciais para o painel admin
      const initialReports: ReportItem[] = [
        {
          id: "rep_1",
          targetId: "post_bad_1",
          title: "Post de @usuario_xyz",
          subtitle: "Conteúdo de ódio · 3 denúncias",
          type: "Ódio",
          status: "pendente",
          count: 3
        },
        {
          id: "rep_2",
          targetId: "user_bad_2",
          title: "Perfil @fake_account",
          subtitle: "Conta falsa · 12 denúncias",
          type: "Falso",
          status: "pendente",
          count: 12
        },
        {
          id: "rep_3",
          targetId: "comment_bad_3",
          title: "Comentário em post #4821",
          subtitle: "Spam · 1 denúncia",
          type: "Spam",
          status: "pendente",
          count: 1
        }
      ];

      for (const r of initialReports) {
        await setDoc(doc(db, "reports", r.id), r);
      }

      // Criar logs de atividades administrativas iniciais
      const initialLogs: ActivityLog[] = [
        {
          id: "log_1",
          text: "@artista_gabi recebeu selo verificado ✅",
          author: "jpvanoredesocial@gmail.com",
          timeLabel: "há 2 horas",
          status: "success",
          createdAt: Date.now() - 7200000
        },
        {
          id: "log_2",
          text: "@spam_bot123 foi banido permanentemente 🔨",
          author: "jpvanoredesocial@gmail.com",
          timeLabel: "há 5 horas",
          status: "danger",
          createdAt: Date.now() - 18000000
        },
        {
          id: "log_3",
          text: "@moderador_jp promovido a Moderador 🛡️",
          author: "jpvanoredesocial@gmail.com",
          timeLabel: "ontem",
          status: "info",
          createdAt: Date.now() - 86400000
        },
        {
          id: "log_4",
          text: "Post #9281 destacado no Explorar ⭐",
          author: "jpvanoredesocial@gmail.com",
          timeLabel: "ontem",
          status: "warning",
          createdAt: Date.now() - 100000000
        }
      ];

      for (const l of initialLogs) {
        await setDoc(doc(db, "logs", l.id), l);
      }

      console.log("Semeação concluída com sucesso!");
    }
  } catch (error) {
    console.error("Erro ao semear dados iniciais no Firebase:", error);
  }
}
