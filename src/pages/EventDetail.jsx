import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

const RSVP_OPTIONS = [
  { status: "Parteciperò", label: "Sì", color: "bg-green-500 hover:bg-green-600" },
  { status: "Forse", label: "Forse", color: "bg-yellow-500 hover:bg-yellow-600" },
  { status: "Non parteciperò", label: "No", color: "bg-red-500 hover:bg-red-600" },
];

const AVATAR_PALETTE = ["bg-orange-500", "bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-sky-500", "bg-amber-500"];

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
    <div className={`bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 ${className}`}>
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 animate-pulse">
      {[120, 90, 140, 90].map((h, i) => (
        <div key={i} className="bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800" style={{ height: h }} />
      ))}
    </div>
  );
}

export default function EventDetail({ user }) {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isRsvpBusy, setIsRsvpBusy] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);

  useEffect(() => {
    fetchEventData(true);

    // Ascolta i cambiamenti in tempo reale, ma SOLO per questo evento:
    // senza il filtro su event_id, ogni RSVP o oggetto aggiunto su
    // QUALSIASI evento dell'app avrebbe fatto ripartire un refetch qui.
    const channel = supabase
      .channel(`event-${id}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${id}` },
        () => fetchEventData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_items", filter: `event_id=eq.${id}` },
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
  const isParticipating = myRsvp?.status === "Parteciperò" || myRsvp?.status === "Forse";

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

    const { error } = await supabase.from("rsvps").upsert(rsvpData, { onConflict: "event_id, user_id" });
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
    else if (!data || data.length === 0) setErrorMsg("Troppo tardi: qualcun altro l'ha già preso un istante fa.");
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
    const { error } = await supabase.from("event_items").insert({ event_id: id, item_name: name });
    if (error) setErrorMsg("Errore nell'aggiungere l'oggetto: " + error.message);
    else await fetchEventData();
    setIsAddingItem(false);
  };

  const removeItem = async (itemId) => {
    const { error } = await supabase.from("event_items").delete().eq("id", itemId);
    if (!error) await fetchEventData();
  };

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

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between gap-3">
          {errorMsg}
          <button onClick={() => setErrorMsg("")} className="shrink-0 font-bold hover:opacity-70">
            ✕
          </button>
        </div>
      )}

      <Card>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">{event.title}</h1>
        {event.description && <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">{event.description}</p>}
        <p className="text-gray-500 dark:text-gray-400 mt-2">📍 {event.location || "Nessuna posizione"}</p>
      </Card>

      {/* RSVP Section */}
      <Card>
        <h2 className="text-lg font-bold mb-4 dark:text-white">Parteciperai?</h2>
        <div className="flex w-full gap-2">
          {RSVP_OPTIONS.map((opt) => {
            const isSelected = myRsvp?.status === opt.status;
            return (
              <button
                key={opt.status}
                onClick={() => updateRSVP(opt.status)}
                disabled={isRsvpBusy}
                className={`flex-1 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm md:text-base ${opt.color} ${isSelected ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-gray-900 dark:ring-white" : ""
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
            <h2 className="text-lg font-bold mb-4 dark:text-white">🚗 Gestisci passaggio</h2>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!myRsvp?.has_car}
                  onChange={(e) => updateCarpool(e.target.checked, e.target.checked ? 3 : 0)}
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
                          className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-all cursor-pointer ${isSelected
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
                <h3 className="text-sm font-bold mb-3 dark:text-white">Prenota un posto:</h3>
                {rsvps.filter((r) => r.has_car).length === 0 ? (
                  <p className="text-xs text-gray-400">Nessuno offre passaggi al momento.</p>
                ) : (
                  <div className="space-y-2">
                    {rsvps
                      .filter((r) => r.has_car)
                      .map((driver) => {
                        const isPiena = driver.available_seats <= 0;
                        const isMiaPrenotazione = myRsvp?.driver_id === driver.user_id;

                        return (
                          <div
                            key={driver.user_id}
                            className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg"
                          >
                            <span className="text-sm dark:text-white">
                              {driver.user_profile?.display_name || "Utente"} ({driver.available_seats} posti)
                            </span>
                            <button
                              disabled={isPiena && !isMiaPrenotazione}
                              onClick={() => bookSeat(driver.user_id)}
                              title={isMiaPrenotazione ? "Tocca per annullare la prenotazione" : undefined}
                              className={`text-xs px-2 py-1 rounded transition-all cursor-pointer ${isMiaPrenotazione
                                  ? "bg-green-600 text-white hover:bg-green-700"
                                  : isPiena
                                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                                    : "bg-blue-500 text-white hover:bg-blue-600"
                                }`}
                            >
                              {isMiaPrenotazione ? "Prenotato ✅" : isPiena ? "Auto piena ❌" : "Prenota"}
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
            <h2 className="text-lg font-bold mb-4 dark:text-white">👥 Partecipanti ({rsvps.length})</h2>
            {rsvps.length === 0 ? (
              <p className="text-gray-400 text-sm">Ancora nessuno...</p>
            ) : (
              <div className="space-y-3">
                {rsvps.map((r) => {
                  const name = r.user_profile?.display_name || "Utente";
                  return (
                    <div
                      key={r.id}
                      className="flex justify-between items-center py-2 border-b dark:border-gray-800 dark:text-gray-300 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full ${avatarColor(name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                        >
                          {initials(name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{name}</span>
                          {r.has_car && (
                            <span className="text-xs text-indigo-500 font-semibold">
                              🚗 {r.available_seats > 0 ? `${r.available_seats} posti liberi` : "Auto piena"}
                            </span>
                          )}
                          {r.driver_id && (
                            <span className="text-xs text-green-600 font-semibold">
                              🙋‍♂️ Con {r.driver_profile?.display_name || "Autista"}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-xs shrink-0 ${r.status === "Parteciperò" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
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
            <h2 className="text-lg font-bold mb-4 dark:text-white">📦 Cosa portiamo?</h2>

            <div className="flex gap-2 mb-4">
              <input
                id="item-input"
                type="text"
                placeholder="Es. Birra, Ghiaccio..."
                className="flex-1 p-2 rounded-lg border dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm"
                disabled={isAddingItem}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target.value.trim() !== "") {
                    addItem(e.target.value);
                    e.target.value = "";
                  }
                }}
              />
              <button
                disabled={isAddingItem}
                onClick={() => {
                  const input = document.getElementById("item-input");
                  if (input && input.value.trim() !== "") {
                    addItem(input.value);
                    input.value = "";
                  }
                }}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-bold rounded-lg text-sm transition-all active:scale-95 cursor-pointer"
              >
                {isAddingItem ? "..." : "Aggiungi"}
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-gray-400 text-sm">Nessun oggetto in lista, ancora.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const claimedByMe = item.assigned_to === user.id;
                  const claimedByOther = !!item.assigned_to && !claimedByMe;

                  return (
                    <div
                      key={item.id}
                      className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-2"
                    >
                      <span
                        className={
                          item.assigned_to ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"
                        }
                      >
                        {item.item_name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.assigned_to && (
                          <span className="text-xs text-gray-500">{item.profiles?.display_name || ""}</span>
                        )}
                        <button
                          disabled={claimedByOther}
                          onClick={() => (claimedByMe ? releaseItem(item.id) : claimItem(item.id))}
                          title={claimedByOther ? "Già prenotato da qualcun altro" : undefined}
                          className={`text-xs px-2 py-1 rounded font-medium transition ${claimedByMe
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : claimedByOther
                                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                : "bg-blue-500 text-white hover:bg-blue-600"
                            }`}
                        >
                          {claimedByMe ? "✅ Annulla" : claimedByOther ? "✅ Preso" : "Prenota"}
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-600 font-bold px-2"
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
        </>
      ) : (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 p-4 rounded-2xl text-center text-sm font-medium animate-fade-in">
          Hai indicato che non parteciperai a questo evento. Cambia la tua risposta per vedere la logistica e la
          checklist.
        </div>
      )}
    </div>
  );
}