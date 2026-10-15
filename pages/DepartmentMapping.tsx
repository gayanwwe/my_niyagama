import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Officer } from '../types';
import { api } from '../service/api';

/**
 * Department Deployment Hub — a spatial floor plan per section.
 *
 * The plan is a grid of cells. Every element carries x/y/w/h in cells rather
 * than pixels, so the same plan renders identically at any zoom and on any
 * screen. Cell geometry is what makes a plan reproducible: a 6x3 desk against
 * the north wall stays a 6x3 desk against the north wall on a phone.
 */

type ElementKind =
  | 'FLOOR'      // the room itself; carries the plan's dimensions
  | 'DESK'
  | 'SEAT'       // an officer position (the old 'OFFICER' element)
  | 'COUNTER'
  | 'CABINET'
  | 'EQUIPMENT'
  | 'WALL'
  | 'DOOR'
  | 'WINDOW'
  | 'LABEL';

type ResourceCategory = 'FRONT_COUNTER' | 'BACK_OFFICE' | 'EXECUTIVE' | 'SUPPORT_DESK';

interface LayoutElement {
  id: string;
  type: ElementKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: 0 | 90 | 180 | 270;
  zone_id: string;
  zone_name: string;
  // SEAT only
  officer_id?: string | number;
  category?: ResourceCategory;
  extension?: string;
  equipment?: string;
  status?: 'ACTIVE' | 'PENDING' | 'OFFLINE';
}

const CELL = 24;                  // px per grid cell at 100% zoom
const DEFAULT_FLOOR = { w: 40, h: 26 };
const GRID_MAX = 400;
const MAX_ELEMENTS = 500;

interface KindSpec {
  kind: ElementKind;
  label: string;
  icon: string;
  w: number;
  h: number;
  z: number;                      // paint order — seats must sit above desks
  body: string;                   // tailwind classes for the element body
  text: string;
}

const KINDS: Record<Exclude<ElementKind, 'FLOOR'>, KindSpec> = {
  DESK:      { kind: 'DESK',      label: 'Table / Desk',  icon: '🪑', w: 6, h: 3, z: 2, body: 'bg-amber-100/90 border-amber-300',  text: 'text-amber-900' },
  SEAT:      { kind: 'SEAT',      label: 'Officer Seat',  icon: '👤', w: 3, h: 3, z: 4, body: 'bg-white border-slate-300',         text: 'text-slate-700' },
  COUNTER:   { kind: 'COUNTER',   label: 'Public Counter',icon: '🗣️', w: 8, h: 2, z: 2, body: 'bg-teal-100/90 border-teal-300',    text: 'text-teal-900' },
  CABINET:   { kind: 'CABINET',   label: 'Cabinet / File',icon: '🗄️', w: 2, h: 4, z: 2, body: 'bg-slate-200/90 border-slate-400',  text: 'text-slate-700' },
  EQUIPMENT: { kind: 'EQUIPMENT', label: 'Equipment',     icon: '🖨️', w: 2, h: 2, z: 3, body: 'bg-violet-100/90 border-violet-300',text: 'text-violet-900' },
  WALL:      { kind: 'WALL',      label: 'Wall',          icon: '🧱', w: 8, h: 1, z: 1, body: 'bg-slate-700 border-slate-800',     text: 'text-white' },
  DOOR:      { kind: 'DOOR',      label: 'Door',          icon: '🚪', w: 3, h: 1, z: 1, body: 'bg-emerald-200 border-emerald-500', text: 'text-emerald-900' },
  WINDOW:    { kind: 'WINDOW',    label: 'Window',        icon: '🪟', w: 6, h: 1, z: 1, body: 'bg-sky-200 border-sky-400',         text: 'text-sky-900' },
  LABEL:     { kind: 'LABEL',     label: 'Text Label',    icon: '🏷️', w: 6, h: 2, z: 5, body: 'bg-transparent border-dashed border-slate-300', text: 'text-slate-500' },
};

const PALETTE_ORDER: Exclude<ElementKind, 'FLOOR'>[] = [
  'SEAT', 'DESK', 'COUNTER', 'CABINET', 'EQUIPMENT', 'WALL', 'DOOR', 'WINDOW', 'LABEL',
];

const CATEGORIES: { id: ResourceCategory; label: string; icon: string; ring: string; chip: string }[] = [
  { id: 'EXECUTIVE',     label: 'Executive',     icon: '👑', ring: 'ring-indigo-400', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'FRONT_COUNTER', label: 'Front Counter', icon: '🗣️', ring: 'ring-teal-400',   chip: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'BACK_OFFICE',   label: 'Back Office',   icon: '🏛️', ring: 'ring-slate-400',  chip: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'SUPPORT_DESK',  label: 'Support & Tech',icon: '⚙️', ring: 'ring-amber-400',  chip: 'bg-amber-50 text-amber-700 border-amber-200' },
];

const uid = (prefix = 'el') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const initialsOf = (name?: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/**
 * Accepts both the current shape and the pre-floor-plan one, where every
 * element was `type: 'OFFICER'` with no coordinates at all. Those get laid out
 * in reading order so an existing section opens as a usable plan instead of a
 * pile of elements at 0,0.
 */
const normaliseElements = (raw: any[], floorW: number): LayoutElement[] => {
  let autoIndex = 0;
  const perRow = Math.max(1, Math.floor((floorW - 1) / 4));

  return (Array.isArray(raw) ? raw : [])
    .filter((el) => el && typeof el === 'object' && el.type !== 'FLOOR')
    .map((el: any) => {
      const kind: ElementKind = el.type === 'OFFICER' ? 'SEAT' : (el.type as ElementKind);
      const spec = KINDS[kind as Exclude<ElementKind, 'FLOOR'>] || KINDS.SEAT;
      const hasCoords = Number.isFinite(Number(el.x)) && Number.isFinite(Number(el.y)) && (el.w || el.h);

      let x: number;
      let y: number;
      if (hasCoords) {
        x = clamp(Math.round(Number(el.x)), 0, GRID_MAX);
        y = clamp(Math.round(Number(el.y)), 0, GRID_MAX);
      } else {
        x = 1 + (autoIndex % perRow) * 4;
        y = 1 + Math.floor(autoIndex / perRow) * 4;
        autoIndex += 1;
      }

      return {
        id: String(el.id || uid()),
        type: KINDS[kind as Exclude<ElementKind, 'FLOOR'>] ? kind : 'SEAT',
        label: String(el.label || spec.label),
        x,
        y,
        w: clamp(Math.round(Number(el.w) || spec.w), 1, GRID_MAX),
        h: clamp(Math.round(Number(el.h) || spec.h), 1, GRID_MAX),
        rotation: ([0, 90, 180, 270] as const).includes(Number(el.rotation) as any) ? Number(el.rotation) as any : 0,
        zone_id: String(el.zone_id || 'general'),
        zone_name: String(el.zone_name || 'Main Office Floor'),
        officer_id: el.officer_id === '' || el.officer_id === null ? undefined : el.officer_id,
        category: (el.category as ResourceCategory) || 'BACK_OFFICE',
        extension: el.extension || '',
        equipment: el.equipment || '',
        status: el.status || 'ACTIVE',
      } as LayoutElement;
    });
};

const readFloor = (raw: any[]) => {
  const f = (Array.isArray(raw) ? raw : []).find((el) => el && el.type === 'FLOOR');
  return {
    w: clamp(Math.round(Number(f?.w) || DEFAULT_FLOOR.w), 8, GRID_MAX),
    h: clamp(Math.round(Number(f?.h) || DEFAULT_FLOOR.h), 8, GRID_MAX),
  };
};

export const DepartmentMapping: React.FC<{ user: Officer; lang: 'EN' | 'SI' }> = ({ user, lang }) => {
  const t = (si: string, en: string) => (lang === 'SI' ? si : en);

  const [viewLevel, setViewLevel] = useState<'OFFICE' | 'SECTION'>('OFFICE');
  const [sectionView, setSectionView] = useState<'PLAN' | 'DIRECTORY'>('PLAN');
  const [selectedSection, setSelectedSection] = useState<string>('');

  const [departments, setDepartments] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<Officer[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<any[]>([]);
  const [allSectionLayouts, setAllSectionLayouts] = useState<Record<string, any[]>>({});

  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [floor, setFloor] = useState(DEFAULT_FLOOR);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [cloneOpen, setCloneOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    moved: boolean;
  } | null>(null);

  const isArchitect = useMemo(
    () => ['SA', 'IT', 'ADMIN'].includes(user.role || ''),
    [user.role],
  );

  useEffect(() => {
    if (!toast) return;
    const h = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(h);
  }, [toast]);

  useEffect(() => {
    initData();
  }, []);

  useEffect(() => {
    if (!selectedSection || viewLevel !== 'SECTION') return;
    loadSectionLayout(selectedSection);
  }, [selectedSection, viewLevel]);

  const initData = async () => {
    setIsLoading(true);
    try {
      const [depts, staff, unavail, layouts] = await Promise.all([
        api.getDepartments(),
        api.getAllStaff(),
        api.getUnavailability(new Date().toLocaleDateString('en-CA')).catch(() => []),
        api.getAllDepartmentLayouts().catch(() => ({} as Record<string, any[]>)),
      ]);
      setDepartments(depts || []);
      setAllStaff(staff || []);
      setUnavailabilities(unavail || []);
      setAllSectionLayouts(layouts || {});
    } catch (err) {
      console.error('Deployment hub initialisation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSectionLayout = async (section: string) => {
    setIsLoading(true);
    try {
      const raw = await api.getDepartmentLayout(section);
      const f = readFloor(raw as any[]);
      setFloor(f);
      setElements(normaliseElements(raw as any[], f.w));
      setIsDirty(false);
      setSelectedId(null);
    } catch (err) {
      console.error('Failed loading section plan:', err);
      setFloor(DEFAULT_FLOOR);
      setElements([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------- live data

  const officerById = useMemo(() => {
    const m = new Map<string, Officer>();
    allStaff.forEach((s) => m.set(String(s.id), s));
    return m;
  }, [allStaff]);

  const unavailableIds = useMemo(
    () => new Set(unavailabilities.map((u) => String(u.officer_id))),
    [unavailabilities],
  );

  /** Presence comes from the officer record, never from the saved plan. */
  const presenceOf = useCallback(
    (officerId?: string | number): 'ACTIVE' | 'PENDING' | 'OFFLINE' | 'EMPTY' => {
      if (!officerId) return 'EMPTY';
      const o = officerById.get(String(officerId));
      if (!o) return 'EMPTY';
      if (unavailableIds.has(String(officerId))) return 'OFFLINE';
      const s = (o.dashboard_status || '').toUpperCase();
      if (s === 'ACTIVE' || s === 'AVAILABLE') return 'ACTIVE';
      if (s === 'PENDING' || s === 'BUSY' || s === 'MEETING') return 'PENDING';
      return 'OFFLINE';
    },
    [officerById, unavailableIds],
  );

  const seats = useMemo(() => elements.filter((e) => e.type === 'SEAT'), [elements]);

  /**
   * Exact match only. Substring matching put all 43 "Development" officers
   * into "Social Development" as well, because one name contains the other.
   */
  const sectionStaff = useMemo(() => {
    if (!selectedSection) return [];
    const target = selectedSection.toLowerCase().trim();
    return allStaff.filter((s) => (s.department || '').toLowerCase().trim() === target);
  }, [allStaff, selectedSection]);

  const seatedIds = useMemo(
    () => new Set(seats.filter((s) => s.officer_id).map((s) => String(s.officer_id))),
    [seats],
  );

  const unseatedStaff = useMemo(
    () => sectionStaff.filter((s) => !seatedIds.has(String(s.id))),
    [sectionStaff, seatedIds],
  );

  /** The same officer assigned to two seats is a mapping mistake, not a state. */
  const doubleBooked = useMemo(() => {
    const counts = new Map<string, number>();
    seats.forEach((s) => {
      if (!s.officer_id) return;
      const k = String(s.officer_id);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [seats]);

  const zones = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    elements.forEach((e) => {
      if (e.zone_id && !list.some((z) => z.id === e.zone_id)) {
        list.push({ id: e.zone_id, name: e.zone_name });
      }
    });
    if (!list.length) list.push({ id: 'general', name: 'Main Office Floor' });
    return list;
  }, [elements]);

  const selected = useMemo(
    () => elements.find((e) => e.id === selectedId) || null,
    [elements, selectedId],
  );

  const painted = useMemo(
    () =>
      [...elements].sort(
        (a, b) =>
          (KINDS[a.type as Exclude<ElementKind, 'FLOOR'>]?.z || 0) -
          (KINDS[b.type as Exclude<ElementKind, 'FLOOR'>]?.z || 0),
      ),
    [elements],
  );

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    const hits = new Set<string>();
    elements.forEach((e) => {
      const o = e.officer_id ? officerById.get(String(e.officer_id)) : undefined;
      const hay = [e.label, e.extension, e.equipment, o?.name, o?.post, o?.designation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (hay.includes(q)) hits.add(e.id);
    });
    return hits;
  }, [searchQuery, elements, officerById]);

  // --------------------------------------------------------------- mutations

  const mutate = useCallback((fn: (prev: LayoutElement[]) => LayoutElement[]) => {
    setElements((prev) => fn(prev));
    setIsDirty(true);
  }, []);

  const patch = useCallback(
    (id: string, next: Partial<LayoutElement>) => {
      mutate((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)));
    },
    [mutate],
  );

  /** Places a new element in the first free cell of a left-to-right sweep. */
  const findSpot = useCallback(
    (w: number, h: number, list: LayoutElement[]) => {
      const occupied = (x: number, y: number) =>
        list.some(
          (e) =>
            e.type !== 'LABEL' &&
            x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y,
        );
      for (let y = 1; y + h <= floor.h; y += 1) {
        for (let x = 1; x + w <= floor.w; x += 1) {
          if (!occupied(x, y)) return { x, y };
        }
      }
      return { x: 1, y: 1 };
    },
    [floor.w, floor.h],
  );

  const addElement = useCallback(
    (kind: Exclude<ElementKind, 'FLOOR'>) => {
      if (elements.length >= MAX_ELEMENTS) {
        setToast(t('උපරිම මූලද්‍රව්‍ය ගණන ළඟා විය', `A plan holds at most ${MAX_ELEMENTS} elements`));
        return;
      }
      const spec = KINDS[kind];
      const spot = findSpot(spec.w, spec.h, elements);
      const count = elements.filter((e) => e.type === kind).length + 1;
      const zone = zones[0] || { id: 'general', name: 'Main Office Floor' };
      const el: LayoutElement = {
        id: uid(kind.toLowerCase()),
        type: kind,
        label: kind === 'SEAT' ? `Seat ${count}` : kind === 'DESK' ? `Table ${count}` : spec.label,
        x: spot.x,
        y: spot.y,
        w: spec.w,
        h: spec.h,
        rotation: 0,
        zone_id: zone.id,
        zone_name: zone.name,
        category: 'BACK_OFFICE',
        status: 'ACTIVE',
        extension: '',
        equipment: kind === 'SEAT' ? 'Standard Desktop PC' : '',
      };
      setElements([...elements, el]);
      setSelectedId(el.id);
      setIsDirty(true);
    },
    [elements, findSpot, zones, t],
  );

  /**
   * A table with seats around it is the unit officers actually think in, so
   * the plan can add one in a single action rather than nine placements.
   */
  const addDeskBank = useCallback(
    (seatCount: number) => {
      if (elements.length + seatCount + 1 > MAX_ELEMENTS) {
        setToast(t('උපරිම මූලද්‍රව්‍ය ගණන ළඟා විය', `A plan holds at most ${MAX_ELEMENTS} elements`));
        return;
      }
      const bankW = Math.max(6, seatCount * 3);
      const spot = findSpot(bankW, 9, elements);
      const zone = zones[0] || { id: 'general', name: 'Main Office Floor' };
      const desk: LayoutElement = {
        id: uid('desk'),
        type: 'DESK',
        label: `Table Bank ${elements.filter((e) => e.type === 'DESK').length + 1}`,
        x: spot.x,
        y: spot.y + 3,
        w: bankW,
        h: 3,
        rotation: 0,
        zone_id: zone.id,
        zone_name: zone.name,
      };

      const existingSeats = elements.filter((e) => e.type === 'SEAT').length;
      const seatEls: LayoutElement[] = Array.from({ length: seatCount }, (_, i) => ({
        id: uid('seat'),
        type: 'SEAT' as const,
        label: `Seat ${existingSeats + i + 1}`,
        // Seats face the table from both long edges, as office banks run.
        x: spot.x + Math.floor(i / 2) * 3,
        y: i % 2 === 0 ? spot.y : spot.y + 6,
        w: 3,
        h: 3,
        rotation: 0 as const,
        zone_id: zone.id,
        zone_name: zone.name,
        category: 'BACK_OFFICE' as ResourceCategory,
        status: 'ACTIVE' as const,
        equipment: 'Standard Desktop PC',
        extension: '',
      }));

      setElements([...elements, desk, ...seatEls]);
      setSelectedId(desk.id);
      setIsDirty(true);
    },
    [elements, findSpot, zones, t],
  );

  const duplicateElement = useCallback(
    (id: string) => {
      const src = elements.find((e) => e.id === id);
      if (!src || elements.length >= MAX_ELEMENTS) return;
      const copy: LayoutElement = {
        ...src,
        id: uid(src.type.toLowerCase()),
        x: clamp(src.x + 1, 0, Math.max(0, floor.w - src.w)),
        y: clamp(src.y + 1, 0, Math.max(0, floor.h - src.h)),
        // A seat is a place, not a person: the copy starts unassigned.
        officer_id: undefined,
        label: src.type === 'SEAT'
          ? `Seat ${elements.filter((e) => e.type === 'SEAT').length + 1}`
          : `${src.label} (copy)`,
      };
      setElements([...elements, copy]);
      setSelectedId(copy.id);
      setIsDirty(true);
    },
    [elements, floor.w, floor.h],
  );

  const removeElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
    setIsDirty(true);
  }, []);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      patch(selected.id, {
        x: clamp(selected.x + dx, 0, Math.max(0, floor.w - selected.w)),
        y: clamp(selected.y + dy, 0, Math.max(0, floor.h - selected.h)),
      });
    },
    [selected, patch, floor.w, floor.h],
  );

  /** Copies another section's plan so a repeated room layout is drawn once. */
  const cloneFrom = useCallback(
    async (sourceSection: string, keepOfficers: boolean) => {
      try {
        const raw = await api.getDepartmentLayout(sourceSection);
        const f = readFloor(raw as any[]);
        const src = normaliseElements(raw as any[], f.w);
        if (!src.length) {
          setToast(t('එම අංශයට සැලැස්මක් නොමැත', `${sourceSection} has no plan to copy`));
          return;
        }
        setFloor(f);
        setElements(
          src.map((e) => ({
            ...e,
            id: uid(e.type.toLowerCase()),
            officer_id: keepOfficers ? e.officer_id : undefined,
          })),
        );
        setSelectedId(null);
        setIsDirty(true);
        setCloneOpen(false);
        setIsEditMode(true);
        setToast(
          t(
            `${sourceSection} සැලැස්ම පිටපත් විය — සුරැකීම ඉතිරිය`,
            `Copied ${src.length} elements from ${sourceSection} — not saved yet`,
          ),
        );
      } catch (err: any) {
        setToast(err?.message || 'Could not copy that plan');
      }
    },
    [t],
  );

  const resizeFloor = useCallback((w: number, h: number) => {
    const nw = clamp(Math.round(w) || DEFAULT_FLOOR.w, 8, GRID_MAX);
    const nh = clamp(Math.round(h) || DEFAULT_FLOOR.h, 8, GRID_MAX);
    setFloor({ w: nw, h: nh });
    // Pull anything now outside the room back inside it.
    setElements((prev) =>
      prev.map((e) => ({
        ...e,
        w: Math.min(e.w, nw),
        h: Math.min(e.h, nh),
        x: clamp(e.x, 0, Math.max(0, nw - Math.min(e.w, nw))),
        y: clamp(e.y, 0, Math.max(0, nh - Math.min(e.h, nh))),
      })),
    );
    setIsDirty(true);
  }, []);

  // ------------------------------------------------------------------ drag

  const onPointerDown = (
    e: React.PointerEvent,
    el: LayoutElement,
    mode: 'move' | 'resize',
  ) => {
    setSelectedId(el.id);
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: el.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      ox: el.x,
      oy: el.y,
      ow: el.w,
      oh: el.h,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const unit = CELL * zoom;
    const dx = Math.round((e.clientX - d.startX) / unit);
    const dy = Math.round((e.clientY - d.startY) / unit);
    if (!dx && !dy) return;
    d.moved = true;

    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== d.id) return el;
        if (d.mode === 'move') {
          return {
            ...el,
            x: clamp(d.ox + dx, 0, Math.max(0, floor.w - el.w)),
            y: clamp(d.oy + dy, 0, Math.max(0, floor.h - el.h)),
          };
        }
        return {
          ...el,
          w: clamp(d.ow + dx, 1, floor.w - el.x),
          h: clamp(d.oh + dy, 1, floor.h - el.y),
        };
      }),
    );
  };

  const onPointerUp = () => {
    if (dragRef.current?.moved) setIsDirty(true);
    dragRef.current = null;
  };

  useEffect(() => {
    if (!isEditMode || !selected) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const step = ev.shiftKey ? 5 : 1;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (map[ev.key]) {
        ev.preventDefault();
        nudge(...map[ev.key]);
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        removeElement(selected.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditMode, selected, nudge, removeElement]);

  // ------------------------------------------------------------------ save

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = [
        { id: 'floor', type: 'FLOOR', label: selectedSection, x: 0, y: 0, w: floor.w, h: floor.h, zone_id: 'general', zone_name: 'Floor' },
        ...elements,
      ];
      await api.saveDepartmentLayout(selectedSection, payload);
      setIsDirty(false);
      setIsEditMode(false);
      setAllSectionLayouts((prev) => ({ ...prev, [selectedSection]: payload }));
      setToast(t('සැලැස්ම සුරකින ලදී', 'Floor plan saved'));
    } catch (err: any) {
      setToast(err?.message || t('සුරැකීමේ දෝෂයකි', 'Could not save the plan'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (isDirty && !window.confirm(t('සුරකින නොලද වෙනස්කම් ඉවතලන්නද?', 'Discard unsaved changes to this plan?'))) return;
    setIsEditMode(false);
    await loadSectionLayout(selectedSection);
  };

  /** Leaving a section drops whatever has not been saved, so say so first. */
  const confirmLeave = () =>
    !isDirty ||
    window.confirm(t('සුරකින නොලද වෙනස්කම් නැති වනු ඇත. ඉදිරියට යන්නද?',
                     'This plan has unsaved changes that will be lost. Leave anyway?'));

  const openSection = (name: string) => {
    if (!confirmLeave()) return;
    setSelectedSection(name);
    setViewLevel('SECTION');
    setSectionView('PLAN');
    setIsEditMode(false);
    setIsDirty(false);
    setSearchQuery('');
  };

  // ============================================================ OFFICE VIEW

  if (viewLevel === 'OFFICE') {
    const stats = Object.entries(allSectionLayouts).map(([section, raw]) => {
      const els = normaliseElements(raw as any[], readFloor(raw as any[]).w);
      const s = els.filter((e) => e.type === 'SEAT');
      const assigned = s.filter((e) => e.officer_id);
      return {
        section,
        seats: s.length,
        tables: els.filter((e) => e.type === 'DESK' || e.type === 'COUNTER').length,
        assigned: assigned.length,
        active: assigned.filter((e) => presenceOf(e.officer_id) === 'ACTIVE').length,
      };
    });
    const totalSeats = stats.reduce((a, s) => a + s.seats, 0);
    const totalAssigned = stats.reduce((a, s) => a + s.assigned, 0);
    const totalActive = stats.reduce((a, s) => a + s.active, 0);
    const mapped = stats.filter((s) => s.seats > 0).length;

    return (
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10 animate-fade-in pb-24 px-4 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5 border-b border-slate-100 pb-6 pt-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">
                {t('කාර්යාලීය අවකාශීය බුද්ධිය', 'Office Spatial Intelligence')}
              </p>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-800 tracking-tighter leading-none">
              {t('කාර්යාංශ සැලැස්ම', 'Department Deployment Hub')}
            </h2>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              {t('අසුන් සැකසුම, මේස සැලසුම සහ ලබා ගත හැකි බව', 'Seat arrangement, table layout & availability')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {[
            { label: t('සැලසුම් කළ අසුන්', 'Seats Mapped'), value: totalSeats, tone: 'text-slate-800' },
            { label: t('නිලධාරීන් පවරා ඇත', 'Seats Assigned'), value: totalAssigned, tone: 'text-blue-600' },
            { label: t('දැන් කාර්යාලයේ', 'On Duty Now'), value: totalActive, tone: 'text-emerald-600' },
            { label: t('සැලසුම් කළ අංශ', 'Sections Mapped'), value: `${mapped}/${departments.length}`, tone: 'text-indigo-600' },
          ].map((c) => (
            <div key={c.label} className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/70 shadow-sm">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">{c.label}</p>
              <p className={`text-3xl sm:text-4xl font-black tracking-tighter mt-2 ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-16 flex flex-col items-center gap-4 bg-white rounded-3xl border border-slate-200">
            <div className="w-9 h-9 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Loading floor plans…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {departments.map((d) => {
              const s = stats.find((x) => x.section === d.name);
              const occupancy = s && s.seats ? Math.round((s.assigned / s.seats) * 100) : 0;
              return (
                <button
                  key={d.id || d.name}
                  onClick={() => openSection(d.name)}
                  className="text-left bg-white p-6 rounded-3xl border border-slate-200/70 shadow-sm hover:border-blue-400 hover:shadow-md transition-all active:scale-[0.99] min-h-[44px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight leading-tight">{d.name}</h3>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      s && s.seats ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}>
                      {s && s.seats ? t('සැලසුම් කර ඇත', 'Mapped') : t('හිස්', 'Empty')}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[
                      { k: t('මේස', 'Tables'), v: s?.tables || 0 },
                      { k: t('අසුන්', 'Seats'), v: s?.seats || 0 },
                      { k: t('රාජකාරියේ', 'On Duty'), v: s?.active || 0 },
                    ].map((m) => (
                      <div key={m.k} className="bg-slate-50 rounded-xl py-2.5">
                        <p className="text-xl font-black text-slate-800 leading-none">{m.v}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{m.k}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${occupancy}%` }} />
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">
                      {occupancy}% {t('අසුන් පවරා ඇත', 'seats assigned')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // =========================================================== SECTION VIEW

  const unit = CELL * zoom;

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in pb-32 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5 pt-2">
        <div className="min-w-0">
          <button
            onClick={() => { if (!confirmLeave()) return; setIsDirty(false); setViewLevel('OFFICE'); initData(); }}
            className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline min-h-[44px] flex items-center gap-1"
          >
            ← {t('සියලු අංශ', 'All Sections')}
          </button>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-800 tracking-tighter leading-none truncate">
            {selectedSection}
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
            {seats.length} {t('අසුන්', 'seats')} · {elements.filter((e) => e.type === 'DESK' || e.type === 'COUNTER').length} {t('මේස', 'tables')} · {floor.w}×{floor.h} {t('ඒකක', 'grid')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={selectedSection}
            onChange={(e) => openSection(e.target.value)}
            className="flex-1 lg:flex-none px-3 py-2.5 min-h-[44px] bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            {departments.map((d) => (
              <option key={d.id || d.name} value={d.name}>{d.name}</option>
            ))}
          </select>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['PLAN', 'DIRECTORY'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSectionView(v)}
                className={`px-3 sm:px-4 py-2 min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  sectionView === v ? 'bg-slate-900 text-white shadow' : 'text-slate-500'
                }`}
              >
                {v === 'PLAN' ? t('සැලැස්ම', 'Floor Plan') : t('නාමාවලිය', 'Directory')}
              </button>
            ))}
          </div>

          {isArchitect && (
            isEditMode ? (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  {isSaving ? t('සුරකිමින්…', 'Saving…') : t('සුරකින්න', 'Save Plan')}
                </button>
                <button
                  onClick={handleDiscard}
                  className="px-4 py-2.5 min-h-[44px] bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  {t('අත්හරින්න', 'Cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditMode(true)}
                className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                ✎ {t('සංස්කරණය', 'Edit Layout')}
              </button>
            )
          )}
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <span className="text-base">⚠️</span>
          <p className="text-[11px] font-bold text-amber-800">
            {t('සුරකින නොලද වෙනස්කම් ඇත.', 'This plan has unsaved changes.')}
          </p>
        </div>
      )}

      {doubleBooked.size > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl">
          <span className="text-base">⛔</span>
          <p className="text-[11px] font-bold text-rose-800">
            {doubleBooked.size} {t('නිලධාරියෙකු එකකට වැඩි අසුන්වලට පවරා ඇත', 'officer(s) are assigned to more than one seat in this plan')}
          </p>
        </div>
      )}

      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('නම, තනතුර, දිගුව හෝ මේසය සොයන්න…', 'Search officer, post, extension or table…')}
        className="w-full px-4 py-3 min-h-[44px] bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400"
      />

      {sectionView === 'PLAN' ? (
        <>
          {/* Edit toolbar */}
          {isEditMode && (
            <div className="bg-white border border-slate-200 rounded-3xl p-4 space-y-4 shadow-sm">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  {t('එකතු කරන්න', 'Place on plan')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {PALETTE_ORDER.map((k) => (
                    <button
                      key={k}
                      onClick={() => addElement(k)}
                      className="shrink-0 px-3 py-2 min-h-[44px] bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <span className="text-sm">{KINDS[k].icon}</span>
                      {KINDS[k].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {t('ඉක්මන්', 'Quick')}
                </span>
                {[4, 6, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => addDeskBank(n)}
                    className="px-3 py-2 min-h-[40px] bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-[10px] font-black text-amber-800 uppercase tracking-wider"
                  >
                    + {t('මේස පෙළ', 'Table bank')} ({n})
                  </button>
                ))}
                <button
                  onClick={() => setCloneOpen(true)}
                  className="px-3 py-2 min-h-[40px] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-[10px] font-black text-indigo-800 uppercase tracking-wider"
                >
                  ⧉ {t('අංශයකින් පිටපත් කරන්න', 'Copy from section')}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {t('කාමර ප්‍රමාණය', 'Room size')}
                </span>
                {([['w', floor.w], ['h', floor.h]] as const).map(([axis, val]) => (
                  <label key={axis} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-500 uppercase">{axis === 'w' ? 'W' : 'H'}</span>
                    <input
                      type="number"
                      min={8}
                      max={GRID_MAX}
                      value={val}
                      onChange={(e) =>
                        resizeFloor(
                          axis === 'w' ? Number(e.target.value) : floor.w,
                          axis === 'h' ? Number(e.target.value) : floor.h,
                        )
                      }
                      className="w-16 px-2 py-2 min-h-[40px] bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Canvas */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { c: 'bg-emerald-500', l: t('රාජකාරියේ', 'On duty') },
                  { c: 'bg-amber-500', l: t('නොමැත', 'Away') },
                  { c: 'bg-slate-300', l: t('හිස්', 'Vacant') },
                ].map((lg) => (
                  <span key={lg.l} className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <span className={`w-2.5 h-2.5 rounded-full ${lg.c}`} />
                    {lg.l}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setZoom((z) => clamp(Number((z - 0.15).toFixed(2)), 0.4, 1.8))}
                  className="w-9 h-9 min-h-[36px] bg-white border border-slate-200 rounded-lg text-sm font-black text-slate-600"
                  aria-label="Zoom out"
                >−</button>
                <span className="text-[10px] font-black text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => clamp(Number((z + 0.15).toFixed(2)), 0.4, 1.8))}
                  className="w-9 h-9 min-h-[36px] bg-white border border-slate-200 rounded-lg text-sm font-black text-slate-600"
                  aria-label="Zoom in"
                >+</button>
              </div>
            </div>

            {isLoading ? (
              <div className="p-20 flex flex-col items-center gap-4">
                <div className="w-9 h-9 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Drawing floor plan…</p>
              </div>
            ) : (
              <div className="overflow-auto p-4 sm:p-6 bg-slate-100/50" style={{ maxHeight: '70vh' }}>
                <div
                  ref={canvasRef}
                  onPointerDown={() => setSelectedId(null)}
                  className="relative bg-white border-2 border-slate-300 rounded-lg mx-auto"
                  style={{
                    width: floor.w * unit,
                    height: floor.h * unit,
                    backgroundImage:
                      'linear-gradient(to right, rgba(100,116,139,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.10) 1px, transparent 1px)',
                    backgroundSize: `${unit}px ${unit}px`,
                  }}
                >
                  {!elements.length && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 pointer-events-none">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        {t('හිස් කාර්යාල බිම', 'Empty floor')}
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                        {isArchitect
                          ? t('සංස්කරණය ඔබා මේස සහ අසුන් එකතු කරන්න.', 'Tap Edit Layout, then place tables and seats — or copy the plan from another section.')
                          : t('මෙම අංශය සඳහා තවම සැලැස්මක් නොමැත.', 'No plan has been drawn for this section yet.')}
                      </p>
                    </div>
                  )}

                  {painted.map((el) => {
                    const spec = KINDS[el.type as Exclude<ElementKind, 'FLOOR'>] || KINDS.SEAT;
                    const officer = el.officer_id ? officerById.get(String(el.officer_id)) : undefined;
                    const presence = el.type === 'SEAT' ? presenceOf(el.officer_id) : 'EMPTY';
                    const isSel = selectedId === el.id;
                    const isHit = searchHits.has(el.id);
                    const isDup = !!el.officer_id && doubleBooked.has(String(el.officer_id));
                    const cat = CATEGORIES.find((c) => c.id === el.category);

                    const dot =
                      presence === 'ACTIVE' ? 'bg-emerald-500'
                      : presence === 'PENDING' ? 'bg-amber-500'
                      : presence === 'OFFLINE' ? 'bg-rose-400'
                      : 'bg-slate-300';

                    return (
                      <div
                        key={el.id}
                        onPointerDown={(e) => onPointerDown(e, el, 'move')}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        title={officer ? `${officer.name} — ${officer.post || officer.designation || ''}` : el.label}
                        className={`absolute flex flex-col items-center justify-center overflow-hidden border-2 ${spec.body} ${
                          el.type === 'SEAT' ? 'rounded-full' : el.type === 'LABEL' ? 'rounded-lg' : 'rounded-md'
                        } ${isEditMode ? 'cursor-move' : 'cursor-pointer'} ${
                          isSel ? 'ring-4 ring-blue-500/50 z-40' : ''
                        } ${isHit ? 'ring-4 ring-amber-400/70 z-30' : ''} ${
                          isDup ? 'ring-4 ring-rose-500/60' : ''
                        } transition-shadow`}
                        style={{
                          left: el.x * unit,
                          top: el.y * unit,
                          width: el.w * unit,
                          height: el.h * unit,
                          zIndex: isSel ? 40 : spec.z,
                          touchAction: isEditMode ? 'none' : 'auto',
                        }}
                      >
                        {el.type === 'SEAT' ? (
                          <>
                            <span className={`absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${dot}`} />
                            {officer?.profile_pic ? (
                              <img src={officer.profile_pic} alt="" className="w-full h-full object-cover rounded-full" draggable={false} />
                            ) : (
                              <span className="text-[10px] font-black text-slate-600 leading-none">
                                {officer ? initialsOf(officer.name) : '—'}
                              </span>
                            )}
                            {!officer && unit * el.h > 42 && (
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-wider mt-0.5 px-1 truncate max-w-full">
                                {el.label}
                              </span>
                            )}
                            {cat && el.category !== 'BACK_OFFICE' && unit * el.w > 50 && (
                              <span className="absolute -bottom-0.5 text-[9px] leading-none">{cat.icon}</span>
                            )}
                          </>
                        ) : (
                          <span className={`text-[9px] font-black uppercase tracking-wider px-1 text-center leading-tight truncate max-w-full ${spec.text}`}>
                            {el.type === 'LABEL' || unit * el.w > 56 ? el.label : spec.icon}
                          </span>
                        )}

                        {isEditMode && isSel && (
                          <span
                            onPointerDown={(e) => onPointerDown(e, el, 'resize')}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 border-2 border-white rounded-full cursor-se-resize shadow"
                            style={{ touchAction: 'none' }}
                            aria-label="Resize"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Inspector */}
          {selected && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {KINDS[selected.type as Exclude<ElementKind, 'FLOOR'>]?.label || selected.type}
                  </p>
                  <h4 className="text-lg font-black text-slate-800 tracking-tight truncate">{selected.label}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {t('පිහිටීම', 'at')} {selected.x},{selected.y} · {selected.w}×{selected.h}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="shrink-0 w-9 h-9 min-h-[36px] bg-slate-100 rounded-xl text-slate-500 font-black"
                  aria-label="Close"
                >✕</button>
              </div>

              {selected.type === 'SEAT' && selected.officer_id && (() => {
                const o = officerById.get(String(selected.officer_id));
                if (!o) return null;
                const p = presenceOf(o.id);
                return (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                    <div className="w-11 h-11 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {o.profile_pic
                        ? <img src={o.profile_pic} alt="" className="w-full h-full object-cover" />
                        : <span className="text-xs font-black text-slate-500">{initialsOf(o.name)}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{o.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 truncate">{o.post || o.designation}</p>
                    </div>
                    <span className={`ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      p === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : p === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {p === 'ACTIVE' ? t('රාජකාරියේ', 'On duty') : p === 'PENDING' ? t('කාර්යබහුල', 'Busy') : t('නොමැත', 'Away')}
                    </span>
                  </div>
                );
              })()}

              {isEditMode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('නම', 'Label')}</span>
                      <input
                        value={selected.label}
                        onChange={(e) => patch(selected.id, { label: e.target.value })}
                        className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('කලාපය', 'Zone / Room')}</span>
                      <input
                        value={selected.zone_name}
                        onChange={(e) =>
                          patch(selected.id, {
                            zone_name: e.target.value,
                            zone_id: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'general',
                          })
                        }
                        className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                      />
                    </label>
                  </div>

                  {selected.type === 'SEAT' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('නිලධාරී', 'Officer')}</span>
                        <select
                          value={selected.officer_id ? String(selected.officer_id) : ''}
                          onChange={(e) => patch(selected.id, { officer_id: e.target.value || undefined })}
                          className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                        >
                          <option value="">— {t('හිස් අසුන', 'Vacant seat')} —</option>
                          {sectionStaff.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}{seatedIds.has(String(s.id)) && String(s.id) !== String(selected.officer_id) ? ' (already seated)' : ''}
                            </option>
                          ))}
                          {allStaff.filter((s) => !sectionStaff.some((x) => String(x.id) === String(s.id))).length > 0 && (
                            <optgroup label={t('වෙනත් අංශ', 'Other sections')}>
                              {allStaff
                                .filter((s) => !sectionStaff.some((x) => String(x.id) === String(s.id)))
                                .map((s) => (
                                  <option key={s.id} value={String(s.id)}>{s.name} — {s.department || '—'}</option>
                                ))}
                            </optgroup>
                          )}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('වර්ගය', 'Category')}</span>
                        <select
                          value={selected.category || 'BACK_OFFICE'}
                          onChange={(e) => patch(selected.id, { category: e.target.value as ResourceCategory })}
                          className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                        >
                          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('දිගුව', 'Extension')}</span>
                        <input
                          value={selected.extension || ''}
                          onChange={(e) => patch(selected.id, { extension: e.target.value })}
                          className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('උපකරණ', 'Equipment')}</span>
                        <input
                          value={selected.equipment || ''}
                          onChange={(e) => patch(selected.id, { equipment: e.target.value })}
                          className="mt-1 w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                        />
                      </label>
                    </div>
                  )}

                  {/* Precise placement — dragging is awkward on a phone */}
                  <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t('ගෙනයන්න', 'Nudge')}</p>
                      <div className="grid grid-cols-3 gap-1 w-[132px]">
                        <span />
                        <button onClick={() => nudge(0, -1)} className="h-10 min-h-[40px] bg-slate-100 rounded-lg font-black text-slate-600">↑</button>
                        <span />
                        <button onClick={() => nudge(-1, 0)} className="h-10 min-h-[40px] bg-slate-100 rounded-lg font-black text-slate-600">←</button>
                        <button onClick={() => nudge(0, 1)} className="h-10 min-h-[40px] bg-slate-100 rounded-lg font-black text-slate-600">↓</button>
                        <button onClick={() => nudge(1, 0)} className="h-10 min-h-[40px] bg-slate-100 rounded-lg font-black text-slate-600">→</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t('ප්‍රමාණය', 'Size')}</p>
                      <div className="flex gap-2">
                        {([['w', selected.w], ['h', selected.h]] as const).map(([axis, val]) => (
                          <input
                            key={axis}
                            type="number"
                            min={1}
                            max={GRID_MAX}
                            value={val}
                            onChange={(e) => {
                              const n = clamp(Math.round(Number(e.target.value) || 1), 1, GRID_MAX);
                              patch(selected.id, axis === 'w'
                                ? { w: Math.min(n, floor.w - selected.x) }
                                : { h: Math.min(n, floor.h - selected.y) });
                            }}
                            className="w-16 px-2 py-2 min-h-[40px] bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => duplicateElement(selected.id)}
                      className="px-4 py-2.5 min-h-[44px] bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >⧉ {t('අනුපිටපත', 'Duplicate')}</button>
                    <button
                      onClick={() => removeElement(selected.id)}
                      className="px-4 py-2.5 min-h-[44px] bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >🗑 {t('ඉවත් කරන්න', 'Remove')}</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  {[
                    { k: t('කලාපය', 'Zone'), v: selected.zone_name },
                    { k: t('දිගුව', 'Extension'), v: selected.extension || '—' },
                    { k: t('උපකරණ', 'Equipment'), v: selected.equipment || '—' },
                    { k: t('වර්ගය', 'Category'), v: CATEGORIES.find((c) => c.id === selected.category)?.label || '—' },
                  ].map((r) => (
                    <div key={r.k}>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{r.k}</p>
                      <p className="font-bold text-slate-700 mt-0.5 break-words">{r.v}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unseated officers */}
          {!!unseatedStaff.length && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {t('අසුන් නොපවරන ලද නිලධාරීන්', 'Officers without a seat')} · {unseatedStaff.length}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {unseatedStaff.map((s) => (
                  <button
                    key={s.id}
                    disabled={!isEditMode || !selected || selected.type !== 'SEAT'}
                    onClick={() => selected && patch(selected.id, { officer_id: s.id })}
                    title={
                      isEditMode && selected?.type === 'SEAT'
                        ? `Assign ${s.name} to ${selected.label}`
                        : t('අසුනක් තෝරන්න', 'Select a seat in edit mode to assign')
                    }
                    className="px-3 py-2 min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 enabled:hover:border-blue-400 enabled:hover:text-blue-700 disabled:opacity-60 transition-all"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* --------------------------------------------------- DIRECTORY VIEW */
        <div className="space-y-6">
          {zones.map((zone) => {
            const zoneSeats = seats.filter(
              (s) => s.zone_id === zone.id && (!searchQuery || searchHits.has(s.id)),
            );
            if (searchQuery && !zoneSeats.length) return null;
            return (
              <div key={zone.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-sm">
                <header className="border-b border-slate-100 pb-3 mb-4">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">{zone.name}</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    {zoneSeats.length} {t('අසුන්', 'seats')}
                  </p>
                </header>

                {!zoneSeats.length ? (
                  <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      {t('අසුන් නොමැත', 'No seats in this zone')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {zoneSeats.map((ws) => {
                      const o = ws.officer_id ? officerById.get(String(ws.officer_id)) : undefined;
                      const p = presenceOf(ws.officer_id);
                      const cat = CATEGORIES.find((c) => c.id === ws.category) || CATEGORIES[2];
                      return (
                        <button
                          key={ws.id}
                          onClick={() => { setSectionView('PLAN'); setSelectedId(ws.id); }}
                          className="text-left p-4 bg-white border-2 border-slate-100 hover:border-slate-300 rounded-2xl transition-all min-h-[44px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <div className="w-11 h-11 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center">
                                {o?.profile_pic
                                  ? <img src={o.profile_pic} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-xs font-black text-slate-400">{o ? initialsOf(o.name) : '—'}</span>}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white ${
                                p === 'ACTIVE' ? 'bg-emerald-500' : p === 'PENDING' ? 'bg-amber-500' : p === 'OFFLINE' ? 'bg-rose-400' : 'bg-slate-300'
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-black text-slate-800 truncate">
                                {o ? o.name : t('හිස් අසුන', 'Vacant seat')}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 truncate">
                                {o ? (o.post || o.designation || '—') : ws.label}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${cat.chip}`}>
                              {cat.icon} {cat.label}
                            </span>
                            {ws.extension && (
                              <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-slate-50 text-slate-500 border border-slate-200">
                                ☎ {ws.extension}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Copy-from-section sheet */}
      {cloneOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                {t('අංශයකින් සැලැස්ම පිටපත් කරන්න', 'Copy a floor plan')}
              </h3>
              <p className="text-[11px] text-slate-500 font-bold mt-1 leading-relaxed">
                {t('තෝරාගත් අංශයේ සැලැස්ම මෙම අංශයට පිටපත් වේ. වත්මන් සැලැස්ම ප්‍රතිස්ථාපනය වේ.',
                   `Replaces the current ${selectedSection} plan with a copy of another section's tables, seats and walls.`)}
              </p>
            </div>

            <div className="space-y-2">
              {departments.filter((d) => d.name !== selectedSection).map((d) => {
                const raw = allSectionLayouts[d.name] || [];
                const count = normaliseElements(raw as any[], readFloor(raw as any[]).w).length;
                return (
                  <div key={d.id || d.name} className="flex items-center gap-2 p-3 border border-slate-200 rounded-2xl">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-800 truncate">{d.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{count} {t('මූලද්‍රව්‍ය', 'elements')}</p>
                    </div>
                    <button
                      disabled={!count}
                      onClick={() => cloneFrom(d.name, false)}
                      className="shrink-0 px-3 py-2 min-h-[40px] bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-[9px] font-black uppercase tracking-widest"
                    >
                      {t('සැකසුම පමණක්', 'Layout only')}
                    </button>
                    <button
                      disabled={!count}
                      onClick={() => cloneFrom(d.name, true)}
                      className="shrink-0 px-3 py-2 min-h-[40px] bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-[9px] font-black uppercase tracking-widest"
                    >
                      {t('නිලධාරීන් සමඟ', 'With officers')}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setCloneOpen(false)}
              className="w-full px-4 py-3 min-h-[44px] bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest"
            >
              {t('අත්හරින්න', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-xl text-xs font-bold max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
};

export default DepartmentMapping;
