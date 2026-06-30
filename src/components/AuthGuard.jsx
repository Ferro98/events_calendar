import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function AuthGuard({ children }) {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Controlla se c'è già un utente salvato localmente
    const savedUser = localStorage.getItem('summer_squad_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);

    // 1. Cerchiamo se esiste già un profilo con questo nome
    const { data: existingProfiles, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('display_name', name.trim())
      .maybeSingle(); // maybeSingle non crasha se non trova nulla

    if (existingProfiles) {
      // Se esiste, usiamo quello esistente
      localStorage.setItem('summer_squad_user', JSON.stringify(existingProfiles));
      setUser(existingProfiles);
    } else {
      // 2. Se non esiste, lo creiamo
      const { data, error } = await supabase
        .from('profiles')
        .insert({ display_name: name.trim() })
        .select()
        .single();

      if (error) {
        alert("Errore durante la creazione del profilo: " + error.message);
      } else {
        localStorage.setItem('summer_squad_user', JSON.stringify(data));
        setUser(data);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-amber-50">
        <p className="text-xl font-semibold text-amber-700 animate-pulse">Caricamento dell'estate...</p>
      </div>
    );
  }

  // Se l'utente non è registrato nel localStorage, mostriamo la schermata di benvenuto
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-amber-100 to-orange-200 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-amber-200">
          <h1 className="text-3xl font-black text-center text-orange-600 mb-2">☀️ Summer Squad</h1>
          <p className="text-center text-gray-600 mb-6">Organizza le vacanze e le serate con i tuoi amici.</p>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Come ti chiamano gli amici?</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Andrea, Pippo, Tarzan..."
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition duration-200 shadow-md"
            >
              Entra nell'App 🚀
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Se l'utente esiste, passiamo i suoi dati ai componenti figli tramite una prop
  return typeof children === 'function' ? children({ user }) : children;
}