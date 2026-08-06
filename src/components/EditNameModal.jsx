import { useState } from "react";

export default function EditNameModal({ initialName, onClose, onSave, saving }) {
  const [name, setName] = useState(initialName || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) {
      onClose();
      return;
    }
    onSave(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl p-6 space-y-4 border border-gray-100 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Modifica il tuo nome
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome e cognome"
            maxLength={80}
            className="w-full p-3 border rounded-xl text-sm bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
