import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Officer } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';
import ChartErrorBoundary from '../components/ChartErrorBoundary';
import { generateContent } from '../service/ai';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const LONG_LEAVE_LABELS: Record<string, { en: string; si: string; chip: string }> = {
  FOREIGN:   { en: 'Foreign',   si: 'විදේශ',      chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  LOCAL:     { en: 'Local',     si: 'දේශීය',      chip: 'bg-teal-50 text-teal-700 border-teal-200' },
  MATERNITY: { en: 'Maternity', si: 'ප්‍රසූත',     chip: 'bg-pink-50 text-pink-700 border-pink-200' },
  MEDICAL:   { en: 'Medical',   si: 'වෛද්‍ය',      chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  STUDY:     { en: 'Study',     si: 'අධ්‍යයන',     chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  SPECIAL:   { en: 'Special',   si: 'විශේෂ',      chip: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const fmtDate = (key?: string | null) => {
  if (!key) return '—';
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(key);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ExecutiveIntelligence: React.FC<Props> = ({ user, lang }) => {
  const [snap, setSnap] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [postsOpen, setPostsOpen] = useState(false);

  const t = (si: string, en: string) => (lang === 'SI' ? si : en);

  useEffect(() => { loadSnapshot(); }, []);

  const loadSnapshot = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getIntelligenceSnapshot(new Date().toLocaleDateString('en-CA'));
      setSnap(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load the division snapshot');
    } finally {
      setIsLoading(false);
    }
  };

  const runBriefing = async () => {
    if (!snap) return;
    setIsAiLoading(true);
    setAiReport(null);
    try {
      const text = await generateContent({
        contents:
          'You are briefing the Divisional Secretary of a Sri Lankan Divisional Secretariat. ' +
          'Write four short sentences of plain prose on what today’s figures mean and what needs attention. ' +
          'Do not invent numbers beyond those given. Figures: ' +
          JSON.stringify({
            headcount: snap.headcount,
            today: snap.today,
            tomorrow: snap.tomorrow,
            departments: snap.by_department,
            long_leave: (snap.long_leave || []).map((l: any) => ({ type: l.type, status: l.status })),
            pending_approvals: snap.pending_approvals,
            average_rate_30d: snap.average_rate_30d,
          }),
      });
      setAiReport(text);
    } catch (e: any) {
      setAiReport(`Briefing unavailable: ${e?.message || 'the AI service did not respond'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const awayNow = useMemo(
    () => (snap?.long_leave || []).filter((l: any) => l.status === 'AWAY'),
    [snap],
  );
  const upcoming = useMemo(
    () => (snap?.long_leave || []).filter((l: any) => l.status === 'UPCOMING'),
    [snap],
  );

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6 pb-24">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !snap) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-sm font-black text-rose-600 uppercase tracking-widest">
          {t('දත්ත ලබා ගත නොහැක', 'Snapshot unavailable')}
        </p>
        <p className="text-xs text-slate-500 mt-2">{error}</p>
        <button
          onClick={loadSnapshot}
          className="mt-6 px-5 py-3 min-h-[44px] bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
        >
          {t('නැවත උත්සාහ කරන්න', 'Try again')}
        </button>
      </div>
    );
  }

  const { headcount, today, tomorrow, by_department, by_post, trend } = snap;

  // The six numbers an executive is asked for first.
  const tiles = [
    { k: t('මුළු නිලධාරීන්', 'Total Officers'), v: headcount.total,
      sub: `${headcount.office} ${t('කාර්යාලීය', 'office')} · ${headcount.field} ${t('ක්ෂේත්‍ර', 'field')}`,
      tone: 'text-slate-800' },
    { k: t('සක්‍රීය නිලධාරීන්', 'Active Officers'), v: headcount.active,
      sub: t('දිගු නිවාඩු හැර', 'excludes long leave'), tone: 'text-blue-600' },
    { k: t('දිගු නිවාඩු', 'On Long Leave'), v: headcount.on_long_leave,
      sub: upcoming.length ? `${upcoming.length} ${t('ඉදිරියේදී', 'upcoming')}` : t('දැනට', 'currently away'),
      tone: 'text-violet-600' },
    { k: t('අද පැමිණ ඇත', 'Present Today'), v: today.present,
      sub: today.half_day ? `${today.half_day} ${t('අර්ධ දින', 'half day')}` : `${t('අපේක්ෂිත', 'of')} ${today.expected}`,
      tone: 'text-emerald-600' },
    { k: t('අද නිවාඩු', 'On Leave Today'), v: today.on_leave,
      sub: today.no_record ? `${today.no_record} ${t('වාර්තාවක් නැත', 'no record')}` : t('අනුමත නිවාඩු', 'approved leave'),
      tone: 'text-amber-600' },
    { k: t('අද පැමිණීමේ අනුපාතය', 'Attendance Rate'), v: today.attendance_rate === null ? '—' : `${today.attendance_rate}%`,
      sub: `${t('මස 1 සාමාන්‍යය', '30-day avg')} ${snap.average_rate_30d}%`, tone: 'text-indigo-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-slate-100 pb-5 pt-2">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">
              {t('අංශ බුද්ධි කේන්ද්‍රය', 'Division Intelligence')}
            </p>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-800 tracking-tighter leading-none mt-1">
            {t('විධායක සාරාංශය', 'Executive Snapshot')}
          </h2>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
            {fmtDate(snap.date)}
            {!today.is_working_day && (
              <span className="ml-2 text-rose-500">
                · {today.holiday_name || t('නිවාඩු දිනයකි', 'Non-working day')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={loadSnapshot}
          className="px-4 py-2.5 min-h-[44px] bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300"
        >
          ↻ {t('යාවත්කාලීන', 'Refresh')}
        </button>
      </div>

      {/* Headline figures. The number is the chart - no plot earns its place here. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {tiles.map((c) => (
          <div key={c.k} className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/70 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">{c.k}</p>
            <p className={`text-3xl sm:text-4xl font-black tracking-tighter mt-2 tabular-nums ${c.tone}`}>{c.v}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Tomorrow + actionable items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 text-white p-5 sm:p-7 rounded-3xl shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">
                {t('හෙට පුරෝකථනය', 'Tomorrow')}
              </p>
              <h3 className="text-xl font-black tracking-tight mt-0.5">{fmtDate(tomorrow.date)}</h3>
            </div>
            <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
              tomorrow.is_working_day
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {tomorrow.is_working_day ? t('වැඩ කරන දිනයකි', 'Working day') : (tomorrow.holiday_name || t('නිවාඩු', 'Holiday'))}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { k: t('අපේක්ෂිත පැමිණීම', 'Expected in'), v: tomorrow.expected_present, tone: 'text-emerald-400' },
              { k: t('අනුමත නිවාඩු', 'On leave'), v: tomorrow.on_leave, tone: 'text-amber-400' },
              { k: t('දිගු නිවාඩු', 'Long leave'), v: tomorrow.on_long_leave, tone: 'text-violet-400' },
              { k: t('නැවත පැමිණේ', 'Returning'), v: tomorrow.returning, tone: 'text-blue-400' },
            ].map((m) => (
              <div key={m.k} className="bg-white/5 rounded-2xl p-3">
                <p className={`text-2xl font-black tabular-nums ${m.tone}`}>{m.v}</p>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-tight">{m.k}</p>
              </div>
            ))}
          </div>

          {!tomorrow.is_working_day && (
            <p className="text-[10px] text-slate-400 font-bold mt-4">
              {t('හෙට වැඩ නොකරන දිනයක් බැවින් පැමිණීමක් අපේක්ෂා නොකෙරේ.',
                 'Tomorrow is not a working day, so no attendance is expected.')}
            </p>
          )}
        </div>

        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              {t('ඔබගේ අවධානයට', 'Needs your attention')}
            </p>
            <p className="text-5xl font-black text-amber-500 tracking-tighter mt-3 tabular-nums">
              {snap.pending_approvals}
            </p>
            <p className="text-[11px] font-bold text-slate-500 mt-1">
              {t('අනුමැතිය බලාපොරොත්තු වන නිවාඩු', 'leave requests awaiting approval')}
            </p>
          </div>
          {today.no_record > 0 && today.is_working_day && (
            <p className="text-[10px] font-bold text-slate-400 mt-5 pt-4 border-t border-slate-100 leading-relaxed">
              {today.no_record} {t('නිලධාරීන්ට අද කිසිදු පැමිණීමේ වාර්තාවක් නොමැත.',
                                   'officers have no attendance record for today yet.')}
            </p>
          )}
        </div>
      </div>

      {/* Attendance over time. One series, so the title names it and no legend
          box is needed; the plot stays thin and the grid recessive. */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">
              {t('පැමිණීමේ අනුපාතය — පසුගිය දින 30', 'Attendance rate — last 30 days')}
            </h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
              {t('වැඩ කරන දින පමණි', 'Working days only')}
            </p>
          </div>
          <p className="text-2xl font-black text-indigo-600 tabular-nums">{snap.average_rate_30d}%</p>
        </div>

        {trend.length === 0 ? (
          <p className="py-14 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">
            {t('ප්‍රවණතාවක් පෙන්වීමට ප්‍රමාණවත් දත්ත නොමැත', 'Not enough attendance data to draw a trend')}
          </p>
        ) : (
          <ChartErrorBoundary>
            <div className="h-56 sm:h-64 mt-5 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeWidth={1} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
                    }}
                    labelFormatter={(_l, p) => fmtDate(p?.[0]?.payload?.date)}
                    formatter={(v: any, _n: any, p: any) =>
                      [`${v}% · ${p?.payload?.present} ${t('නිලධාරීන්', 'officers')}`, t('පැමිණීම', 'Attendance')]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fill="url(#attendanceFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartErrorBoundary>
        )}
      </div>

      {/* Department coverage. A table, not a pie: four measures per row. */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
        <h3 className="text-base font-black text-slate-800 tracking-tight">
          {t('අංශ අනුව', 'By section')}
        </h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
          {t('සේවක සංඛ්‍යාව සහ අද ආවරණය', 'Headcount and today’s coverage')}
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-2.5 pr-3">{t('අංශය', 'Section')}</th>
                <th className="pb-2.5 px-3 text-right">{t('සේවකයින්', 'Staff')}</th>
                <th className="pb-2.5 px-3 text-right">{t('පැමිණ', 'Present')}</th>
                <th className="pb-2.5 px-3 text-right">{t('නිවාඩු', 'Leave')}</th>
                <th className="pb-2.5 px-3 text-right">{t('දිගු', 'Long')}</th>
                <th className="pb-2.5 pl-3 w-40">{t('ආවරණය', 'Coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {by_department.map((d: any) => (
                <tr key={d.name} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pr-3 text-xs font-black text-slate-700">{d.name}</td>
                  <td className="py-3 px-3 text-xs font-bold text-slate-600 text-right tabular-nums">{d.headcount}</td>
                  <td className="py-3 px-3 text-xs font-black text-emerald-600 text-right tabular-nums">{d.present}</td>
                  <td className="py-3 px-3 text-xs font-bold text-amber-600 text-right tabular-nums">{d.on_leave}</td>
                  <td className="py-3 px-3 text-xs font-bold text-violet-600 text-right tabular-nums">{d.long_leave}</td>
                  <td className="py-3 pl-3">
                    {d.coverage === null ? (
                      <span className="text-[10px] font-bold text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              d.coverage >= 80 ? 'bg-emerald-500' : d.coverage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, d.coverage)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-slate-600 tabular-nums w-9 text-right">
                          {d.coverage}%
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Long leave roster */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">
              {t('දිගුකාලීන නිවාඩු', 'Long-term leave')}
            </h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
              {awayNow.length} {t('දැනට ඉවත්ව', 'away now')} · {upcoming.length} {t('ඉදිරියේදී', 'upcoming')}
            </p>
          </div>
        </div>

        {!snap.long_leave.length ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl mt-5">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              {t('දිගුකාලීන නිවාඩු වාර්තා නොමැත', 'No long-term leave recorded')}
            </p>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {t('ජෛවමිතික මධ්‍යස්ථානයේ එකතු කරන්න.', 'Record these in the Biometric Hub.')}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-2.5">
            {snap.long_leave.map((l: any) => {
              const label = LONG_LEAVE_LABELS[l.type] || { en: l.type, si: l.type, chip: 'bg-slate-50 text-slate-600 border-slate-200' };
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border ${
                    l.status === 'AWAY' ? 'bg-slate-50/70 border-slate-150' : 'bg-white border-dashed border-slate-200'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {l.officer_pic
                      ? <img src={l.officer_pic} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[10px] font-black text-slate-500">
                          {String(l.officer_name || '?').split(/\s+/).slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()}
                        </span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-slate-800 truncate">{l.officer_name}</p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${label.chip}`}>
                        {t(label.si, label.en)}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 truncate">
                      {l.officer_post || l.officer_department || '—'} · {fmtDate(l.start_date)} → {fmtDate(l.end_date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {l.status === 'AWAY' ? (
                      <>
                        <p className="text-sm font-black text-slate-700 tabular-nums">{l.days_remaining}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          {t('දින ඉතිරි', 'days left')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-black text-blue-600 tabular-nums">{l.starts_in_days}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          {t('දිනකින්', 'days away')}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* On leave today */}
      {snap.on_leave_today.length > 0 && (
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className="text-base font-black text-slate-800 tracking-tight">
            {t('අද නිවාඩු ලබා සිටින නිලධාරීන්', 'Unavailable today')}
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {snap.on_leave_today.map((o: any) => (
              <div key={`${o.officer_id}-${o.until}`} className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[11px] font-black text-amber-900">{o.name}</p>
                <p className="text-[8px] font-black text-amber-700/70 uppercase tracking-widest">
                  {o.type} · {t('දක්වා', 'until')} {fmtDate(o.until)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Designation breakdown */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
        <button
          onClick={() => setPostsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 text-left min-h-[44px]"
        >
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">
              {t('තනතුර අනුව', 'By designation')}
            </h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
              {by_post.length} {t('වෙනස් තනතුරු', 'distinct posts')}
            </p>
          </div>
          <span className="text-slate-400 text-xs font-black">{postsOpen ? '▲' : '▼'}</span>
        </button>

        {postsOpen && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {by_post.map((p: any) => (
              <div key={p.name} className="flex items-center gap-3 py-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-600 flex-1 truncate">{p.name}</span>
                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-slate-400 rounded-full"
                    style={{ width: `${Math.round((p.count / (by_post[0]?.count || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-black text-slate-800 tabular-nums w-8 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Written briefing */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">
              {t('ලිඛිත සාරාංශය', 'Written briefing')}
            </h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
              {t('ඉහත සංඛ්‍යා මත පදනම්ව', 'Generated from the figures above')}
            </p>
          </div>
          <button
            onClick={runBriefing}
            disabled={isAiLoading}
            className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
          >
            {isAiLoading ? t('සකසමින්…', 'Writing…') : t('සාරාංශය ලියන්න', 'Write briefing')}
          </button>
        </div>
        {aiReport && (
          <p className="mt-5 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{aiReport}</p>
        )}
      </div>
    </div>
  );
};

export default ExecutiveIntelligence;
