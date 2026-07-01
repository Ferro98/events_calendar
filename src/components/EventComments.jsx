import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function EventComments({ eventId, user }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

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

    if (!error && data) setComments(data);
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

  // 2. Invia un nuovo commento
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setLoading(true);

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      comment_text: newComment.trim(),
    });

    if (!error) {
      setNewComment("");
      fetchComments();
    }
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
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/60 space-y-6 mt-6">
      <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        💬 Discussione ({comments.length})
      </h3>

      {/* Lista Commenti */}
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Nessun commento. Scrivi qualcosa tu!
          </p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="flex gap-3 text-sm items-start justify-between bg-gray-50 dark:bg-gray-950 p-3 rounded-2xl border border-gray-100 dark:border-gray-800/40"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-orange-500 text-xs">
                    {c.profiles?.display_name || "Utente"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(c.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-xs break-all">
                  {c.comment_text}
                </p>
              </div>

              {/* Mostra il tasto elimina solo se il commento è tuo */}
              {c.user_id === user.id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-gray-400 hover:text-red-500 text-xs transition cursor-pointer px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Scrivi un commento..."
          className="flex-1 p-3 border rounded-xl text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 rounded-xl text-xs transition shadow-sm cursor-pointer disabled:opacity-50"
        >
          Invia
        </button>
      </form>
    </div>
  );
}
