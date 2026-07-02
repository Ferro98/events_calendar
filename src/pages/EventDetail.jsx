import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import EventComments from "../components/EventComments";

const RSVP_OPTIONS = [
  {
    status: "Parteciperò",
    label: "Sì",
    color: "bg-green-500 hover:bg-green-600",
  },
  {
    status: "Forse",
    label: "Forse",
    color: "bg-yellow-500 hover:bg-yellow-600",
  },
  {
    status: "Non parteciperò",
    label: "No",
    color: "bg-red-500 hover:bg-red-600",
  },
];

const AVATAR_PALETTE = [
  "bg-orange-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-amber-500",
];

const pad = (n) => String(n).padStart(2, "0");

// Scompone un ISO string in <input type="date"> + <input type="time">
// separati, nel fuso orario locale (non UTC, altrimenti l'orario mostrato
// nel form di modifica non corrisponderebbe a quello scelto in origine).
const isoToParts = (iso) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

// Ricompone data + ora locali in un ISO string, oppure null se la data
// non è stata compilata (i campi restano opzionali anche in modifica).
const partsToIso = (dateStr, timeStr) => {
  if (!dateStr) return null;
  return new Date(`${dateStr}T${timeStr || "00:00"}`).toISOString();
};

const formatEventDate = (event) => {
  if (!event.start_time) return "Data da definire";
  const start = new Date(event.start_time);
  const startStr = start.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const startTime = start.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!event.end_time) return `${startStr}, dalle ${startTime}`;
  const end = new Date(event.end_time);
  const endTime = end.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startStr}, ${startTime} – ${endTime}`;
};

const initials = (name) =>
  (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const avatarColor = (name) => {
  const str = name || "U";
  const code = str.charCodeAt(0) + (str.charCodeAt(str.length - 1) || 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};

function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 ${className}`}
    >
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 animate-pulse">
      {[120, 90, 140, 90].map((h, i) => (
        <div
          key={i}
          className="bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export default function EventDetail({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isRsvpBusy, setIsRsvpBusy] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Modifica evento (chiunque può completare i dettagli mancanti)
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Eliminazione evento (solo il creatore)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchEventData(true);

    // Ascolta i cambiamenti in tempo reale, ma SOLO per questo evento:
    // senza il filtro su event_id, ogni RSVP o oggetto aggiunto su
    // QUALSIASI evento dell'app avrebbe fatto ripartire un refetch qui.
    const channel = supabase
      .channel(`event-${id}-changes`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
          filter: `event_id=eq.${id}`,
        },
        () => fetchEventData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_items",
          filter: `event_id=eq.${id}`,
        },
        () => fetchEventData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchEventData = async (initial = false) => {
    if (initial) setIsLoading(true);

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (eventError) console.error("Errore eventi:", eventError);
    setEvent(eventData);

    const { data: rsvpData, error: rsvpError } = await supabase
      .from("rsvps")
      .select(
        `
    *,
    user_profile:profiles!rsvps_user_id_fkey(display_name),
    driver_profile:profiles!rsvps_driver_id_fkey(display_name)
  `,
      )
      .eq("event_id", id);
    if (rsvpError) console.error("Errore rsvps:", rsvpError);
    setRsvps(rsvpData || []);

    const { data: itemsData, error: itemsError } = await supabase
      .from("event_items")
      .select("*, profiles(display_name)")
      .eq("event_id", id);
    if (itemsError) console.error("Errore items:", itemsError);
    setItems(itemsData || []);

    if (initial) setIsLoading(false);
  };

  const myRsvp = rsvps.find((r) => r.user_id === user.id);
  const isParticipating =
    myRsvp?.status === "Parteciperò" || myRsvp?.status === "Forse";

  const updateRSVP = async (status) => {
    setIsRsvpBusy(true);
    setErrorMsg("");

    // Se cambia idea e dice "No", liberiamo prima il posto auto che
    // aveva eventualmente prenotato, in modo atomico sul DB.
    if (status === "Non parteciperò" && myRsvp?.driver_id) {
      await supabase.rpc("book_seat_atomic", {
        p_event_id: id,
        p_user_id: user.id,
        p_driver_id: myRsvp.driver_id,
      });
    }

    const rsvpData = { event_id: id, user_id: user.id, status };
    if (status === "Non parteciperò") {
      rsvpData.has_car = false;
      rsvpData.available_seats = 0;
      rsvpData.driver_id = null;
    }

    const { error } = await supabase
      .from("rsvps")
      .upsert(rsvpData, { onConflict: "event_id, user_id" });
    if (error) setErrorMsg("Errore nel salvare la risposta: " + error.message);
    else await fetchEventData();
    setIsRsvpBusy(false);
  };

  const updateCarpool = async (hasCar, seats) => {
    setErrorMsg("");

    // Se sta diventando guidatore ma aveva già un posto prenotato con
    // qualcun altro, va liberato per primo: altrimenti quel posto
    // resta "occupato" per sempre sull'auto dell'altro guidatore, anche
    // se questo utente non lo userà più.
    if (hasCar && myRsvp?.driver_id) {
      await supabase.rpc("book_seat_atomic", {
        p_event_id: id,
        p_user_id: user.id,
        p_driver_id: myRsvp.driver_id,
      });
    }

    const { error } = await supabase
      .from("rsvps")
      .update({
        has_car: hasCar,
        available_seats: hasCar ? seats : 0,
        driver_id: hasCar ? null : (myRsvp?.driver_id ?? null),
      })
      .eq("event_id", id)
      .eq("user_id", user.id);

    if (error) setErrorMsg("Errore carpool: " + error.message);
    else await fetchEventData();
  };

  const bookSeat = async (driverId) => {
    setErrorMsg("");
    const { error } = await supabase.rpc("book_seat_atomic", {
      p_event_id: id,
      p_user_id: user.id,
      p_driver_id: driverId,
    });

    // Se l'auto si è riempita nel frattempo, il DB solleva un'eccezione:
    // la funzione è atomica, quindi qui non si può mai "rubare" un posto
    // già occupato da un altro passeggero.
    if (error) setErrorMsg(error.message);
    await fetchEventData();
  };

  // Prenota un oggetto solo se è ancora libero. L'update è condizionato
  // (.is("assigned_to", null)) così, anche se due persone cliccano nello
  // stesso istante, il DB fa vincere solo la prima richiesta: la seconda
  // non aggiorna nessuna riga e qui lo segnaliamo invece di sovrascrivere
  // silenziosamente la prenotazione altrui.
  const claimItem = async (itemId) => {
    setErrorMsg("");
    const { data, error } = await supabase
      .from("event_items")
      .update({ assigned_to: user.id })
      .eq("id", itemId)
      .is("assigned_to", null)
      .select();

    if (error) setErrorMsg("Errore: " + error.message);
    else if (!data || data.length === 0)
      setErrorMsg("Troppo tardi: qualcun altro l'ha già preso un istante fa.");
    await fetchEventData();
  };

  // Libera un oggetto solo se è il proprio: stesso principio, condizione
  // sul DB invece che fidarsi solo del valore letto in UI.
  const releaseItem = async (itemId) => {
    setErrorMsg("");
    const { error } = await supabase
      .from("event_items")
      .update({ assigned_to: null })
      .eq("id", itemId)
      .eq("assigned_to", user.id);

    if (error) setErrorMsg("Errore: " + error.message);
    await fetchEventData();
  };

  const addItem = async (itemName) => {
    const name = itemName.trim();
    if (!name) return;
    setIsAddingItem(true);
    const { error } = await supabase
      .from("event_items")
      .insert({ event_id: id, item_name: name });
    if (error)
      setErrorMsg("Errore nell'aggiungere l'oggetto: " + error.message);
    else await fetchEventData();
    setIsAddingItem(false);
  };

  const removeItem = async (itemId) => {
    const { error } = await supabase
      .from("event_items")
      .delete()
      .eq("id", itemId);
    if (!error) await fetchEventData();
  };

  const openEdit = () => {
    const start = isoToParts(event.start_time);
    const end = isoToParts(event.end_time);
    setEditForm({
      title: event.title || "",
      description: event.description || "",
      location: event.location || "",
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
    });
    setIsEditing(true);
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const trimmedTitle = editForm.title.trim();
    if (!trimmedTitle) {
      setErrorMsg("Il titolo è obbligatorio.");
      return;
    }

    const start = partsToIso(editForm.startDate, editForm.startTime);
    const end = partsToIso(editForm.endDate, editForm.endTime);

    if (start && end && new Date(end) <= new Date(start)) {
      setErrorMsg("L'orario di fine deve essere dopo l'orario di inizio.");
      return;
    }
    if ((start && !end) || (!start && end)) {
      setErrorMsg(
        "Inserisci sia l'inizio che la fine, oppure lascia entrambi vuoti.",
      );
      return;
    }

    setIsSavingEvent(true);
    const { error } = await supabase
      .from("events")
      .update({
        title: trimmedTitle,
        description: editForm.description.trim() || null,
        location: editForm.location.trim() || null,
        start_time: start,
        end_time: end,
      })
      .eq("id", id);
    setIsSavingEvent(false);

    if (error) {
      setErrorMsg("Errore nel salvare le modifiche: " + error.message);
    } else {
      setIsEditing(false);
      await fetchEventData();
    }
  };

  const deleteEvent = async () => {
    setIsDeleting(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setIsDeleting(false);

    if (error) {
      setErrorMsg("Errore nell'eliminare l'evento: " + error.message);
      setIsConfirmingDelete(false);
    } else {
      navigate("/");
    }
  };

  const closeOnPick = (field) => (e) => {
    setEditForm((f) => ({ ...f, [field]: e.target.value }));
    e.target.blur();
  };

  const isCreator = event?.creator_id === user.id;
  const editInputClass =
    "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition";

  if (isLoading) return <DetailSkeleton />;
  if (!event) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Card>
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            Questo evento non esiste più o non hai accesso ad esso.
          </p>
        </Card>
      </div>
    );
  }

  const generateGoogleCalendarLink = (event) => {
    const baseUrl =
      "https://calendar.google.com/calendar/render?action=TEMPLATE";

    // Se l'evento non è ancora stato caricato dallo stato o dal DB, usciamo subito safely
    if (!event) return "";

    const formatDateTime = (dateVal) => {
      if (!dateVal) return "";
      const date = new Date(dateVal);
      // 🌟 IL SALVAVITA: Se la data è "Invalid Date", restituisce vero su isNaN e usciamo senza crashare
      if (isNaN(date.getTime())) return "";
      return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
    };

    const startTime = formatDateTime(event.start_time);

    // Calcoliamo la data di fine in modo sicuro per evitare di passare NaN alla funzione
    let endTime = "";
    if (event.end_time) {
      endTime = formatDateTime(event.end_time);
    } else {
      const startParsed = new Date(event.start_time);
      if (!isNaN(startParsed.getTime())) {
        // Se la data di inizio è valida, aggiungiamo 2 ore di default
        const endCalculated = new Date(
          startParsed.getTime() + 2 * 60 * 60 * 1000,
        );
        endTime = formatDateTime(endCalculated);
      }
    }

    const params = new URLSearchParams({
      text: event.title || "Evento Summer Squad",
      dates: `${startTime}/${endTime}`,
      details: event.description || "Creato con Summer Squad ☀️",
      location: event.location || "",
    });

    return `${baseUrl}&${params.toString()}`;
  };

  // Prima del return, ricordati di calcolare l'URL:
  const googleCalendarUrl = generateGoogleCalendarLink(event);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between gap-3">
          {errorMsg}
          <button
            onClick={() => setErrorMsg("")}
            className="shrink-0 font-bold hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      <Card>
        {!isEditing ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-black text-gray-900 dark:text-white">
                {event.title}
              </h1>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={openEdit}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label="Modifica evento"
                  title="Modifica evento"
                >
                  ✏️
                </button>
                {isCreator && (
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40 transition"
                    aria-label="Elimina evento"
                    title="Elimina evento"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {event.description && (
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                {event.description}
              </p>
            )}
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              🕒 {formatEventDate(event)}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              📍 {event.location || "Nessuna posizione"}
            </p>

            {/* 🗓️ PULSANTE GOOGLE CALENDAR INSERITO QUI */}
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800/60">
              <a
                href={googleCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold py-2 px-3.5 rounded-xl border border-gray-200 dark:border-gray-700/70 transition shadow-sm cursor-pointer group"
              >
                <span className="text-sm group-hover:scale-110 transition-transform">
                  🗓️
                </span>
                Salva nei tuoi promemoria
              </a>
            </div>

            {isConfirmingDelete && (
              <div className="mt-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-4">
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                  Eliminare definitivamente questo evento? Non si può annullare.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="flex-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-2 rounded-lg text-sm transition hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={deleteEvent}
                    disabled={isDeleting}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold py-2 rounded-lg text-sm transition"
                  >
                    {isDeleting ? "Eliminazione..." : "Elimina definitivamente"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={saveEvent} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Titolo <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, title: e.target.value }))
                }
                className={editInputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Descrizione
              </label>
              <textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, description: e.target.value }))
                }
                className={editInputClass}
                rows="2"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Inizio
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={editForm.startDate}
                  onChange={closeOnPick("startDate")}
                  className={editInputClass}
                />
                <input
                  type="time"
                  value={editForm.startTime}
                  onChange={closeOnPick("startTime")}
                  className={editInputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Fine
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={editForm.endDate}
                  onChange={closeOnPick("endDate")}
                  className={editInputClass}
                />
                <input
                  type="time"
                  value={editForm.endTime}
                  onChange={closeOnPick("endTime")}
                  className={editInputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Posto
              </label>
              <input
                type="text"
                value={editForm.location}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, location: e.target.value }))
                }
                className={editInputClass}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-2 rounded-lg text-sm transition hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSavingEvent}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg text-sm transition"
              >
                {isSavingEvent ? "Salvataggio..." : "Salva modifiche"}
              </button>
            </div>
          </form>
        )}
      </Card>

      {/* RSVP Section */}
      <Card>
        <h2 className="text-lg font-bold mb-4 dark:text-white">
          Parteciperai?
        </h2>
        <div className="flex w-full gap-2">
          {RSVP_OPTIONS.map((opt) => {
            const isSelected = myRsvp?.status === opt.status;
            return (
              <button
                key={opt.status}
                onClick={() => updateRSVP(opt.status)}
                disabled={isRsvpBusy}
                className={`flex-1 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm md:text-base ${opt.color} ${
                  isSelected
                    ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-gray-900 dark:ring-white"
                    : ""
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Card>

      {isParticipating ? (
        <>
          {/* Carpooling Management */}
          <Card>
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              🚗 Gestisci passaggio
            </h2>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!myRsvp?.has_car}
                  onChange={(e) =>
                    updateCarpool(e.target.checked, e.target.checked ? 3 : 0)
                  }
                  className="w-4 h-4"
                />
                Offro un passaggio
              </label>

              {myRsvp?.has_car && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Seleziona i posti totali disponibili nella tua auto:
                  </p>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4].map((posti) => {
                      const isSelected = myRsvp?.available_seats === posti;
                      return (
                        <button
                          key={posti}
                          type="button"
                          onClick={() => updateCarpool(true, posti)}
                          className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          {posti}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {!myRsvp?.has_car && (
              <div className="mt-6 pt-4 border-t dark:border-gray-700">
                <h3 className="text-sm font-bold mb-3 dark:text-white">
                  Prenota un posto:
                </h3>
                {rsvps.filter((r) => r.has_car).length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Nessuno offre passaggi al momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rsvps
                      .filter((r) => r.has_car)
                      .map((driver) => {
                        const isPiena = driver.available_seats <= 0;
                        const isMiaPrenotazione =
                          myRsvp?.driver_id === driver.user_id;

                        return (
                          <div
                            key={driver.user_id}
                            className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg"
                          >
                            <span className="text-sm dark:text-white">
                              {driver.user_profile?.display_name || "Utente"} (
                              {driver.available_seats} posti)
                            </span>
                            <button
                              type="button"
                              disabled={isPiena && !isMiaPrenotazione}
                              onClick={() => bookSeat(driver.user_id)}
                              title={
                                isMiaPrenotazione
                                  ? "Tocca per annullare la prenotazione"
                                  : undefined
                              }
                              className={`text-xs px-2 py-1 rounded transition-all cursor-pointer ${
                                isMiaPrenotazione
                                  ? "bg-green-600 text-white hover:bg-green-700"
                                  : isPiena
                                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                                    : "bg-blue-500 text-white hover:bg-blue-600"
                              }`}
                            >
                              {isMiaPrenotazione
                                ? "Prenotato ✅"
                                : isPiena
                                  ? "Auto piena ❌"
                                  : "Prenota"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Lista Partecipanti */}
          <Card>
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              👥 Partecipanti ({rsvps.length})
            </h2>
            {rsvps.length === 0 ? (
              <p className="text-gray-400 text-sm">Ancora nessuno...</p>
            ) : (
              <div className="space-y-3">
                {rsvps.map((r) => {
                  const name = r.user_profile?.display_name || "Utente";
                  return (
                    <div
                      key={r.id}
                      className="flex justify-between items-center gap-2 py-2 border-b dark:border-gray-800 dark:text-gray-300 last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-8 w-8 rounded-full ${avatarColor(name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                        >
                          {initials(name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium truncate">{name}</span>
                          {r.has_car && (
                            <span className="text-xs text-indigo-500 font-semibold">
                              🚗{" "}
                              {r.available_seats > 0
                                ? `${r.available_seats} posti liberi`
                                : "Auto piena"}
                            </span>
                          )}
                          {r.driver_id && (
                            <span className="text-xs text-green-600 font-semibold">
                              🙋‍♂️ Con{" "}
                              {r.driver_profile?.display_name || "Autista"}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-xs shrink-0 ${
                          r.status === "Parteciperò"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Checklist Cose da Portare */}
          <Card>
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              📦 Cosa portiamo?
            </h2>

            <div className="flex items-center gap-2 mb-4">
              <input
                id="item-input"
                type="text"
                placeholder="Es. Birra, Ghiaccio..."
                className="flex-1 min-w-0 h-11 px-3 rounded-lg border dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm"
                disabled={isAddingItem}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target.value.trim() !== "") {
                    addItem(e.target.value);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                disabled={isAddingItem}
                onClick={() => {
                  const input = document.getElementById("item-input");
                  if (input && input.value.trim() !== "") {
                    addItem(input.value);
                    input.value = "";
                  }
                }}
                className="h-11 px-4 shrink-0 whitespace-nowrap bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-bold rounded-lg text-sm transition-all active:scale-95 cursor-pointer"
              >
                {isAddingItem ? "..." : "Aggiungi"}
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-gray-400 text-sm">
                Nessun oggetto in lista, ancora.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const claimedByMe = item.assigned_to === user.id;
                  const claimedByOther = !!item.assigned_to && !claimedByMe;

                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl gap-x-4 gap-y-2 border border-gray-100 dark:border-gray-800/40"
                    >
                      <span
                        className={`text-sm break-words flex-1 min-w-[140px] ${
                          item.assigned_to
                            ? "line-through text-gray-400 dark:text-gray-500"
                            : "text-gray-800 dark:text-gray-200 font-medium"
                        }`}
                      >
                        {item.item_name}
                      </span>

                      <div className="flex items-center justify-end gap-2 shrink-0 ml-auto">
                        {item.assigned_to && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/60 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                            {item.profiles?.display_name || ""}
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={claimedByOther}
                          onClick={() =>
                            claimedByMe
                              ? releaseItem(item.id)
                              : claimItem(item.id)
                          }
                          title={
                            claimedByOther
                              ? "Già prenotato da qualcun altro"
                              : undefined
                          }
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
                            claimedByMe
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : claimedByOther
                                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                          }`}
                        >
                          {claimedByMe
                            ? "✅ Annulla"
                            : claimedByOther
                              ? "✅ Preso"
                              : "Prenota"}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-bold px-2 h-8 flex items-center justify-center cursor-pointer transition"
                          aria-label="Rimuovi oggetto"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Sezione Commenti */}
          <EventComments eventId={id} user={user} />
        </>
      ) : (
        myRsvp?.status === "Non parteciperò" && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 p-4 rounded-2xl text-center text-sm font-medium animate-fade-in">
            Hai indicato che non parteciperai a questo evento. Cambia la tua
            risposta per vedere la logistica e la checklist.
          </div>
        )
      )}
    </div>
  );
}
