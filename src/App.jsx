import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Home from "./pages/Home";
import CalendarView from "./pages/CalendarView";
import EventDetail from "./pages/EventDetail";
import Login from "./components/Login"; // Assicurati che il path sia corretto

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Funzione per recuperare il display_name dalla tabella profiles
  const fetchUserProfile = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setProfile(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Forziamo il tema scuro (come avevi impostato tu)
    document.documentElement.classList.add("dark");

    // 1. Controlla la sessione iniziale all'avvio
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Ascolta i cambi di stato (Login / Logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        fetchUserProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Gestione del Logout nativa di Supabase
  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Non serve ricaricare la pagina, ci pensa onAuthStateChange ad aggiornare la UI automaticamente!
  };

  // Schermata di caricamento (mentre controlla sessione o scarica il profilo)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div>
      </div>
    );
  }

  // SE NON È LOGGATO: Mostra solo la pagina di Login
  if (!session || !profile) {
    return <Login />;
  }

  // Uniamo i dati di autenticazione con quelli del profilo in un unico oggetto comodo
  const currentUser = {
    id: session.user.id,
    email: session.user.email,
    display_name: profile.display_name,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 mb-8 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex justify-between items-center">
          <a
            href="/"
            className="text-2xl font-black text-orange-500 tracking-tight"
          >
            ☀️ Summer Squad
          </a>
          <div className="flex items-center gap-4">
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-100 dark:border-orange-900 text-orange-800 dark:text-orange-300 px-4 py-1.5 rounded-full font-semibold text-sm">
              Ciao, {currentUser.display_name}! 👋
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer px-2 py-1"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        <Routes>
          <Route path="/" element={<Home user={currentUser} />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route
            path="/event/:id"
            element={<EventDetail user={currentUser} />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
