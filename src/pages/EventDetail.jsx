import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function EventDetail({ user }) {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchEventData();

    // Ascolta i cambiamenti in tempo reale su RSVP e Oggetti
    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps" },
        () => fetchEventData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_items" },
        () => fetchEventData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchEventData = async () => {
    // 1. Dati Evento
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (eventError) console.error("Errore eventi:", eventError);
    setEvent(eventData);

    // 2. Dati RSVP (DEBUG LOG aggiunto qui)
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

    // 3. Dati Oggetti
    const { data: itemsData, error: itemsError } = await supabase
      .from("event_items")
      .select("*, profiles(display_name)")
      .eq("event_id", id);

    if (itemsError) console.error("Errore items:", itemsError);
    setItems(itemsData || []);
  };

  const myRsvp = rsvps.find((r) => r.user_id === user.id);

  const isParticipating =
    myRsvp?.status === "Parteciperò" || myRsvp?.status === "Forse";

  const updateRSVP = async (status) => {
    // 1. SE CLICCA "NO": Liberiamo prima il posto auto in modo atomico sul DB
    if (status === "Non parteciperò" && myRsvp?.driver_id) {
      await supabase.rpc("book_seat_atomic", {
        p_event_id: id,
        p_user_id: user.id,
        p_driver_id: myRsvp.driver_id, // Passando lo stesso driver, la funzione toglie il posto e lo restituisce
      });
    }

    // 2. Prepariamo i dati per l'upsert dell'RSVP
    const rsvpData = {
      event_id: id,
      user_id: user.id,
      status: status,
    };

    // Se dice no, azzeriamo anche le sue info auto
    if (status === "Non parteciperò") {
      rsvpData.has_car = false;
      rsvpData.available_seats = 0;
      rsvpData.driver_id = null;
    }

    // 3. Eseguiamo l'aggiornamento dello stato dell'utente
    const { error } = await supabase
      .from("rsvps")
      .upsert(rsvpData, { onConflict: "event_id, user_id" });

    if (!error) fetchEventData();
  };

  if (!event) return <div className="dark:text-white p-4">Caricamento...</div>;

  const addItem = async (itemName) => {
    await supabase
      .from("event_items")
      .insert({ event_id: id, item_name: itemName });
    fetchEventData();
  };

  const toggleItem = async (itemId, currentAssignee) => {
    const newAssignee = currentAssignee === user.id ? null : user.id;
    await supabase
      .from("event_items")
      .update({ assigned_to: newAssignee })
      .eq("id", itemId);
    fetchEventData();
  };

  const updateCarpool = async (hasCar, seats) => {
    const { error } = await supabase
      .from("rsvps")
      .update({
        has_car: hasCar,
        available_seats: hasCar ? seats : 0,
        driver_id: hasCar ? null : myRsvp.driver_id, // Reset driver se modifichi
      })
      .eq("event_id", id)
      .eq("user_id", user.id);

    if (error) console.error("Errore carpool:", error);
    else fetchEventData();
  };

  const bookSeat = async (driverId) => {
    // Chiamiamo la funzione SQL atomica appena creata
    const { error } = await supabase.rpc("book_seat_atomic", {
      p_event_id: id,
      p_user_id: user.id,
      p_driver_id: driverId,
    });

    if (error) {
      // Se l'auto si è riempita nel frattempo, il DB solleverà l'eccezione 'L''auto è piena!'
      alert(error.message);
      console.error("Errore di concorrenza:", error.message);
    }

    // Ricarichiamo sempre i dati per sincronizzare la UI alla realtà del DB
    fetchEventData();
  };

  const removeItem = async (itemId) => {
    const { error } = await supabase
      .from("event_items")
      .delete()
      .eq("id", itemId);

    if (!error) fetchEventData();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">
          {event.title}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          📍 {event.location}
        </p>
      </div>

      {/* RSVP Section */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
        <h2 className="text-lg font-bold mb-4 dark:text-white">
          Parteciperai?
        </h2>

        <div className="flex w-full gap-2">
          <button
            onClick={() => updateRSVP("Parteciperò")}
            className="flex-1 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer active:scale-95 bg-green-500 hover:bg-green-600 text-white text-sm md:text-base"
          >
            Sì
          </button>
          <button
            onClick={() => updateRSVP("Forse")}
            className="flex-1 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer active:scale-95 bg-yellow-500 hover:bg-yellow-600 text-white text-sm md:text-base"
          >
            Forse
          </button>
          <button
            onClick={() => updateRSVP("Non parteciperò")}
            className="flex-1 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer active:scale-95 bg-red-500 hover:bg-red-600 text-white text-sm md:text-base"
          >
            No
          </button>
        </div>
      </div>

      {isParticipating ? (
        <>
          {/* Carpooling Management */}
          {/* Gestisci Passaggio - UI Modificata con Bottoni Posti */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              🚗 Gestisci Passaggio
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

              {/* Se l'utente offre la macchina, mostriamo i selettori da 0 a 4 */}
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

            {/* Sezione Prenotazione Posto (Se non sono il guidatore) */}
            {!myRsvp?.has_car && (
              <div className="mt-6 pt-4 border-t dark:border-gray-700">
                <h3 className="text-sm font-bold mb-3 dark:text-white">
                  Prenota un posto:
                </h3>
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
                          className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded"
                        >
                          <span className="text-sm dark:text-white">
                            {driver.user_profile?.display_name} (
                            {driver.available_seats} posti)
                          </span>
                          <button
                            disabled={isPiena && !isMiaPrenotazione}
                            onClick={() => bookSeat(driver.user_id)}
                            className={`text-xs px-2 py-1 rounded transition-all cursor-pointer ${
                              isMiaPrenotazione
                                ? "bg-green-600 text-white"
                                : isPiena
                                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                                  : "bg-blue-500 text-white hover:bg-blue-600"
                            }`}
                          >
                            {isMiaPrenotazione
                              ? "Prenotato ✅"
                              : isPiena
                                ? "Auto Piena ❌"
                                : "Prenota"}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Lista Partecipanti */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              👥 Partecipanti ({rsvps.length})
            </h2>
            {rsvps.length === 0 ? (
              <p className="text-gray-400 text-sm">Ancora nessuno...</p>
            ) : (
              <div className="space-y-3">
                {rsvps.map((r) => (
                  <div
                    key={r.id}
                    className="flex justify-between items-center py-2 border-b dark:border-gray-800 dark:text-gray-300"
                  >
                    <div className="flex flex-col">
                      {/* Nome dell'utente (ora si chiama user_profile) */}
                      <span className="font-medium">
                        {r.user_profile?.display_name || "Utente"}
                      </span>

                      {/* Info Guidatore */}
                      {r.has_car && (
                        <span className="text-xs text-indigo-500 font-semibold">
                          🚗{" "}
                          {r.available_seats > 0
                            ? `${r.available_seats} posti liberi`
                            : "Auto piena"}
                        </span>
                      )}

                      {/* Info Passeggero - Usa direttamente driver_profile */}
                      {r.driver_id && (
                        <span className="text-xs text-green-600 font-semibold">
                          🙋‍♂️ Con {r.driver_profile?.display_name || "Autista"}
                        </span>
                      )}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-xs ${r.status === "Parteciperò" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checklist Cose da Portare */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              📦 Cosa portiamo?
            </h2>

            {/* CONTENITORE FLEX AGGIORNATO */}
            <div className="flex gap-2 mb-4">
              <input
                id="item-input"
                type="text"
                placeholder="Es. Birra, Ghiaccio..."
                className="flex-1 p-2 rounded-lg border dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target.value.trim() !== "") {
                    addItem(e.target.value);
                    e.target.value = "";
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.getElementById("item-input");
                  if (input && input.value.trim() !== "") {
                    addItem(input.value);
                    input.value = "";
                  }
                }}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition-all active:scale-95 cursor-pointer"
              >
                Aggiungi
              </button>
            </div>

            {/* Sotto rimane invariato il ciclo items.map... */}

            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <span
                    className={
                      item.assigned_to
                        ? "line-through text-gray-400"
                        : "text-gray-800 dark:text-gray-200"
                    }
                  >
                    {item.item_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {item.profiles?.display_name || ""}
                    </span>
                    <button
                      onClick={() => toggleItem(item.id, item.assigned_to)}
                      className={`text-xs px-2 py-1 rounded ${item.assigned_to ? "bg-green-100 text-green-700" : "bg-blue-500 text-white"}`}
                    >
                      {item.assigned_to ? "✅" : "Prenota"}
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-400 hover:text-red-600 font-bold px-2"
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 p-4 rounded-2xl text-center text-sm font-medium animate-fade-in">
          Hai indicato che non parteciperai a questo evento. Cambia la tua
          risposta per vedere la logistica e la checklist.
        </div>
      )}
    </div>
  );
}
