import React, { useState, useEffect, useMemo } from 'react';
import type { Officer } from '../types';
import { api } from '../service/api';

// Simplified structural models for workstation mapping
type ResourceCategory = 'FRONT_COUNTER' | 'BACK_OFFICE' | 'EXECUTIVE' | 'SUPPORT_DESK';

interface WorkstationElement {
  id: string;
  type: 'OFFICER';
  officer_id?: string | number;
  label: string; // e.g. Desk #1 or Assistant Commis...
  status?: 'ACTIVE' | 'PENDING' | 'OFFLINE';
  
  zone_id: string;
  zone_name: string;
  category: ResourceCategory;
  extension?: string;
  equipment?: string;
}

interface ZoneGroup {
  id: string;
  name: string;
}

const CATEGORIES: { id: ResourceCategory; label: string; icon: string; colorClass: string; bgClass: string; borderClass: string }[] = [
  { id: 'EXECUTIVE', label: 'Executive Suite', icon: '👑', colorClass: 'text-indigo-600', bgClass: 'bg-indigo-50/70', borderClass: 'border-indigo-200' },
  { id: 'FRONT_COUNTER', label: 'Front Counter', icon: '🗣️', colorClass: 'text-teal-600', bgClass: 'bg-teal-50/70', borderClass: 'border-teal-200' },
  { id: 'BACK_OFFICE', label: 'Back Office Desk', icon: '🏛️', colorClass: 'text-slate-600', bgClass: 'bg-slate-50/70', borderClass: 'border-slate-200' },
  { id: 'SUPPORT_DESK', label: 'Support & Tech', icon: '⚙️', colorClass: 'text-amber-600', bgClass: 'bg-amber-50/70', borderClass: 'border-amber-200' },
];

export const DepartmentMapping: React.FC<{ user: Officer; lang: 'EN' | 'SI' }> = ({ user, lang }) => {
  const t = (si: string, en: string) => (lang === 'SI' ? si : en);

  const [viewLevel, setViewLevel] = useState<'OFFICE' | 'SECTION'>('OFFICE');
  const [selectedSection, setSelectedSection] = useState<string>('');
  
  const [departments, setDepartments] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<Officer[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<WorkstationElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state for adding/editing a workstation
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkstation, setEditingWorkstation] = useState<WorkstationElement | null>(null);
  const [workstationForm, setWorkstationForm] = useState({
    label: '',
    officer_id: '',
    zone_id: 'general',
    zone_name: 'Main Room',
    category: 'BACK_OFFICE' as ResourceCategory,
    extension: '',
    equipment: 'Standard Desktop PC Computer',
    status: 'ACTIVE' as 'ACTIVE' | 'PENDING' | 'OFFLINE',
  });

  // Modal state for managing/creating zones
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');

  // Cached layouts for master overview statistics
  const [allSectionLayouts, setAllSectionLayouts] = useState<Record<string, WorkstationElement[]>>({});

  useEffect(() => {
    initData();
  }, []);

  useEffect(() => {
    if (departments.length === 0 || allStaff.length === 0) return;
    if (viewLevel === 'SECTION' && selectedSection) {
      loadSectionLayout();
    } else if (viewLevel === 'OFFICE') {
      loadAllLayoutsOverview();
    }
  }, [selectedSection, viewLevel, departments, allStaff]);

  const initData = async () => {
    setIsLoading(true);
    try {
      const [depts, staff, unavail] = await Promise.all([
        api.getDepartments(),
        api.getAllStaff(),
        api.getUnavailability(new Date().toLocaleDateString('en-CA')),
      ]);
      setDepartments(depts);
      setAllStaff(staff);
      setUnavailabilities(unavail || []);
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllLayoutsOverview = async () => {
    setIsLoading(true);
    try {
      const overview: Record<string, WorkstationElement[]> = {};
      for (const d of departments) {
        try {
          const l = await api.getDepartmentLayout(d.name);
          const elements = Array.isArray(l) ? l : [];
          // Normalize old formats
          const validated: WorkstationElement[] = elements
            .filter((el: any) => el.type === 'OFFICER')
            .map((el: any) => {
              const sOff = allStaff.find(s => String(s.id) === String(el.officer_id));
              const dynamicStatus = sOff 
                ? ((sOff.dashboard_status === 'ACTIVE' || sOff.dashboard_status === 'AVAILABLE') ? 'ACTIVE' : 'OFFLINE')
                : (el.status || 'ACTIVE');
              return {
                id: el.id || `ws-${Date.now()}-${Math.random()}`,
                type: 'OFFICER',
                officer_id: el.officer_id,
                label: el.label || 'Workstation',
                status: dynamicStatus as any,
                zone_id: el.zone_id || 'general',
                zone_name: el.zone_name || 'Main Office Floor',
                category: el.category || 'BACK_OFFICE',
                extension: el.extension || '',
                equipment: el.equipment || 'Standard Desktop PC',
              };
            });
          overview[d.name] = validated;
        } catch {
          overview[d.name] = [];
        }
      }
      setAllSectionLayouts(overview);
    } catch (err) {
      console.error('Failed overview loading:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSectionLayout = async () => {
    setIsLoading(true);
    try {
      const l = await api.getDepartmentLayout(selectedSection);
      const elements = Array.isArray(l) ? l : [];
      const normalized: WorkstationElement[] = elements
        .filter((el: any) => el.type === 'OFFICER')
        .map((el: any) => {
          const sOff = allStaff.find(s => String(s.id) === String(el.officer_id));
          const dynamicStatus = sOff 
            ? ((sOff.dashboard_status === 'ACTIVE' || sOff.dashboard_status === 'AVAILABLE') ? 'ACTIVE' : 'OFFLINE')
            : (el.status || 'ACTIVE');
          return {
            id: el.id || `ws-${Date.now()}-${Math.random()}`,
            type: 'OFFICER',
            officer_id: el.officer_id,
            label: el.label || 'Workstation',
            status: dynamicStatus as any,
            zone_id: el.zone_id || 'general',
            zone_name: el.zone_name || 'Main Office Floor',
            category: el.category || 'BACK_OFFICE',
            extension: el.extension || '',
            equipment: el.equipment || 'Standard Desktop PC',
          };
        });
      setLayouts(normalized);
    } catch (err) {
      console.error('Failed loading section layout:', err);
      setLayouts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLayout = async (targetLayouts: WorkstationElement[]) => {
    try {
      await api.saveDepartmentLayout(selectedSection, targetLayouts);
      setIsEditMode(false);
      await loadSectionLayout();
    } catch (err: any) {
      alert(t('සුරැකීමේ දෝෂයකි: ', 'Error synchronizing spatial data: ') + (err.message || 'Check Server.'));
    }
  };

  const activeSectionStaff = useMemo(() => {
    if (!selectedSection) return [];
    const targetDept = selectedSection.toLowerCase().trim();
    return allStaff.filter((s) => {
      const sDept = (s.department || '').toLowerCase().trim();
      return sDept === targetDept || sDept.includes(targetDept) || targetDept.includes(sDept);
    });
  }, [allStaff, selectedSection]);

  const unmappedStaff = useMemo(() => {
    const mappedIds = layouts.map((l) => String(l.officer_id));
    return activeSectionStaff.filter((s) => !mappedIds.includes(String(s.id)));
  }, [activeSectionStaff, layouts]);

  // Derived zones
  const zones = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    layouts.forEach((l) => {
      if (l.zone_id && !list.some((z) => z.id === l.zone_id)) {
        list.push({ id: l.zone_id, name: l.zone_name });
      }
    });
    if (list.length === 0) {
      list.push({ id: 'general', name: 'Main Office Floor' });
    }
    return list;
  }, [layouts]);

  const isArchitect = useMemo(() => {
    return ['SA', 'IT', 'ADMIN'].includes(user.role || '');
  }, [user]);

  const handleCreateZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    const zId = `zone-${Date.now()}`;
    // Create an empty dummy workstation in this zone so it registers
    const sample: WorkstationElement = {
      id: `ws-${Date.now()}`,
      type: 'OFFICER',
      label: 'New Desk Space',
      zone_id: zId,
      zone_name: newZoneName.trim(),
      category: 'BACK_OFFICE',
      status: 'OFFLINE',
      equipment: 'Pending Configuration',
    };
    const updated = [...layouts, sample];
    setLayouts(updated);
    setIsZoneModalOpen(false);
    setNewZoneName('');
  };

  const handleOpenWorkstationModal = (ws?: WorkstationElement, defaultZoneId?: string) => {
    if (ws) {
      setEditingWorkstation(ws);
      setWorkstationForm({
        label: ws.label,
        officer_id: ws.officer_id ? String(ws.officer_id) : '',
        zone_id: ws.zone_id,
        zone_name: ws.zone_name,
        category: ws.category,
        extension: ws.extension || '',
        equipment: ws.equipment || '',
        status: ws.status || 'ACTIVE',
      });
    } else {
      setEditingWorkstation(null);
      const matchedZone = zones.find((z) => z.id === defaultZoneId) || zones[0] || { id: 'general', name: 'Main Office Floor' };
      setWorkstationForm({
        label: `Workstation #${layouts.length + 1}`,
        officer_id: '',
        zone_id: matchedZone.id,
        zone_name: matchedZone.name,
        category: 'BACK_OFFICE',
        extension: '',
        equipment: 'Standard Workstation Desktop PC',
        status: 'ACTIVE',
      });
    }
    setIsModalOpen(true);
  };

  const handleDeleteWorkstation = (id: string) => {
    if (!window.confirm(t('මෙම ආසන සැලැස්ම ඉවත් කිරීමට ඔබට විශ්වාසද?', 'Are you sure you want to remove this workstation?'))) return;
    const filtered = layouts.filter((l) => l.id !== id);
    setLayouts(filtered);
    setIsModalOpen(false);
  };

  const handleSaveWorkstationForm = (e: React.FormEvent) => {
    e.preventDefault();
    const zoneObj = zones.find((z) => z.id === workstationForm.zone_id) || { id: 'general', name: 'Main Office Floor' };
    
    // Find officer status dynamically
    let currentStatus: 'ACTIVE' | 'PENDING' | 'OFFLINE' = workstationForm.status;
    if (workstationForm.officer_id) {
       const selectedOff = allStaff.find((s) => String(s.id) === workstationForm.officer_id);
       if (selectedOff) {
          currentStatus = (selectedOff.dashboard_status === 'ACTIVE' || selectedOff.dashboard_status === 'AVAILABLE') ? 'ACTIVE' : 'OFFLINE';
       }
    }

    const updatedElement: WorkstationElement = {
      id: editingWorkstation ? editingWorkstation.id : `ws-${Date.now()}`,
      type: 'OFFICER',
      label: workstationForm.label,
      officer_id: workstationForm.officer_id ? Number(workstationForm.officer_id) : undefined,
      zone_id: zoneObj.id,
      zone_name: zoneObj.name,
      category: workstationForm.category,
      extension: workstationForm.extension,
      equipment: workstationForm.equipment,
      status: currentStatus,
    };

    let nextLayouts: WorkstationElement[];
    if (editingWorkstation) {
      nextLayouts = layouts.map((l) => (l.id === editingWorkstation.id ? updatedElement : l));
    } else {
      nextLayouts = [...layouts, updatedElement];
    }

    setLayouts(nextLayouts);
    setIsModalOpen(false);
  };

  const handleToggleWorkstationDuty = (ws: WorkstationElement) => {
    const nextStatus: 'ACTIVE' | 'PENDING' | 'OFFLINE' = ws.status === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE';
    const updated = layouts.map((l) => (l.id === ws.id ? { ...l, status: nextStatus } : l));
    setLayouts(updated);
  };

  // Filter workstations shown in section
  const filteredWorkstationsGrouped = useMemo(() => {
    const map: Record<string, WorkstationElement[]> = {};
    zones.forEach((z) => {
      map[z.id] = [];
    });

    layouts.forEach((l) => {
      const matchSearch =
        !searchQuery ||
        l.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.extension?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.equipment?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (() => {
          const officer = allStaff.find((s) => String(s.id) === String(l.officer_id));
          return officer ? officer.name.toLowerCase().includes(searchQuery.toLowerCase()) || (officer.post || '').toLowerCase().includes(searchQuery.toLowerCase()) : false;
        })();

      if (matchSearch) {
        const destZoneId = l.zone_id || 'general';
        if (!map[destZoneId]) map[destZoneId] = [];
        map[destZoneId].push(l);
      }
    });

    return map;
  }, [layouts, zones, searchQuery, allStaff]);

  // General Master Stats for overview
  const totalDesksMaster = useMemo(() => {
    return Object.values(allSectionLayouts).flat().length;
  }, [allSectionLayouts]);

  const totalOccupiedDesksMaster = useMemo(() => {
    return Object.values(allSectionLayouts).flat().filter((ws) => ws.officer_id).length;
  }, [allSectionLayouts]);

  const activePresenceMaster = useMemo(() => {
    return Object.values(allSectionLayouts).flat().filter((ws) => ws.officer_id && ws.status === 'ACTIVE').length;
  }, [allSectionLayouts]);

  // Render OFFICE Overview Dashboard
  if (viewLevel === 'OFFICE') {
    return (
      <div className="max-w-7xl mx-auto space-y-10 animate-fade-in pb-20 px-6 font-sans">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-100 pb-8 mt-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping"></span>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] leading-none">
                {t('කාර්යාලීය අවකාශීය බුද්ධිය', 'Office Spatial Intelligence')}
              </p>
            </div>
            <h2 className="text-5xl font-black text-slate-800 tracking-tighter leading-none">
              {t('කාර්යාංශ සැලැස්ම', 'Department Deployment Hub')}
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              Divisional Structural Workstation Directory & Flow Control
            </p>
          </div>

          <div className="flex gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              disabled
              className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white shadow-md cursor-default"
            >
              Master Desk Map
            </button>
            <button
              onClick={() => {
                if (departments.length > 0) {
                  setSelectedSection(departments[0].name);
                  setViewLevel('SECTION');
                }
              }}
              className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-all active:scale-95"
            >
              Workstation Planner
            </button>
          </div>
        </div>

        {/* Dynamic Master Stats Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total System Capacity</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-slate-900">{totalDesksMaster}</span>
              <span className="text-xs text-slate-400 font-bold">Planned Stations</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Occupance Rate</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-blue-600">
                {totalDesksMaster > 0 ? Math.round((totalOccupiedDesksMaster / totalDesksMaster) * 100) : 0}%
              </span>
              <span className="text-xs text-slate-400 font-bold">
                ({totalOccupiedDesksMaster} / {totalDesksMaster} Assigned)
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Current Active Attendance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-emerald-600">{activePresenceMaster}</span>
              <span className="text-xs text-emerald-600/60 font-bold">Officers Present Today</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Workspace Divisions</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-slate-900">{departments.length}</span>
              <span className="text-xs text-slate-400 font-bold">Active Sections</span>
            </div>
          </div>
        </div>

        {/* Sections Listing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-80 bg-slate-50 border border-slate-100 rounded-[3rem] animate-pulse" />
            ))
          ) : (
            departments.map((dept, dIdx) => {
              const elements = allSectionLayouts[dept.name] || [];
              const occupiedCount = elements.filter((ws) => ws.officer_id).length;
              const presentCount = elements.filter((ws) => ws.officer_id && ws.status === 'ACTIVE').length;

              const deptStaff = allStaff.filter((s) => {
                const sDept = (s.department || '').toLowerCase().trim();
                const dName = dept.name.toLowerCase().trim();
                return sDept === dName || sDept.includes(dName) || dName.includes(sDept);
              });

              const unavailableCount = deptStaff.filter((s) => {
                const isUnavailInList = unavailabilities.some((u) => String(u.officer_id) === String(s.id));
                const isLeaveOrAbsent = s.dashboard_status === 'LEAVE' || s.dashboard_status === 'ABSENT';
                return isUnavailInList || isLeaveOrAbsent;
              }).length;

              return (
                <div
                  key={dIdx}
                  onClick={() => {
                    setSelectedSection(dept.name);
                    setViewLevel('SECTION');
                  }}
                  className="bg-white rounded-[3rem] border border-slate-100 p-8 shadow-sm hover:shadow-2xl transition-all cursor-pointer group hover:border-blue-500/20 flex flex-col justify-between min-h-[400px] relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[10rem] -z-10 group-hover:bg-blue-50/50 transition-all flex items-center justify-center pl-8 pb-8 text-4xl">
                    {dept.name.toLowerCase().includes('land') ? '🧭' : dept.name.toLowerCase().includes('admin') ? '🏛️' : '📈'}
                  </div>

                  <div>
                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest border border-blue-100">
                      Division Plan
                    </span>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-4 uppercase">
                      {dept.name}
                    </h3>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mt-2 tracking-widest">
                      {dept.code || 'DIV-SEC'} • Active Layout
                    </p>
                  </div>

                  <div className="space-y-4 mt-6">
                    <div className="grid grid-cols-2 gap-3.5">
                      {/* Current Active Attendance */}
                      <div className="bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100/50 flex flex-col justify-between">
                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Active Attendance</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-lg font-black text-emerald-800">{presentCount}</span>
                          <span className="text-[9px] text-emerald-500 font-bold">Present</span>
                        </div>
                      </div>

                      {/* Occupancy Rate */}
                      <div className="bg-blue-50/40 p-3 rounded-2xl border border-blue-100/50 flex flex-col justify-between">
                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block mb-1">Occupancy Rate</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-blue-800">
                            {elements.length > 0 ? Math.round((occupiedCount / elements.length) * 100) : 0}%
                          </span>
                          <span className="text-[9px] text-blue-500 font-bold">Filled</span>
                        </div>
                      </div>

                      {/* Total Assigned Officers */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Assigned Officers</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{occupiedCount}</span>
                          <span className="text-[9px] text-slate-400 font-bold">/ {elements.length} Desks</span>
                        </div>
                      </div>

                      {/* Total Unavailable Officers */}
                      <div className="bg-amber-50/40 p-3 rounded-2xl border border-amber-100/50 flex flex-col justify-between">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest block mb-1">Unavailable Today</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-amber-800">{unavailableCount}</span>
                          <span className="text-[9px] text-amber-500 font-bold">Away</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-[10px] font-bold text-slate-400">
                        Stations: {elements.length} Planned
                      </span>
                      <span className="text-xs font-black uppercase text-blue-600 tracking-widest group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
                        Go To Map <span className="text-sm">→</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Render individual SECTION map layout
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20 px-6 font-sans">
      
      {/* Header and Controls */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden mt-4">
        <div className="bg-slate-900 text-white px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => setViewLevel('OFFICE')}
              className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all font-black text-lg active:scale-90"
            >
              ←
            </button>
            <div>
              <h2 className="text-2xl font-black tracking-tight leading-none uppercase">{selectedSection}</h2>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">
                Room Layout & Dispatch
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
            {isArchitect && (
              isEditMode ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      loadSectionLayout();
                    }}
                    className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                  >
                    Cancel Changes
                  </button>
                  <button
                    onClick={() => handleSaveLayout(layouts)}
                    className="px-8 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
                  >
                    Save & Publish Map
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/25 transition-all active:scale-95"
                >
                  Edit Stations layout
                </button>
              )
            )}
            
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="bg-slate-800 text-white text-xs font-black border-none outline-none rounded-xl px-4 py-2.5 cursor-pointer uppercase"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search and Filters Bar */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="w-full md:max-w-md relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('නිලධාරියා, ආසනය හෝ දුරකථනය සොයන්න...', 'Search layout by officer name, desk label, hardware or extension...')}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl font-bold text-xs placeholder:text-slate-300 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/10 border border-slate-200 transition-all shadow-inner"
            />
          </div>

          <div className="flex gap-4 items-center">
            {isEditMode && (
              <button
                type="button"
                onClick={() => setIsZoneModalOpen(true)}
                className="px-5 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 flex items-center gap-1"
              >
                ➕ Add Section Zone
              </button>
            )}

            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                <span>Executive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-teal-500"></span>
                <span>Counter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-500"></span>
                <span>Back Office</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Workspace Layout Zone Area */}
        <div className="flex-1 w-full space-y-12">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4 bg-white rounded-[3rem] border border-slate-200">
              <div className="w-10 h-10 border-4 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Compiling Workspace Map...</p>
            </div>
          ) : (
            zones.map((zone) => {
              const workstations = filteredWorkstationsGrouped[zone.id] || [];

              return (
                <div key={zone.id} className="bg-white p-8 rounded-[3rem] border border-slate-200/60 shadow-sm space-y-6">
                  <header className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                        {zone.name}
                      </h3>
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mt-1">
                        Workspace Zone • {workstations.length} Desk Spaces Mapped
                      </p>
                    </div>

                    {isEditMode && (
                      <button
                        onClick={() => handleOpenWorkstationModal(undefined, zone.id)}
                        className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        ➕ Add Desk
                      </button>
                    )}
                  </header>

                  {workstations.length === 0 ? (
                    <div className="p-16 text-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-400">
                      <p className="text-xs font-black uppercase tracking-widest mb-1">Vacant Zone Floor</p>
                      <p className="text-[10px] leading-relaxed text-slate-400/70">No matching desks of configuration records exist in this area.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {workstations.map((ws) => {
                        const officer = allStaff.find((s) => String(s.id) === String(ws.officer_id));
                        const isQueryMatched = searchQuery && (
                          ws.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          officer?.name.toLowerCase().includes(searchQuery.toLowerCase())
                        );

                        const catInfo = CATEGORIES.find((cat) => cat.id === ws.category) || CATEGORIES[2];

                        return (
                          <div
                            key={ws.id}
                            id={`ws-card-${ws.id}`}
                            className={`rounded-3xl border-2 p-5 bg-white transition-all flex flex-col justify-between relative select-none ${
                              isQueryMatched ? 'ring-8 ring-amber-400/35 border-amber-500 scale-[1.02]' : 'border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            {/* Color Header Strip */}
                            <div className={`absolute top-0 left-0 right-0 h-2.5 rounded-t-[22px] ${
                              ws.status === 'ACTIVE' && officer ? 'bg-emerald-500' : 'bg-slate-300'
                            }`} />

                            <div className="space-y-4">
                              {/* Meta Info */}
                              <div className="flex justify-between items-start mt-2">
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${catInfo.bgClass} ${catInfo.colorClass} border ${catInfo.borderClass}`}>
                                  {catInfo.icon} {ws.label}
                                </span>

                                <div className="flex gap-1">
                                  {isEditMode ? (
                                    <>
                                      <button
                                        onClick={() => handleOpenWorkstationModal(ws)}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[9px] font-extrabold uppercase"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteWorkstation(ws.id)}
                                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[9px] font-extrabold uppercase"
                                      >
                                        Del
                                      </button>
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {ws.status === 'ACTIVE' && officer ? (
                                        <span className="flex h-2 w-2 relative">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                      ) : null}
                                      <span className={`text-[8px] font-black uppercase tracking-widest ${
                                        ws.status === 'ACTIVE' && officer ? 'text-emerald-600' : 'text-slate-400'
                                      }`}>
                                        {ws.status === 'ACTIVE' && officer ? 'Present' : 'Away'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Officer details */}
                              {officer ? (
                                <div className="space-y-2 border-b border-slate-50 pb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-800 text-sm border-2 border-white shadow-md">
                                      {officer.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-black text-slate-900 truncate leading-none">
                                        {officer.name}
                                      </h4>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 truncate">
                                        {officer.post}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="py-2 border-b border-slate-50 pb-3 flex flex-col items-center justify-center border-dashed border rounded-xl bg-slate-50/50">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vacant Space</p>
                                  {isEditMode && (
                                    <button
                                      onClick={() => handleOpenWorkstationModal(ws)}
                                      className="mt-1 text-[8px] font-extrabold text-blue-600 hover:underline uppercase"
                                    >
                                      Assign Officer
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Workstation specs (phone ext, pc style, specs) */}
                              <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-500">
                                <div>
                                  <span className="text-[8px] uppercase tracking-widest text-slate-400 block">Telephone Ext.</span>
                                  <span className="text-slate-700 font-extrabold">{ws.extension || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] uppercase tracking-widest text-slate-400 block">Deploy Equipments</span>
                                  <span className="text-slate-700 font-medium truncate block" title={ws.equipment}>
                                    {ws.equipment || 'PC setup'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Action Panel Sidebar */}
        {isEditMode && (
          <div className="w-full lg:w-80 space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl border border-white/5 space-y-6">
              <header className="flex justify-between items-center pb-2 border-b border-white/10">
                <h4 className="text-[11px] font-black text-blue-400 uppercase tracking-widest">
                  Unassigned Gaps Registry
                </h4>
                <button
                  onClick={loadSectionLayout}
                  className="text-[9px] uppercase font-black text-white/40 hover:text-white"
                >
                  Sync
                </button>
              </header>
              <p className="text-[10px] text-white/40 italic leading-relaxed">
                List of registered personnel currently unallocated to specific physical desks in this division.
              </p>

              <div className="space-y-3 max-h-[500px] overflow-y-auto no-scrollbar">
                {unmappedStaff.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-white/10 rounded-[2rem] opacity-30">
                    <p className="text-[10px] font-black uppercase">All Staff Mapped</p>
                  </div>
                ) : (
                  unmappedStaff.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        // Create a desk automatically with this officer
                        const sample: WorkstationElement = {
                          id: `ws-${Date.now()}`,
                          type: 'OFFICER',
                          label: 'Assigned Desk',
                          officer_id: s.id,
                          zone_id: 'general',
                          zone_name: 'Main Office Floor',
                          category: 'BACK_OFFICE',
                          status: (s.dashboard_status === 'ACTIVE' || s.dashboard_status === 'AVAILABLE') ? 'ACTIVE' : 'OFFLINE',
                          equipment: 'Standard Workstation Desktop PC',
                        };
                        setLayouts([...layouts, sample]);
                      }}
                      className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition-all cursor-pointer group"
                    >
                      <h5 className="text-xs font-black truncate">{s.name}</h5>
                      <p className="text-[9px] font-bold text-white/30 truncate mt-1">{s.post}</p>
                      <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest mt-2 block opacity-0 group-hover:opacity-100 transition-opacity">
                        Deploy To Floor Map +
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Workstation Save / Create Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-scale-up">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {editingWorkstation ? 'Edit Workstation Specifications' : 'Build Custom Workstation Desk'}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                  Adjust visual role, assigned staff, extension and assets
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-200 text-slate-500 rounded-full transition-colors font-black text-lg"
              >
                ×
              </button>
            </header>

            <form onSubmit={handleSaveWorkstationForm} className="p-10 space-y-5">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Station Name
                </label>
                <input
                  type="text"
                  required
                  value={workstationForm.label}
                  onChange={(e) => setWorkstationForm({ ...workstationForm, label: e.target.value })}
                  placeholder="e.g. Counter Area 4, Inquiries desk"
                  className="w-full p-3.5 bg-slate-50 rounded-2xl font-medium text-xs outline-none border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Mapped Desk Zone Group
                  </label>
                  <select
                    value={workstationForm.zone_id}
                    onChange={(e) => setWorkstationForm({ ...workstationForm, zone_id: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-bold text-xs border border-slate-200 text-slate-800"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Visual Work Category
                  </label>
                  <select
                    value={workstationForm.category}
                    onChange={(e) => setWorkstationForm({ ...workstationForm, category: e.target.value as ResourceCategory })}
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-bold text-xs border border-slate-200 text-slate-800"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Assigned Staff Officer
                </label>
                <select
                  value={workstationForm.officer_id}
                  onChange={(e) => setWorkstationForm({ ...workstationForm, officer_id: e.target.value })}
                  className="w-full p-3.5 bg-slate-50 rounded-2xl font-bold text-xs border border-slate-200 text-slate-800 cursor-pointer"
                >
                  <option value="">-- Leave Desk Spot Vacant --</option>
                  {activeSectionStaff.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} - {o.post}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Hotline / Telephone Extension
                  </label>
                  <input
                    type="text"
                    value={workstationForm.extension}
                    onChange={(e) => setWorkstationForm({ ...workstationForm, extension: e.target.value })}
                    placeholder="e.g. Ext. #304"
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-medium text-xs outline-none border border-slate-200 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Deployed Assets / Hardware
                  </label>
                  <input
                    type="text"
                    value={workstationForm.equipment}
                    onChange={(e) => setWorkstationForm({ ...workstationForm, equipment: e.target.value })}
                    placeholder="e.g. PC + Printer setup"
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-medium text-xs outline-none border border-slate-200 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4.5 bg-slate-900 hover:bg-blue-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl transition-all cursor-pointer mt-4"
              >
                Apply Workstation Record
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add New Zone Modal */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-scale-up">
            <header className="px-10 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Create New Section Zone</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                  Segment layout floor space visually
                </p>
              </div>
              <button
                onClick={() => setIsZoneModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full font-black text-lg text-slate-400"
              >
                ×
              </button>
            </header>

            <form onSubmit={handleCreateZone} className="p-8 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Zone Name</label>
                <input
                  type="text"
                  required
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="e.g. Financial Branch, Public Desk Counters"
                  className="w-full p-3.5 bg-slate-50 rounded-2xl font-medium text-xs border border-slate-200 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-slate-900 hover:bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md"
              >
                Create Section Zone Group
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentMapping;
