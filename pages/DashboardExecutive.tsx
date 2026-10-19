import React, { useState, useEffect, useRef } from "react";
import * as ReactRouterDom from "react-router-dom";
import { UserRole } from "../types";
import type { Officer, ResourceBooking, Unavailability } from "../types";
import { translations, TranslationKey } from "../service/i18n";
import { api } from "../service/api";

// Destructure from namespace import to resolve "no exported member" errors
const { useNavigate } = ReactRouterDom;

interface Props {
  user: Officer;
  lang: "EN" | "SI";
}

const DashboardExecutive: React.FC<Props> = ({ user, lang }) => {
  console.log(
    "[DashboardExecutive] Rendering for user:",
    user.name,
    "Role:",
    user.role,
  );
  const navigate = useNavigate();
  const t = (key: TranslationKey) => translations[lang][key];

  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [pendingBookings, setPendingBookings] = useState<ResourceBooking[]>([]);
  const [pendingProfilePics, setPendingProfilePics] = useState<Officer[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>(
    [],
  );
  const [staff, setStaff] = useState<Officer[]>([]);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [absenceForm, setAbsenceForm] = useState({
    officer_id: "",
    date: new Date().toISOString().split("T")[0],
    slot: "FULL" as "FULL" | "AM" | "PM",
    reason: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const canApprovePics = [
        UserRole.SA,
        UserRole.IT,
        UserRole.ADMIN,
      ].includes(user.role);

      const [leaves, bookings, staffList, unavailList, pendingPics] =
        await Promise.all([
          api.getPendingLeaves(),
          api.getPendingResourceApprovals(),
          api.getAllStaff(),
          api.getUnavailability(),
          canApprovePics ? api.getPendingProfilePics() : Promise.resolve([]),
        ]);
      setPendingLeaves(leaves || []);
      setPendingBookings(bookings || []);
      setStaff(staffList || []);
      setUnavailabilities(unavailList || []);
      setPendingProfilePics(pendingPics || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absenceForm.officer_id) return alert("Select staff member");
    try {
      await api.markUnavailability(absenceForm);
      setIsAbsenceModalOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleLeaveAction = async (
    id: string | number,
    action: "APPROVED" | "REJECTED",
  ) => {
    try {
      await api.updateLeaveStatus(id, action);
      setPendingLeaves((prev) => prev.filter((l) => l.id !== id));
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleApprovePic = async (
    officerId: string | number,
    approve: boolean,
  ) => {
    try {
      await api.approveProfilePic(officerId, approve);
      setPendingProfilePics((prev) => prev.filter((p) => p.id !== officerId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const isManagement = (
    [
      UserRole.EXECUTIVE,
      UserRole.ADMIN,
      UserRole.CHIEF_CLERK,
      UserRole.LEAVE_OFFICER,
      UserRole.IT,
      UserRole.SA,
      UserRole.EX,
    ] as UserRole[]
  ).includes(user.role);

  if (!isManagement) {
    console.error("[DashboardExecutive] Access denied. User role:", user.role);
    return (
      <div className="p-10 bg-red-50 border border-red-100 rounded-3xl text-red-600">
        <h2 className="text-2xl font-black">Access Denied</h2>
        <p>
          Your role ({user.role}) does not have permission to view this page.
          Required roles: EXECUTIVE, ADMIN, CHIEF_CLERK, LEAVE_OFFICER, IT, SA,
          EX.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const currentUnavailCount = unavailabilities.filter(
    (u) => u.date === today,
  ).length;
  const operationalCapacity =
    staff.length > 0
      ? Math.round(((staff.length - currentUnavailCount) / staff.length) * 100)
      : 0;

  return (
    <div className="space-y-10 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter">
            Institutional Control
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-1">
            Unified Oversight & Forensic Management
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/admin/intelligence")}
            className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-blue-600 transition-all"
          >
            {" "}
            Deep Pulse ✨
          </button>
          <button
            onClick={() => setIsAbsenceModalOpen(true)}
            className="px-8 py-4 bg-red-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-500/20"
          >
            Mark Absence
          </button>
        </div>
      </div>

      {/* Executive User Guide Banner */}
      <div
        id="executive-guide-banner"
        className="hidden sm:flex bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-xl flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
      >
        <div className="absolute -right-10 -bottom-10 opacity-10 text-[12rem] select-none pointer-events-none">
          📖
        </div>
        <div className="space-y-2 max-w-2xl">
          <span className="bg-white/20 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
            Official Resources
          </span>
          <h3 className="text-2xl font-black tracking-tight">
            {lang === "SI"
              ? "විධායක නිලධාරී පරිශීලක මාර්ගෝපදේශය"
              : "Executive Officer Control & User Guide"}
          </h3>
          <p className="text-white/80 text-xs font-semibold leading-relaxed">
            {lang === "SI"
              ? "විධායක නිලධාරීන්ගේ අධීක්ෂණ උපකරණ පුවරුව, සේවක සංඛ්‍යා ලේඛන සජීවීව පරීක්ෂා කිරීම, නිවාඩු අනුමත කිරීම, සහ පොදු ප්‍රදර්ශන තිරය යාවත්කාලීන කිරීමේ (ETA) පියවර ඇතුළත් නිල මුද්‍රිත පත්‍රිකාව බාගත කරගන්න."
              : "Download the official executive manual detailing supervision controls, readiness monitoring, leave approval workflows, and public status board (ETA) updates."}
          </p>
        </div>
        <a
          href="/My_Niyagama_User_Guide.docx"
          download="My_Niyagama_User_Guide.docx"
          className="bg-white text-blue-600 px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-wider hover:bg-slate-100 transition-all flex items-center gap-2 shadow-xl hover:-translate-y-0.5 justify-center shrink-0"
        >
          <span>📥</span>{" "}
          {lang === "SI" ? "Word ගොනුව බාගන්න" : "Download Word Guide"}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 space-y-8">
          <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <div
              onClick={() => navigate("/admin/biometric")}
              className="flex flex-col items-center justify-center p-8 bg-blue-50 border border-blue-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                🧬
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                Biometric Hub
              </span>
            </div>
            <div
              onClick={() => navigate("/admin/staff")}
              className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                👥
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Staff Registry
              </span>
            </div>
            <div
              onClick={() => navigate("/admin/intelligence")}
              className="flex flex-col items-center justify-center p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                ⚡
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                Intel Suite
              </span>
            </div>
            <div
              onClick={() => navigate("/mapping")}
              className="flex flex-col items-center justify-center p-8 bg-amber-50 border border-amber-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                🗺️
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                {t("map")}
              </span>
            </div>
            <div
              onClick={() => navigate("/circles")}
              className="flex flex-col items-center justify-center p-8 bg-purple-50 border border-purple-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                ⭕
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">
                {t("circles")}
              </span>
            </div>
            <div
              onClick={() => navigate("/gallery")}
              className="flex flex-col items-center justify-center p-8 bg-pink-50 border border-pink-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                🖼️
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-pink-600">
                {t("media")}
              </span>
            </div>
            <div
              onClick={() => navigate("/admin/dashboard-control")}
              className="flex flex-col items-center justify-center p-8 bg-slate-900 text-white rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                📺
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                Public Display
              </span>
            </div>
            <div
              onClick={() => navigate("/circulars")}
              className="flex flex-col items-center justify-center p-8 bg-sky-50 border border-sky-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                ℹ️
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                Circular Intel
              </span>
            </div>
            <div
              onClick={() => navigate("/profile")}
              className="flex flex-col items-center justify-center p-8 bg-teal-50 border border-teal-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                👤
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-600">
                {t("profile")}
              </span>
            </div>
            <div
              onClick={() => navigate("/community")}
              className="flex flex-col items-center justify-center p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] cursor-pointer hover:scale-105 transition-all group"
            >
              <span className="text-4xl mb-4 group-hover:rotate-12 transition-transform">
                📱
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                {t("feed")}
              </span>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-8 flex items-center gap-2">
              <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
              Leave Approvals
            </h3>
            <div className="space-y-4">
              {pendingLeaves.length === 0 ? (
                <div className="py-10 text-center grayscale opacity-30 font-black uppercase text-[10px] tracking-widest">
                  No pending leaves
                </div>
              ) : (
                pendingLeaves.map((req) => (
                  <div
                    key={req.id}
                    className="p-6 border border-slate-100 bg-slate-50/50 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="flex items-center gap-4">
                      <img
                        src={`https://ui-avatars.com/api/?name=${req.officer?.name}&background=random&color=fff`}
                        className="w-12 h-12 rounded-xl"
                        alt="o"
                      />
                      <div>
                        <h5 className="font-black text-slate-800 text-sm">
                          {req.officer?.name}
                        </h5>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          {req.type} · {req.start_date}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLeaveAction(req.id, "APPROVED")}
                        className="px-8 py-3 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase shadow-lg"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleLeaveAction(req.id, "REJECTED")}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Profile Picture Approvals */}
          {[UserRole.SA, UserRole.IT, UserRole.ADMIN].includes(user.role) && (
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-8 flex items-center gap-2">
                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                Profile Pic Approvals
              </h3>
              <div className="space-y-4">
                {pendingProfilePics.length === 0 ? (
                  <div className="py-10 text-center grayscale opacity-30 font-black uppercase text-[10px] tracking-widest">
                    No pending approvals
                  </div>
                ) : (
                  pendingProfilePics.map((p) => (
                    <div
                      key={p.id}
                      className="p-6 border border-slate-100 bg-slate-50/50 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <img
                            src={p.pending_profile_pic || ""}
                            className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-sm"
                            alt="pending"
                          />
                          <img
                            src={
                              p.profile_pic ||
                              `https://ui-avatars.com/api/?name=${p.name}&background=random&color=fff`
                            }
                            className="w-6 h-6 rounded-full border-2 border-white absolute -bottom-1 -right-1 shadow-md"
                            alt="current"
                          />
                        </div>
                        <div>
                          <h5 className="font-black text-slate-800 text-sm">
                            {p.name}
                          </h5>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">
                            {p.post} · {p.department}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprovePic(p.id, true)}
                          className="px-8 py-3 bg-[#1877F2] text-white rounded-xl text-[9px] font-black uppercase shadow-lg"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleApprovePic(p.id, false)}
                          className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-4">
          <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-1000">
              📊
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black tracking-tight">
                Readiness Pulse
              </h3>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                Calculated Capacity
              </p>
            </div>
            <div className="flex items-end gap-3">
              <h4
                className={`text-6xl font-black tracking-tighter ${operationalCapacity < 85 ? "text-red-500" : "text-blue-500"}`}
              >
                {operationalCapacity}%
              </h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                Service Active
              </p>
            </div>
            <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
              <p className="text-xs font-medium text-slate-400 leading-relaxed italic selection:bg-blue-500/30">
                "Capacity is optimized based on physical biometric hits and
                planned absences."
              </p>
            </div>
            <button
              onClick={() => navigate("/admin/intelligence")}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
            >
              Open Deep Pulse Analytics
            </button>
          </div>
        </div>
      </div>

      {isAbsenceModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20 my-auto">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                Log Status Override
              </h3>
              <button
                onClick={() => setIsAbsenceModalOpen(false)}
                className="p-3 hover:bg-slate-200 rounded-full transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </header>
            <form onSubmit={handleMarkAbsence} className="p-10 space-y-6">
              <select
                required
                value={absenceForm.officer_id}
                onChange={(e) =>
                  setAbsenceForm({ ...absenceForm, officer_id: e.target.value })
                }
                className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-red-100"
              >
                <option value="">-- Choose Staff Member --</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.post})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  required
                  value={absenceForm.date}
                  onChange={(e) =>
                    setAbsenceForm({ ...absenceForm, date: e.target.value })
                  }
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"
                />
                <select
                  value={absenceForm.slot}
                  onChange={(e) =>
                    setAbsenceForm({
                      ...absenceForm,
                      slot: e.target.value as any,
                    })
                  }
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"
                >
                  <option value="FULL">Full Day</option>
                  <option value="AM">AM Only</option>
                  <option value="PM">PM Only</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4"
              >
                Confirm Override
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardExecutive;
