import { useState, useEffect, useMemo } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "moment/locale/it";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "react-big-calendar/lib/css/react-big-calendar.css";

moment.locale("it");
const localizer = momentLocalizer(moment);

// react-big-calendar non ha uno stile dark-mode nativo: i suoi colori sono
// scritti come CSS fisso nel suo stylesheet. Per integrarlo con il resto
// dell'app (che usa la strategia "dark" di Tailwind) sovrascriviamo qui le
// classi rbc-* sia in chiaro che sotto .dark, invece di lottare con
// dark: su elementi che React non controlla direttamente.
const calendarStyleOverrides = `
  .calendar-shell .rbc-toolbar { display: none; }
  .calendar-shell .rbc-month-view,
  .calendar-shell .rbc-time-view,
  .calendar-shell .rbc-agenda-view table {
    border-color: #f3f4f6;
    border-radius: 14px;
    overflow: hidden;
  }
  .calendar-shell .rbc-header {
    padding: 10px 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9ca3af;
    border-color: #f3f4f6;
  }
  .calendar-shell .rbc-day-bg + .rbc-day-bg,
  .calendar-shell .rbc-month-row + .rbc-month-row,
  .calendar-shell .rbc-time-content,
  .calendar-shell .rbc-timeslot-group,
  .calendar-shell .rbc-time-header-content {
    border-color: #f3f4f6;
  }
  .calendar-shell .rbc-off-range-bg { background: #fafafa; }
  .calendar-shell .rbc-off-range { color: #d1d5db; }
  .calendar-shell .rbc-today { background-color: rgba(249, 115, 22, 0.08); }
  .calendar-shell .rbc-date-cell {
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
  }
  .calendar-shell .rbc-date-cell.rbc-now { color: #f97316; font-weight: 800; }
  .calendar-shell .rbc-show-more { color: #f97316; font-weight: 700; font-size: 11px; }
  .calendar-shell .rbc-label { color: #9ca3af; font-size: 11px; }
  .calendar-shell .rbc-agenda-view table.rbc-agenda-table { border-color: #f3f4f6; }
  .calendar-shell .rbc-agenda-view table.rbc-agenda-table thead {
    color: #9ca3af;
    font-size: 11px;
    text-transform: uppercase;
  }
  .calendar-shell .rbc-agenda-time-cell { color: #6b7280; }

  .dark .calendar-shell .rbc-month-view,
  .dark .calendar-shell .rbc-time-view,
  .dark .calendar-shell .rbc-agenda-view table {
    border-color: #1f2937;
  }
  .dark .calendar-shell .rbc-header { color: #6b7280; border-color: #1f2937; }
  .dark .calendar-shell .rbc-day-bg + .rbc-day-bg,
  .dark .calendar-shell .rbc-month-row + .rbc-month-row,
  .dark .calendar-shell .rbc-time-content,
  .dark .calendar-shell .rbc-timeslot-group,
  .dark .calendar-shell .rbc-time-header-content {
    border-color: #1f2937;
  }
  .dark .calendar-shell .rbc-off-range-bg { background: #111827; }
  .dark .calendar-shell .rbc-off-range { color: #4b5563; }
  .dark .calendar-shell .rbc-today { background-color: rgba(249, 115, 22, 0.12); }
  .dark .calendar-shell .rbc-date-cell { color: #9ca3af; }
  .dark .calendar-shell .rbc-label { color: #6b7280; }
  .dark .calendar-shell .rbc-agenda-view table.rbc-agenda-table { border-color: #1f2937; color: #e5e7eb; }
  .dark .calendar-shell .rbc-agenda-view table.rbc-agenda-table thead { color: #6b7280; }
  .dark .calendar-shell .rbc-agenda-time-cell { color: #9ca3af; }
`;

const VIEWS = [
  { key: "month", label: "Mese" },
  { key: "week", label: "Settimana" },
  { key: "day", label: "Giorno" },
  { key: "agenda", label: "Agenda" },
];

const getEventStatus = (event) => {
  const now = Date.now();
  const start = event.start.getTime();
  const end = event.end.getTime();
  if (now >= start && now <= end) return "live";
  if (now > end) return "ended";
  return "upcoming";
};

function CustomToolbar({ label, view, onNavigate, onView }) {
  return (
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate("PREV")}
          aria-label="Periodo precedente"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          ‹
        </button>
        <button
          onClick={() => onNavigate("TODAY")}
          className="px-3 h-8 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          Oggi
        </button>
        <button
          onClick={() => onNavigate("NEXT")}
          aria-label="Periodo successivo"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          ›
        </button>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 capitalize ml-2">{label}</h2>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 self-start sm:self-auto overflow-x-auto">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => onView(v.key)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${view === v.key
              ? "bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-300 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="h-[400px] md:h-[600px] rounded-2xl bg-gray-50 dark:bg-gray-800/40 animate-pulse" />
  );
}

export default function CalendarView() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState("month");
  const navigate = useNavigate();

  const fetchAllEvents = async () => {
    setIsLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.from("events").select("*");

    if (error) {
      setErrorMsg("Impossibile caricare gli eventi: " + error.message);
    } else if (data) {
      const formattedEvents = data.map((evt) => ({
        id: evt.id,
        title: evt.title,
        location: evt.location,
        start: new Date(evt.start_time),
        end: new Date(evt.end_time),
      }));
      setEvents(formattedEvents);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllEvents();
  }, []);

  const handleSelectEvent = (event) => {
    navigate(`/event/${event.id}`);
  };

  const eventPropGetter = (event) => {
    const status = getEventStatus(event);
    const base = "!rounded-md !border-none !px-2 !py-0.5 shadow-sm font-medium transition cursor-pointer";

    if (status === "live") {
      return { className: `${base} !bg-emerald-500 !text-white hover:!bg-emerald-600` };
    }
    if (status === "ended") {
      return {
        className: `${base} !bg-gray-200 dark:!bg-gray-700 !text-gray-500 dark:!text-gray-400 hover:!opacity-80`,
      };
    }
    return { className: `${base} !bg-orange-500 !text-white hover:!bg-orange-600` };
  };

  const tooltipAccessor = (event) =>
    `${event.title}\n🕒 ${moment(event.start).format("HH:mm")} - ${moment(event.end).format("HH:mm")}${event.location ? `\n📍 ${event.location}` : ""
    }`;

  const counts = useMemo(() => {
    let live = 0;
    let upcoming = 0;
    for (const e of events) {
      const status = getEventStatus(e);
      if (status === "live") live += 1;
      else if (status === "upcoming") upcoming += 1;
    }
    return { live, upcoming, total: events.length };
  }, [events]);

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
      <style>{calendarStyleOverrides}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">📅 Calendario Squad</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {counts.total === 0
              ? "Nessun evento pianificato"
              : `${counts.total} eventi in totale${counts.live > 0 ? ` · ${counts.live} in corso ora` : ""}`}
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="w-full md:w-auto bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium py-2 px-4 rounded-lg transition hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          🏠 Torna alla Home
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 rounded-xl flex items-center justify-between gap-3">
          {errorMsg}
          <button
            onClick={fetchAllEvents}
            className="shrink-0 text-xs font-bold underline underline-offset-2 hover:text-rose-700 dark:hover:text-rose-300"
          >
            Riprova
          </button>
        </div>
      )}

      {isLoading ? (
        <CalendarSkeleton />
      ) : (
        <>
          <div className="calendar-shell h-[400px] md:h-[600px] text-sm font-sans">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              onSelectEvent={handleSelectEvent}
              date={currentDate}
              onNavigate={(date) => setCurrentDate(date)}
              view={currentView}
              onView={(view) => setCurrentView(view)}
              tooltipAccessor={tooltipAccessor}
              popup
              messages={{
                next: "Successivo",
                previous: "Precedente",
                today: "Oggi",
                month: "Mese",
                week: "Settimana",
                day: "Giorno",
                agenda: "Agenda",
                noEventsInRange: "Nessun evento in questo periodo.",
                showMore: (total) => `+${total} altri`,
              }}
              components={{ toolbar: CustomToolbar }}
              eventPropGetter={eventPropGetter}
            />
          </div>

          <div className="flex items-center gap-4 mt-4 px-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> In programma
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> In corso
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Concluso
            </span>
          </div>
        </>
      )}
    </div>
  );
}