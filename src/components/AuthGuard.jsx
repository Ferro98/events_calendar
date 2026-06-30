import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function AuthGuard({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    // Funzione per verificare se l'utente esiste ancora nel DB
    const checkUserIntegrity = async () => {
      const saved = localStorage.getItem("summer_squad_user");

      if (saved) {
        const userData = JSON.parse(saved);

        // Verifichiamo se l'ID salvato esiste ancora nella tabella profiles
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("id", userData.id)
          .maybeSingle();

        if (data && !error) {
          // Tutto ok, l'utente esiste
          setUser(data);
        } else {
          // L'utente non esiste più nel DB (o c'è stato un errore), puliamo tutto
          localStorage.removeItem("summer_squad_user");
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkUserIntegrity();
  }, []);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("display_name", name.trim())
      .maybeSingle();

    if (existingProfiles) {
      localStorage.setItem(
        "summer_squad_user",
        JSON.stringify(existingProfiles),
      );
      setUser(existingProfiles);
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .insert({ display_name: name.trim() })
        .select()
        .single();

      if (!error) {
        localStorage.setItem("summer_squad_user", JSON.stringify(data));
        setUser(data);
      }
    }
    setLoading(false);
  };

  if (loading)
    return (
      <div className="text-center p-10 dark:text-white">Caricamento...</div>
    );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <form
          onSubmit={handleJoin}
          className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 w-full max-w-sm"
        >
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
            Benvenuto in Summer Squad! 👋
          </h2>
          <input
            type="text"
            placeholder="Come ti chiami?"
            className="w-full p-3 border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white mb-4"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition">
            Entra
          </button>
        </form>
      </div>
    );
  }

  // Se l'utente esiste, mostriamo il contenuto protetto passando l'user
  return children({ user });
}
