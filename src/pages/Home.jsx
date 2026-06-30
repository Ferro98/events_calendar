import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function Home({ user }) {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('events')
      .select('*, profiles(display_name)')
      .gte('start_time', now.toISOString())
      .lte('start_time', nextWeek.toISOString())
      .order('start_time', { ascending: true });

    if (!error && data) setEvents(data);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!title || !startTime || !endTime) return;

    const { error } = await supabase.from('events').insert({
      title, description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      location,
      creator_id: user.id
    });

    if (!error) {
      setTitle(''); setDescription(''); setStartTime(''); setEndTime(''); setLocation('');
      fetchUpcomingEvents();
    } else {
      alert("Errore: " + error.message);
    }
  };

  // Classe comune per gli input
  const inputClass = "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 h-fit">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-50 mb-4">🆕 Crea Evento</h2>
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Titolo</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Grigliata" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Descrizione</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={inputClass} rows="2" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Inizio</label>
            <input type="datetime-local" required value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Fine</label>
            <input type="datetime-local" required value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Posto</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg text-sm transition">
            Pubblica Evento 🎉
          </button>
        </form>
      </div>

      <div className="md:col-span-2 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-50">🔥 Prossimi 7 giorni</h2>
          <Link to="/calendar" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition shadow-sm">
            📅 Vedi Calendario
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            Nessun evento in programma.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <Link to={`/event/${event.id}`} key={event.id} className="block bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-orange-500 transition group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 group-hover:text-orange-500 transition">{event.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">📍 {event.location || 'Nessuna posizione'}</p>
                  </div>
                  <div className="text-right bg-orange-50 dark:bg-orange-950 p-3 rounded-xl min-w-[90px]">
                    <span className="block text-sm font-bold text-orange-700 dark:text-orange-300">
                      {new Date(event.start_time).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}