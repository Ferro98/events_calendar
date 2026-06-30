import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

// --- Helpers di data -------------------------------------------------

// Mezzanotte locale + offset di N giorni, restituita come oggetto Date.
// Usare Date + toISOString() (invece di concatenare stringhe a mano) è
// fondamentale: toISOString() converte correttamente l'orario LOCALE in
// UTC tenendo conto del fuso. Costruire a mano "YYYY-MM-DDT00:00:00" e
// mandarlo a Supabase fa sì che Postgres lo legga come se fosse GIA' UTC:
// di sera, con fusi avanti rispetto a UTC (es. CEST = UTC+2), la
// "mezzanotte locale" finisce per puntare al giorno dopo in UTC, e gli
// eventi di oggi spariscono dalla query. Da qui il bug.
const localDayStart = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

const getEventStatus = (event) => {
  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();
  if (now >= start && now <= end) return "live";
  if (now > end) return "ended";
  return "upcoming";
};

const initials = (name) =>
  (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const AVATAR_PALETTE = [
  "bg-orange-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-amber-500",
];

const avatarColor = (name) => {
  const str = name || "U";
  const code = str.charCodeAt(0) + (str.charCodeAt(str.length - 1) || 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};

// --- Componenti di supporto -------------------------------------------

function StatusPill({ status }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        In corso
      </span>
    );
  }
  if (status === "ended") {
    return (
      <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800/60 px-2 py-0.5 rounded-full">
        Concluso
      </span>
    );
  }
  return null;
}

function ParticipantAvatars({ partecipanti }) {
  if (partecipanti.length === 0) return null;
  const shown = partecipanti.slice(0, 4);
  const extra = partecipanti.length - shown.length;

  return (
    <div className="pt-3 mt-1 border-t border-gray-50 dark:border-gray-800/50 flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((p, i) => {
          const name = p.profiles?.display_name || "Utente";
          return (
            <div
              key={i}
              title={name}
              className={`h-6 w-6 rounded-full ${avatarColor(name)} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900`}
            >
              {initials(name)}
            </div>
          );
        })}
        {extra > 0 && (
          <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
            +{extra}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {partecipanti.length} {partecipanti.length === 1 ? "partecipante" : "partecipanti"}
      </span>
    </div>
  );
}

function EventCard({ event }) {
  const partecipanti = event.rsvps?.filter((r) => r.status === "Parteciperò") || [];
  const status = getEventStatus(event);

  return (
    <Link
      to={`/event/${event.id}`}
      className={`flex bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-orange-500 hover:shadow-md transition group overflow-hidden ${status === "ended" ? "opacity-60 hover:opacity-100" : ""
        }`}
    >
      {/* Ticket stub: data dell'evento */}
      <div className="relative flex flex-col items-center justify-center w-20 shrink-0 bg-orange-50 dark:bg-orange-950/40 px-2 py-4">
        <span className="text-[10px] font-bold uppercase tracking-wide text-orange-500 dark:text-orange-400">
          {new Date(event.start_time).toLocaleDateString("it-IT", { month: "short" })}
        </span>
        <span className="text-2xl font-black text-orange-700 dark:text-orange-300 leading-none mt-0.5">
          {new Date(event.start_time).toLocaleDateString("it-IT", { day: "numeric" })}
        </span>
        <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 mt-1">
          {new Date(event.start_time).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {/* perforazione del biglietto */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 6px, rgba(249,115,22,0.35) 6px 12px)",
          }}
        />
      </div>

      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-50 group-hover:text-orange-500 transition truncate">
            {event.title}
          </h3>
          <StatusPill status={status} />
        </div>

        {event.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 mt-0.5">{event.description}</p>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
          📍 {event.location || "Nessuna posizione"}
        </p>

        <ParticipantAvatars partecipanti={partecipanti} />
      </div>
    </Link>
  );
}

function EventSection({ title, dotClass, events, emptyText, action }) {
  return (
    <div className="bg-gray-50/50 dark:bg-gray-900/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-800/60 space-y-4">
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-2">
          {dotClass && <span className={`flex h-2 w-2 rounded-full ${dotClass}`} />}
          <h2 className="text-xs font-black text-gray-900 dark:text-gray-50 uppercase tracking-wider">
            {title}
            {events.length > 0 && (
              <span className="ml-1.5 text-gray-400 dark:text-gray-600 font-bold">({events.length})</span>
            )}
          </h2>
        </div>
        {action}
      </div>

      {events.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl text-center border border-dashed border-gray-200 dark:border-gray-800 text-gray-400 text-xs">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-pulse">
      <div className="w-20 bg-gray-100 dark:bg-gray-800" />
      <div className="flex-1 p-4 space-y-2">
        <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-3 w-1/3 bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

// --- Componente principale --------------------------------------------

export default function Home({ user }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    setIsLoading(true);

    // Mezzanotte locale convertita correttamente in UTC: vedi il
    // commento su localDayStart() per il perché del .toISOString().
    const startOfToday = localDayStart(0);

    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        profiles(display_name),
        rsvps(status, profiles!rsvps_user_id_fkey(display_name))
      `)
      .gte("start_time", startOfToday.toISOString())
      .order("start_time", { ascending: true });

    if (!error && data) setEvents(data);
    setIsLoading(false);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!title || !startTime || !endTime) return;
    if (new Date(endTime) <= new Date(startTime)) {
      setFormError("L'orario di fine deve essere dopo l'orario di inizio.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("events").insert({
      title,
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      location,
      creator_id: user.id,
    });
    setIsSubmitting(false);

    if (!error) {
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      fetchUpcomingEvents();
    } else {
      setFormError("Errore: " + error.message);
    }
  };

  // Raggruppamento eventi in 3 fasce temporali, calcolate una sola volta
  // e condivise da tutte le sezioni per evitare disallineamenti tra
  // "oggi" al momento della query e "oggi" al momento del render.
  const { todayEvents, thisWeekEvents, laterEvents } = useMemo(() => {
    const tomorrow = localDayStart(1).getTime();
    const nextWeek = localDayStart(7).getTime();

    const today = [];
    const week = [];
    const later = [];

    for (const event of events) {
      const t = new Date(event.start_time).getTime();
      if (t < tomorrow) today.push(event);
      else if (t < nextWeek) week.push(event);
      else later.push(event);
    }
    return { todayEvents: today, thisWeekEvents: week, laterEvents: later };
  }, [events]);

  const inputClass =
    "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 h-fit lg:sticky lg:top-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">Nuovo</p>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-50 mb-4">Crea evento</h2>

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
          <div className="grid grid-cols-2 gap-2">
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

          {formError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 rounded-lg">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg text-sm transition"
          >
            {isSubmitting ? "Pubblicazione..." : "Pubblica evento 🎉"}
          </button>
        </form>
      </div>

      <div className="lg:col-span-2 space-y-8">
        {isLoading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <EventSection
              title="🔥 Oggi"
              dotClass="bg-orange-500 animate-pulse"
              events={todayEvents}
              emptyText="Nessun evento oggi."
              action={
                <Link
                  to="/calendar"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition shadow-sm"
                >
                  📅 Calendario completo
                </Link>
              }
            />

            <EventSection
              title="Questa settimana"
              events={thisWeekEvents}
              emptyText="Nessun altro evento nei prossimi 7 giorni."
            />

            {laterEvents.length > 0 && (
              <EventSection title="🚀 Più avanti nel tempo" events={laterEvents} emptyText="" />
            )}

            {events.length === 0 && (
              <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                Nessun evento in programma. Creane uno dal pannello a sinistra.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}