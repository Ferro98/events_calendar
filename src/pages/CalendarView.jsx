import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/it'; 
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import 'react-big-calendar/lib/css/react-big-calendar.css';

moment.locale('it');
const localizer = momentLocalizer(moment);

export default function CalendarView() {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date()); // Stato per gestire la data corrente
  const [currentView, setCurrentView] = useState('month');    // Stato per gestire la vista (mese, settimana...)
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllEvents();
  }, []);

  const fetchAllEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*');

    if (!error && data) {
      const formattedEvents = data.map(evt => ({
        id: evt.id,
        title: evt.title,
        start: new Date(evt.start_time),
        end: new Date(evt.end_time),
      }));
      setEvents(formattedEvents);
    }
  };

  const handleSelectEvent = (event) => {
    navigate(`/event/${event.id}`);
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
  <div>
    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">📅 Calendario Squad</h1>
    <p className="text-sm text-gray-500 dark:text-gray-400">Tutti gli eventi pianificati</p>
  </div>
  <button 
    onClick={() => navigate('/')}
    className="w-full md:w-auto bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium py-2 px-4 rounded-lg transition hover:bg-gray-200 dark:hover:bg-gray-700"
  >
    🏠 Torna alla Home
  </button>
</div>

      <div className="h-[400px] md:h-[600px] text-sm font-sans">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          onSelectEvent={handleSelectEvent}
          
          // PROP AGGIUNTE PER AGGANCIARE I BOTTONI ALLO STATO DI REACT
          date={currentDate}
          onNavigate={(date) => setCurrentDate(date)}
          view={currentView}
          onView={(view) => setCurrentView(view)}
          
          messages={{
            next: "Successivo",
            previous: "Precedente",
            today: "Oggi",
            month: "Mese",
            week: "Settimana",
            day: "Giorno",
          }}
          eventPropGetter={() => ({
            className: '!bg-orange-500 !text-white !rounded-md !border-none !px-2 !py-0.5 shadow-sm font-medium hover:!bg-orange-600 transition cursor-pointer'
          })}
        />
      </div>
    </div>
  );
}