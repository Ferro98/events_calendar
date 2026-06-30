import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Home({ user }) {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    // Genera una stringa YYYY-MM-DD per la giornata di oggi
    const oggi = new Date();
    const anno = oggi.getFullYear();
    const mese = String(oggi.getMonth() + 1).padStart(2, "0");
    const giorno = String(oggi.getDate()).padStart(2, "0");

    // Questo crea "2026-06-30T00:00:00" esatto, senza sballare con l'ora UTC
    const stringaInizioOggi = `${anno}-${mese}-${giorno}T00:00:00`;

    const { data, error } = await supabase
      .from("events")
      .select(
        `
        *,
        profiles(display_name),
        rsvps(status, profiles(display_name))
      `,
      )
      .gte("start_time", stringaInizioOggi)
      .order("start_time", { ascending: true });

    if (!error && data) setEvents(data);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!title || !startTime || !endTime) return;

    const { error } = await supabase.from("events").insert({
      title,
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      location,
      creator_id: user.id,
    });

    if (!error) {
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      fetchUpcomingEvents();
    } else {
      alert("Errore: " + error.message);
    }
  };

  const renderEventCard = (event) => {
    // Filtra solo chi ha risposto "Parteciperò"
    const partecipanti =
      event.rsvps?.filter((r) => r.status === "Parteciperò") || [];

    return (
      <Link
        to={`/event/${event.id}`}
        key={event.id}
        className="block bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-orange-500 transition group"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1 pr-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 group-hover:text-orange-500 transition">
                {event.title}
              </h3>
              {event.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 mt-0.5">
                  {event.description}
                </p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                📍 {event.location || "Nessuna posizione"}
              </p>
            </div>

            {/* Mostra l'elenco/conteggio dei partecipanti */}
            {partecipanti.length > 0 && (
              <div className="pt-2 border-t border-gray-50 dark:border-gray-800/50">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  👥 Partecipanti ({partecipanti.length}):{" "}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 iteration-list">
                  {partecipanti
                    .map((p) => p.profiles?.display_name || "Utente")
                    .join(", ")}
                </span>
              </div>
            )}
          </div>

          <div className="text-right bg-orange-50 dark:bg-orange-950/50 p-3 rounded-xl min-w-[90px] shrink-0">
            <span className="block text-sm font-bold text-orange-700 dark:text-orange-300">
              {new Date(event.start_time).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className="block text-[10px] text-orange-600 dark:text-orange-400 font-medium mt-0.5">
              {new Date(event.start_time).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </Link>
    );
  };

  // Classe comune per gli input
  const inputClass =
    "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const nextWeek = new Date(startOfToday);
  nextWeek.setDate(startOfToday.getDate() + 7);
  nextWeek.setHours(23, 59, 59, 999);

  // Confronto pulito basato sui millisecondi temporali
  const eventsNext7Days = events.filter((e) => {
    const eventTime = new Date(e.start_time).getTime();
    return (
      eventTime >= startOfToday.getTime() && eventTime <= nextWeek.getTime()
    );
  });

  const otherFutureEvents = events.filter((e) => {
    const eventTime = new Date(e.start_time).getTime();
    return eventTime > nextWeek.getTime();
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 h-fit">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-50 mb-4">
          🆕 Crea Evento
        </h2>
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Titolo
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Grigliata"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Descrizione
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              rows="2"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Inizio
            </label>
            <input
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Fine
            </label>
            <input
              type="datetime-local"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Posto
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg text-sm transition"
          >
            Pubblica Evento 🎉
          </button>
        </form>
      </div>

      <div className="md:col-span-2 space-y-8">
        {/* SEZIONE 1: PROSSIMI 7 GIORNI */}
        <div className="bg-gray-50/50 dark:bg-gray-900/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-800/60 space-y-4">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-50 uppercase tracking-wider text-xs">
                🔥 In programma questa settimana
              </h2>
            </div>
            <Link
              to="/calendar"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition shadow-sm"
            >
              📅 Calendario Complete
            </Link>
          </div>

          {eventsNext7Days.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl text-center border border-dashed border-gray-200 dark:border-gray-800 text-gray-400 text-xs">
              Nessun evento nei prossimi 7 giorni.
            </div>
          ) : (
            <div className="space-y-3">
              {eventsNext7Days.map((event) => renderEventCard(event))}
            </div>
          )}
        </div>

        {/* SEZIONE 2: ALTRI EVENTI FUTURI */}
        {otherFutureEvents.length > 0 && (
          <div className="bg-gray-50/50 dark:bg-gray-900/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-800/60 space-y-4">
            <div className="px-2">
              <h2 className="text-lg font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider text-xs">
                🚀 Più avanti nel tempo
              </h2>
            </div>
            <div className="space-y-3">
              {otherFutureEvents.map((event) => renderEventCard(event))}
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            Nessun evento in programma.
          </div>
        )}
      </div>
    </div>
  );
}
