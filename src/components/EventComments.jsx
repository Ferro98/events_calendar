import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useToast } from "../context/ToastContext";

const MAX_COMMENT_LENGTH = 500;

const AVATAR_COLORS = [
  "bg-orange-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-rose-500",
];

// Colore stabile per utente, derivato dal nome (stesso utente = stesso colore)
function colorForName(name) {
  const str = name || "?";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsForName(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

// Formatta la data di un commento: "Adesso", "5 min fa", "2 ore fa",
// "Ieri 14:32" oppure "6 ago 14:32" (con anno se diverso da quello corrente).
function formatCommentDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now - date) / 60000);

  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isSameDay(date, now)) {
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} ${diffHours === 1 ? "ora" : "ore"} fa`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Ieri ${time}`;

  const dateOptions = { day: "numeric", month: "short" };
  if (date.getFullYear() !== now.getFullYear()) dateOptions.year = "numeric";

  return `${date.toLocaleDateString("it-IT", dateOptions)} ${time}`;
}

function Avatar({ name }) {
  return (
    <div
      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${colorForName(name)}`}
    >
      {initialsForName(name)}
    </div>
  );
}

export default function EventComments({ eventId, user }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingComment, setPendingComment] = useState(null);
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const { showToast } = useToast();

  // 1. Recupera i commenti dell'evento
  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("event_comments")
      .select(
        `
        *,
        profiles(display_name)
      `,
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setComments(data);
    } else if (error) {
      showToast("Impossibile caricare i commenti.");
    }
  };

  useEffect(() => {
    fetchComments();

    // Sottoscrizione Realtime per vedere i commenti live senza ricaricare
    const channel = supabase
      .channel(`realtime-comments-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_comments",
          filter: `event_id=eq.${eventId}`,
        },
        () => fetchComments(),
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [eventId]);

  // Scorri automaticamente all'ultimo commento quando la lista cambia
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments, pendingComment]);

  const resizeTextarea = (el) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleChangeComment = (e) => {
    setNewComment(e.target.value.slice(0, MAX_COMMENT_LENGTH));
    resizeTextarea(e.target);
  };

  const handleKeyDown = (e) => {
    // Invio per inviare, Shift+Invio per andare a capo (comportamento da chat)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 2. Invia un nuovo commento
  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = newComment.trim();
    if (!text || loading) return;

    setLoading(true);
    setPendingComment(text);
    setNewComment("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      comment_text: text,
    });

    if (!error) {
      await fetchComments();
    } else {
      setNewComment(text); // ripristina il testo se l'invio fallisce
      showToast("Impossibile inviare il commento. Riprova.");
    }
    setPendingComment(null);
    setLoading(false);
  };

  // 3. Elimina un commento
  const handleDelete = async (commentId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId);

    if (!error) {
      fetchComments(); // 👈 Forza l'aggiornamento immediato per chi cancella
    } else {
      showToast("Impossibile eliminare il commento. Riprova.");
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-4 sm:p-6 rounded-3xl border border-gray-100 dark:border-gray-800/60 space-y-4 sm:space-y-6 mt-6">
      <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        💬 Discussione ({comments.length})
      </h3>

      {/* Lista Commenti */}
      <div
        ref={listRef}
        className="space-y-3 max-h-96 overflow-y-auto pr-1 sm:pr-2 scroll-smooth"
      >
        {comments.length === 0 && !pendingComment ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Nessun commento. Scrivi qualcosa tu!
          </p>
        ) : (
          comments.map((c) => {
            const isMine = c.user_id === user.id;
            const name = c.profiles?.display_name || "Utente";
            return (
              <div
                key={c.id}
                className={`flex gap-2 text-sm items-end ${isMine ? "flex-row-reverse" : ""}`}
              >
                <Avatar name={name} />
                <div
                  className={`group relative max-w-[80%] sm:max-w-[75%] p-3 rounded-2xl border ${
                    isMine
                      ? "bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20"
                      : "bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800/40"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 mb-1 ${isMine ? "flex-row-reverse" : ""}`}
                  >
                    <span className="font-bold text-orange-500 text-xs">
                      {name}
                    </span>
                    <span
                      className="text-[10px] text-gray-400"
                      title={new Date(c.created_at).toLocaleString("it-IT")}
                    >
                      {formatCommentDate(c.created_at)}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 text-xs break-words whitespace-pre-wrap">
                    {c.comment_text}
                  </p>

                  {/* Tasto elimina: sempre visibile su mobile (niente hover), sfumato su desktop finché non si passa sopra */}
                  {isMine && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      aria-label="Elimina commento"
                      className="absolute -top-2 -right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Commento ottimistico: mostrato subito mentre l'invio è in corso */}
        {pendingComment && (
          <div className="flex gap-2 text-sm items-end flex-row-reverse opacity-60">
            <Avatar name={user.display_name} />
            <div className="max-w-[80%] sm:max-w-[75%] p-3 rounded-2xl border bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20 animate-pulse">
              <p className="text-gray-700 dark:text-gray-300 text-xs break-words whitespace-pre-wrap">
                {pendingComment}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-1">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={newComment}
            onChange={handleChangeComment}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un commento..."
            maxLength={MAX_COMMENT_LENGTH}
            className="flex-1 min-w-0 resize-none max-h-[120px] p-3 border rounded-xl text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none"
          />
          <button
            type="submit"
            disabled={loading || !newComment.trim()}
            className="shrink-0 whitespace-nowrap bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-3 rounded-xl text-xs transition shadow-sm cursor-pointer disabled:opacity-50 min-w-[56px] flex items-center justify-center"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              "Invia"
            )}
          </button>
        </div>
        <div className="flex justify-end">
          <span
            className={`text-[10px] ${
              newComment.length >= MAX_COMMENT_LENGTH
                ? "text-red-500"
                : "text-gray-400"
            }`}
          >
            {newComment.length}/{MAX_COMMENT_LENGTH}
          </span>
        </div>
      </form>
    </div>
  );
}
