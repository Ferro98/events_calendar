import { Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import Home from "./pages/Home";
import CalendarView from "./pages/CalendarView";
import { useEffect } from "react";
import EventDetail from "./pages/EventDetail";

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("summer_squad_user");
    window.location.reload(); // Ricarica la pagina per tornare al login
  };

  return (
    <AuthGuard>
      {({ user }) => (
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
                  Ciao, {user.display_name}! 👋
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
              <Route path="/" element={<Home user={user} />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/event/:id" element={<EventDetail user={user} />} />
            </Routes>
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
