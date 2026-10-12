import React, { useState, useEffect, useMemo } from 'react';
import type { Officer, DiaryEntry, LeaveRequest } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'react-hot-toast';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const CATEGORIES = ['General Duty', 'Field Duty', 'Meeting', 'Administrative', 'Legal', 'Training'];

/** All time by default: an officer looking for an old entry should not have to
 *  know its date first. */
type Period = 'ALL' | 'WEEK' | 'MONTH' | 'YEAR';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'ALL', label: 'All time' },
  { key: 'WEEK', label: 'This week' },
  { key: 'MONTH', label: 'This month' },
  { key: 'YEAR', label: 'This year' },
];

const toKey = (value: any): string => {
  if (!value) return '';
  if (value instanceof Date) return value.toLocaleDateString('en-CA');
  return String(value).slice(0, 10);
};

const OfficialJournal: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => (lang === 'SI' ? si : en);

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('ALL');
  const [showSystem, setShowSystem] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const blankForm = {
    title: '',
    content: '',
    category: 'General Duty',
    date: new Date().toLocaleDateString('en-CA'),
    outcomes: '',
    challenges: '',
  };
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Entries are read from the server. They used to live in React state
      // only, so every entry vanished on refresh.
      const [journalRes, leaveRes] = await Promise.allSettled([api.getJournal(), api.getMyLeaves()]);
      setEntries(journalRes.status === 'fulfilled' ? journalRes.value || [] : []);
      setLeaves(leaveRes.status === 'fulfilled' ? leaveRes.value || [] : []);
      if (journalRes.status === 'rejected') throw journalRes.reason;
    } catch (e: any) {
      toast.error(e.message || t('වාර්තා පූරණය අසාර්ථකයි', 'Could not load journal entries'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) {
      toast.error(t('සටහන අවශ්‍යයි', 'Please write what happened'));
      return;
    }
    setIsSaving(true);
    try {
      await api.saveJournalEntry(form);
      await loadData();
      setShowAddModal(false);
      setForm(blankForm);
      toast.success(t('සටහන සුරකින ලදී', 'Journal entry saved'));
    } catch (err: any) {
      toast.error(err.message || t('සුරැකීම අසාර්ථකයි', 'Could not save entry'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!window.confirm(t('මෙම සටහන ඉවත් කරන්නද?', 'Delete this journal entry?'))) return;
    try {
      await api.deleteJournalEntry(id);
      setEntries(prev => prev.filter(e => String(e.id) !== String(id)));
      toast.success(t('ඉවත් කරන ලදී', 'Entry deleted'));
    } catch (err: any) {
      toast.error(err.message || t('ඉවත් කිරීම අසාර්ථකයි', 'Could not delete entry'));
    }
  };

  /** Approved leave shown alongside the journal. This used to be hardcoded
   *  sample data; it now comes from the officer's real leave record and is off
   *  by default so it does not bury what they actually wrote. */
  const systemEntries: DiaryEntry[] = useMemo(() => {
    if (!showSystem) return [];
    return leaves
      .filter(l => l.status === 'APPROVED')
      .map(l => ({
        id: `sys-leave-${l.id}`,
        date: toKey(l.start_date),
        title: `${l.type} leave`,
        content: `${l.type} leave approved, ${toKey(l.start_date)} to ${toKey(l.end_date)}.${l.reason ? ` Reason: ${l.reason}` : ''}`,
        category: 'Administrative',
        type: 'SYSTEM_LEAVE',
      }));
  }, [leaves, showSystem]);

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === 'WEEK') {
      const d = new Date(now);
      d.setDate(now.getDate() - now.getDay());
      d.setHours(0, 0, 0, 0);
      return toKey(d);
    }
    if (period === 'MONTH') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    if (period === 'YEAR') return `${now.getFullYear()}-01-01`;
    return '';
  }, [period]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...entries, ...systemEntries]
      .filter(e => {
        if (category !== 'ALL' && (e.category || '') !== category) return false;
        if (periodStart && toKey(e.date) < periodStart) return false;
        if (!needle) return true;
        return [e.title, e.content, e.outcomes, e.challenges, e.category]
          .some(v => String(v || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => (toKey(b.date) < toKey(a.date) ? -1 : toKey(b.date) > toKey(a.date) ? 1 : 0));
  }, [entries, systemEntries, search, category, periodStart]);

  /** Grouped by day so a long list stays scannable. */
  const grouped = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    visible.forEach(e => {
      const key = toKey(e.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return [...map.entries()];
  }, [visible]);

  const totalOwn = entries.length;
  const isFiltered = search.trim() !== '' || category !== 'ALL' || period !== 'ALL';

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter">
            {t('නිල දිනපොත', 'Official Journal')}
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            {totalOwn} {totalOwn === 1 ? 'entry' : 'entries'} on record
          </p>
        </div>
        <button
          onClick={() => { setForm(blankForm); setShowAddModal(true); }}
          className="w-full sm:w-auto min-h-[52px] px-8 bg-[#1877F2] text-white rounded-[1.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          {t('නව සටහනක්', 'New Entry')}
        </button>
      </div>

      {/* Finding an entry used to mean stepping day by day through a calendar.
          Search across everything is the fastest route to an old record. */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-4 sm:p-6 space-y-4">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('සටහන් සොයන්න...', 'Search your entries...')}
            className="w-full min-h-[48px] pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`min-h-[40px] px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                period === p.key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {['ALL', ...CATEGORIES].map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`min-h-[40px] px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                category === c ? 'bg-[#1877F2] text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'
              }`}
            >
              {c === 'ALL' ? t('සියල්ල', 'All') : c}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-3 pt-2 border-t border-slate-100 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={showSystem}
            onChange={e => setShowSystem(e.target.checked)}
            className="w-5 h-5 rounded accent-[#1877F2]"
          />
          <span className="text-[11px] font-bold text-slate-500">
            {t('අනුමත නිවාඩු ද පෙන්වන්න', 'Also show approved leave from my record')}
          </span>
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="w-full h-28 rounded-[2rem]" />
          <Skeleton className="w-full h-28 rounded-[2rem]" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-slate-100 py-20 text-center space-y-3">
          <div className="text-5xl">📔</div>
          <p className="text-sm font-black text-slate-400">
            {isFiltered
              ? t('ගැළපෙන සටහන් නොමැත', 'No entries match those filters')
              : t('තවම සටහන් නොමැත', 'No journal entries yet')}
          </p>
          <p className="text-[11px] font-bold text-slate-300">
            {isFiltered
              ? t('සෙවුම හෝ පෙරහන් වෙනස් කරන්න', 'Try a different search or clear the filters')
              : t('ඔබගේ පළමු සටහන එක් කරන්න', 'Record your first entry with New Entry')}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, dayEntries]) => (
            <section key={date} className="space-y-3">
              <div className="flex items-center gap-3 sticky top-16 bg-[var(--background)] py-2 z-10">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-900">
                  {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </h3>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] font-black text-slate-400">{dayEntries.length}</span>
              </div>

              {dayEntries.map(entry => (
                <article
                  key={entry.id}
                  className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 sm:p-7 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {entry.title && (
                        <h4 className="text-base font-black text-slate-900 tracking-tight break-words">{entry.title}</h4>
                      )}
                      <span className="inline-block mt-1 px-3 py-1 bg-slate-50 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {entry.category || 'General Duty'}
                      </span>
                      {entry.type === 'SYSTEM_LEAVE' && (
                        <span className="inline-block mt-1 ml-2 px-3 py-1 bg-violet-50 rounded-full text-[10px] font-black uppercase tracking-widest text-violet-500">
                          {t('පද්ධතිය', 'From record')}
                        </span>
                      )}
                    </div>
                    {entry.type !== 'SYSTEM_LEAVE' && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors flex-none"
                        title={t('ඉවත් කරන්න', 'Delete entry')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{entry.content}</p>

                  {(entry.outcomes || entry.challenges) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                      {entry.outcomes && (
                        <div className="bg-emerald-50/60 rounded-2xl p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">{t('ප්‍රතිඵල', 'Outcomes')}</p>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">{entry.outcomes}</p>
                        </div>
                      )}
                      {entry.challenges && (
                        <div className="bg-amber-50/60 rounded-2xl p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">{t('අභියෝග', 'Challenges')}</p>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">{entry.challenges}</p>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92vh]">
            <header className="px-6 sm:px-10 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-[2.5rem]">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tighter">{t('නව සටහනක්', 'New Entry')}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('අද කළ දේ සටහන් කරන්න', 'Record what you did')}</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </header>

            <form onSubmit={handleAddEntry} className="p-6 sm:p-10 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('දිනය', 'Date')}</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full mt-2 min-h-[48px] px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('වර්ගය', 'Category')}</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full mt-2 min-h-[48px] px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('මාතෘකාව', 'Title')}</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder={t('කෙටි මාතෘකාවක්', 'A short heading makes it easy to find later')}
                  className="w-full mt-2 min-h-[48px] px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('විස්තරය', 'What happened')}</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={4}
                  required
                  className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-4 focus:ring-blue-50 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('ප්‍රතිඵල', 'Outcomes')}</label>
                  <textarea
                    value={form.outcomes}
                    onChange={e => setForm({ ...form, outcomes: e.target.value })}
                    rows={2}
                    className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-4 focus:ring-blue-50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('අභියෝග', 'Challenges')}</label>
                  <textarea
                    value={form.challenges}
                    onChange={e => setForm({ ...form, challenges: e.target.value })}
                    rows={2}
                    className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-4 focus:ring-blue-50 resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full min-h-[52px] bg-[#1877F2] text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
              >
                {isSaving ? t('සුරකිමින්...', 'Saving...') : t('සටහන සුරකින්න', 'Save Entry')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialJournal;
