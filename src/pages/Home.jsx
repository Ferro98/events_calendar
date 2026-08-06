import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useToast } from "../context/ToastContext";

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

// Combina un input <date> e un input <time> separati in un ISO string,
// oppure restituisce null se la data non è stata compilata (il campo è
// opzionale: solo il titolo è obbligatorio in fase di creazione).
const combineDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  return new Date(`${dateStr}T${timeStr || "00:00"}`).toISOString();
};

const getEventStatus = (event) => {
  if (!event.start_time || !event.end_time) return "unscheduled";
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
        {partecipanti.length}{" "}
        {partecipanti.length === 1 ? "partecipante" : "partecipanti"}
      </span>
    </div>
  );
}

function EventCard({ event }) {
  const partecipanti =
    event.rsvps?.filter((r) => r.status === "Parteciperò") || [];
  const status = getEventStatus(event);
  const hasDate = !!event.start_time;

  return (
    <Link
      to={`/event/${event.id}`}
      className={`flex bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-orange-500 hover:shadow-md transition group overflow-hidden ${
        status === "ended" ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      {/* Ticket stub: data dell'evento, o placeholder se ancora da definire */}
      <div className="relative flex flex-col items-center justify-center w-20 shrink-0 bg-orange-50 dark:bg-orange-950/40 px-2 py-4">
        {hasDate ? (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wide text-orange-500 dark:text-orange-400">
              {new Date(event.start_time).toLocaleDateString("it-IT", {
                month: "short",
              })}
            </span>
            <span className="text-2xl font-black text-orange-700 dark:text-orange-300 leading-none mt-0.5">
              {new Date(event.start_time).toLocaleDateString("it-IT", {
                day: "numeric",
              })}
            </span>
            <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 mt-1">
              {new Date(event.start_time).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </>
        ) : (
          <>
            <span className="text-xl">🗓️</span>
            <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 text-center mt-1 leading-tight">
              Da
              <br />
              definire
            </span>
          </>
        )}
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
          <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 mt-0.5">
            {event.description}
          </p>
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
          {dotClass && (
            <span className={`flex h-2 w-2 rounded-full ${dotClass}`} />
          )}
          <h2 className="text-xs font-black text-gray-900 dark:text-gray-50 uppercase tracking-wider">
            {title}
            {events.length > 0 && (
              <span className="ml-1.5 text-gray-400 dark:text-gray-600 font-bold">
                ({events.length})
              </span>
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

// --- Modal di creazione evento ------------------------------------------

function CreateEventModal({ onClose, onCreated, userId }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Chiude il modal con ESC, comodo da tastiera
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Il titolo è obbligatorio.");
      return;
    }

    const start = combineDateTime(startDate, startTime);
    const end = combineDateTime(endDate, endTime);

    if (start && end && new Date(end) <= new Date(start)) {
      setFormError("L'orario di fine deve essere dopo l'orario di inizio.");
      return;
    }
    // Se è stata data solo una delle due date, meglio segnalarlo subito
    // piuttosto che salvare un evento con inizio ma senza fine (o viceversa).
    if ((start && !end) || (!start && end)) {
      setFormError(
        "Inserisci sia l'inizio che la fine, oppure lascia entrambi vuoti.",
      );
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("events").insert({
      title: trimmedTitle,
      description: description.trim() || null,
      start_time: start,
      end_time: end,
      location: location.trim() || null,
      creator_id: userId,
    });
    setIsSubmitting(false);

    if (!error) {
      onCreated();
    } else {
      setFormError("Errore: " + error.message);
    }
  };

  const inputClass =
    "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition";

  // Alla selezione di data/ora, togliamo subito il focus dal campo:
  // su Chrome/Edge/Safari questo chiude il picker nativo senza dover
  // cliccare fuori. Su Firefox desktop il comportamento può variare
  // leggermente: è un limite del browser, non risolvibile lato JS al 100%.
  const closeOnPick = (setter) => (e) => {
    setter(e.target.value);
    e.target.blur();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-50 dark:border-gray-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">
              Nuovo
            </p>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-50">
              Crea evento
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Titolo <span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Grigliata"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Descrizione{" "}
              <span className="text-gray-300 dark:text-gray-600 normal-case">
                (opzionale)
              </span>
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
              Inizio{" "}
              <span className="text-gray-300 dark:text-gray-600 normal-case">
                (opzionale)
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={closeOnPick(setStartDate)}
                className={inputClass}
              />
              <input
                type="time"
                value={startTime}
                onChange={closeOnPick(setStartTime)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Fine{" "}
              <span className="text-gray-300 dark:text-gray-600 normal-case">
                (opzionale)
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={endDate}
                onChange={closeOnPick(setEndDate)}
                className={inputClass}
              />
              <input
                type="time"
                value={endTime}
                onChange={closeOnPick(setEndTime)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Posto{" "}
              <span className="text-gray-300 dark:text-gray-600 normal-case">
                (opzionale)
              </span>
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

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-2 rounded-lg text-sm transition hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg text-sm transition"
            >
              {isSubmitting ? "Pubblicazione..." : "Pubblica 🎉"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Componente principale --------------------------------------------

export default function Home({ user }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rsvpFilter, setRsvpFilter] = useState("all"); // "all" | "mine"
  const { showToast } = useToast();

  const fetchEvents = async () => {
    setIsLoading(true);

    // Prendiamo tutti gli eventi (anche senza data, ora che il titolo è
    // l'unico campo obbligatorio) e li raggruppiamo lato client: filtrare
    // via query solo quelli "futuri" escluderebbe per sempre gli eventi
    // ancora senza data, dato che un confronto >= con un campo null in
    // SQL non è mai vero.
    const { data, error } = await supabase
      .from("events")
      .select(
        `
        *,
        profiles(display_name),
        rsvps(status, user_id, profiles!rsvps_user_id_fkey(display_name))
      `,
      )
      .order("start_time", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setEvents(data);
    } else if (error) {
      showToast("Impossibile caricare gli eventi. Riprova più tardi.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreated = () => {
    setIsModalOpen(false);
    fetchEvents();
  };

  // Ricerca testuale (titolo/descrizione/luogo) + filtro "solo i miei eventi",
  // applicati prima del raggruppamento in fasce così le sezioni restano coerenti.
  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      if (query) {
        const haystack = [event.title, event.description, event.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (rsvpFilter === "mine") {
        const mine = event.rsvps?.some(
          (r) =>
            r.user_id === user.id &&
            (r.status === "Parteciperò" || r.status === "Forse"),
        );
        if (!mine) return false;
      }

      return true;
    });
  }, [events, searchQuery, rsvpFilter, user.id]);

  // Raggruppamento eventi in 4 fasce, calcolate una sola volta e condivise
  // da tutte le sezioni per evitare disallineamenti tra "oggi" al momento
  // della query e "oggi" al momento del render.
  const { unscheduledEvents, todayEvents, thisWeekEvents, laterEvents } =
    useMemo(() => {
      const tomorrow = localDayStart(1).getTime();
      const nextWeek = localDayStart(7).getTime();

      const unscheduled = [];
      const today = [];
      const week = [];
      const later = [];

      for (const event of filteredEvents) {
        if (!event.start_time) {
          unscheduled.push(event);
          continue;
        }
        const t = new Date(event.start_time).getTime();
        if (t < localDayStart(0).getTime()) continue; // evento passato, non lo mostriamo in Home
        if (t < tomorrow) today.push(event);
        else if (t < nextWeek) week.push(event);
        else later.push(event);
      }
      return {
        unscheduledEvents: unscheduled,
        todayEvents: today,
        thisWeekEvents: week,
        laterEvents: later,
      };
    }, [filteredEvents]);

  const isFiltering = searchQuery.trim() !== "" || rsvpFilter !== "all";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-50">
            I tuoi eventi
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tutto quello che la squad ha in programma
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/calendar"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-3 sm:px-4 rounded-xl transition shadow-sm"
            title="Visualizza Calendario"
          >
            <span>📅</span>
            <span className="hidden sm:inline">Calendario</span>
          </Link>

          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-bold py-2.5 px-3 sm:px-4 rounded-xl transition shadow-sm whitespace-nowrap"
          >
            + <span className="hidden sm:inline">Nuovo evento</span>
            <span className="sm:hidden">Evento</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca per titolo, luogo o descrizione..."
            className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/70 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setRsvpFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              rsvpFilter === "all"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Tutti
          </button>
          <button
            type="button"
            onClick={() => setRsvpFilter("mine")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              rsvpFilter === "mine"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Partecipo
          </button>
        </div>
      </div>

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
          />

          <EventSection
            title="Questa settimana"
            events={thisWeekEvents}
            emptyText="Nessun altro evento nei prossimi 7 giorni."
          />

          {laterEvents.length > 0 && (
            <EventSection
              title="🚀 Più avanti nel tempo"
              events={laterEvents}
              emptyText=""
            />
          )}

          {unscheduledEvents.length > 0 && (
            <EventSection
              title="🗓️ Da pianificare"
              events={unscheduledEvents}
              emptyText="Nessun evento senza data."
            />
          )}

          {events.length === 0 && (
            <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              Nessun evento in programma.{" "}
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-orange-500 font-bold hover:underline"
              >
                Creane uno
              </button>
              .
            </div>
          )}

          {events.length > 0 && filteredEvents.length === 0 && (
            <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              Nessun evento corrisponde alla ricerca.{" "}
              {isFiltering && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setRsvpFilter("all");
                  }}
                  className="text-orange-500 font-bold hover:underline"
                >
                  Azzera filtri
                </button>
              )}
            </div>
          )}
        </>
      )}

      {isModalOpen && (
        <CreateEventModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCreated}
          userId={user.id}
        />
      )}
    </div>
  );
}
