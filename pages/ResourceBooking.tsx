import React, { useState, useEffect, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import type { Officer, Resource, ResourceBooking } from "../types";
import { api } from "../service/api";
import { Skeleton } from "../components/Skeleton";

interface Props {
  user: Officer;
  lang: "EN" | "SI";
}

const ResourceBookingPage: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => (lang === "SI" ? si : en);

  const [resources, setResources] = useState<Resource[]>([]);
  const [myBookings, setMyBookings] = useState<ResourceBooking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    "MY_BOOKINGS" | "PENDING_APPROVALS"
  >("MY_BOOKINGS");

  const [form, setForm] = useState({
    start_time: "",
    end_time: "",
    purpose: "",
    destination: "",
  });

  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Management and Approver checks
  const isPrivileged = useMemo(() => {
    const userRole = user.role || "";
    if (["SA", "ADMIN", "IT", "EXECUTIVE", "EX"].includes(userRole))
      return true;
    const post = (user.post || "").toLowerCase();
    const deg = (user.designation || "").toLowerCase();
    return (
      post.includes("divisional secretary") ||
      post.includes("ds") ||
      post.includes("assistant divisional secretary") ||
      post.includes("ads") ||
      post.includes("administrative officer") ||
      post.includes("ao") ||
      deg.includes("divisional secretary") ||
      deg.includes("assistant divisional secretary") ||
      deg.includes("administrative officer")
    );
  }, [user]);

  const canManageResources = useMemo(() => {
    const userRole = user.role || "";
    if (["SA", "IT"].includes(userRole)) return true;
    const post = (user.post || "").toLowerCase();
    return (
      post.includes("ito") ||
      post.includes("it officer") ||
      post.includes("system admin")
    );
  }, [user]);

  // Management Add/Edit States
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [manageForm, setManageForm] = useState({
    name: "",
    type: "VEHICLE",
    description: "",
    status: "AVAILABLE",
    specs: "",
  });

  useEffect(() => {
    loadData();
  }, [isPrivileged]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [resData, myData, pendingData] = await Promise.all([
        api.getResources(),
        api.getMyResourceBookings(),
        isPrivileged ? api.getPendingResourceApprovals() : Promise.resolve([]),
      ]);
      setResources(resData);
      setMyBookings(myData);
      setPendingBookings(pendingData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageResourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingResource) {
        await api.updateResource(editingResource.id, manageForm);
      } else {
        await api.createResource(manageForm);
      }
      setIsManageModalOpen(false);
      setEditingResource(null);
      setManageForm({
        name: "",
        type: "VEHICLE",
        description: "",
        status: "AVAILABLE",
        specs: "",
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || "Error saving resource");
    }
  };

  const handleDeleteResource = async (id: string | number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this resource and all its bookings?",
      )
    )
      return;
    try {
      await api.deleteResource(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Error deleting resource");
    }
  };

  const handleAction = async (
    id: string | number,
    status: "APPROVED" | "REJECTED",
  ) => {
    if (!window.confirm(`Are you sure you want to set status as ${status}?`))
      return;
    try {
      await api.updateBookingStatus(id, status);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const checkAiSuggestion = async (dest: string, start: string) => {
    if (!dest || !start || selectedResource?.type !== "VEHICLE") {
      setAiSuggestion(null);
      return;
    }

    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a divisional logistics optimizer. Current officer wants to go to ${dest} at ${start}. Look for other officers going to the same area to suggest ride-sharing. Context: 4 field officers currently booked today. Destination clusters: GN 43, GN 45, GN 47. Suggest carpool if relevant in ${lang === "SI" ? "Sinhala" : "English"}. Keep it short and encouraging.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      setAiSuggestion(response.text || null);
    } catch (e) {
      setAiSuggestion(null);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource) return;

    try {
      await api.bookResource({
        resource_id: selectedResource.id,
        ...form,
      });
      await loadData();
      setIsModalOpen(false);
      setForm({ start_time: "", end_time: "", purpose: "", destination: "" });
      setAiSuggestion(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">
            {t("සම්පත් වෙන්කිරීම", "Resource Booking")}
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">
            Institutional Logistics & AI Optimization
          </p>
        </div>
        {canManageResources && (
          <button
            onClick={() => {
              setEditingResource(null);
              setManageForm({
                name: "",
                type: "VEHICLE",
                description: "",
                status: "AVAILABLE",
                specs: "",
              });
              setIsManageModalOpen(true);
            }}
            className="px-6 py-3 bg-[#1877F2] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-600 transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-blue-500/20"
          >
            <span>➕</span> Add Resource
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-[3rem]" />
            ))
          : resources.map((res) => (
              <div
                key={res.id}
                className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden group hover:shadow-2xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="h-40 bg-slate-100 relative">
                    <div className="absolute inset-0 flex items-center justify-center text-6xl">
                      {res.type === "VEHICLE" ? "🚐" : "🏛️"}
                    </div>
                    <div
                      className={`absolute top-6 right-6 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${res.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"}`}
                    >
                      {res.status}
                    </div>
                  </div>
                  <div className="p-8 pb-0">
                    <h4 className="text-2xl font-black text-slate-800 tracking-tight">
                      {res.name}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
                      {res.specs}
                    </p>
                    {res.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                        {res.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="p-8 pt-4">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setSelectedResource(res);
                        setIsModalOpen(true);
                      }}
                      disabled={res.status !== "AVAILABLE"}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest group-hover:bg-[#1877F2] transition-colors disabled:opacity-30"
                    >
                      Reserve Now
                    </button>
                    {canManageResources && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingResource(res);
                            setManageForm({
                              name: res.name || "",
                              type: res.type || "VEHICLE",
                              description: res.description || "",
                              status: res.status || "AVAILABLE",
                              specs: res.specs || "",
                            });
                            setIsManageModalOpen(true);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all text-center font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteResource(res.id)}
                          className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all text-center font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-10 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {isPrivileged ? (
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab("MY_BOOKINGS")}
                className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === "MY_BOOKINGS" ? "bg-[#1877F2] text-white shadow-md" : "bg-slate-200/60 text-slate-600 hover:bg-slate-200"}`}
              >
                My Bookings ({myBookings.length})
              </button>
              <button
                onClick={() => setActiveTab("PENDING_APPROVALS")}
                className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === "PENDING_APPROVALS" ? "bg-amber-500 text-white shadow-md" : "bg-slate-200/60 text-slate-600 hover:bg-slate-200"}`}
              >
                Pending Approvals ({pendingBookings.length})
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
                Upcoming Reservations
              </h3>
              <span className="bg-slate-200 px-3 py-1 rounded-full text-[9px] font-black">
                {myBookings.length} Active
              </span>
            </>
          )}
        </div>
        <div className="p-0">
          {activeTab === "MY_BOOKINGS" ? (
            myBookings.length === 0 ? (
              <div className="py-20 text-center text-slate-300 italic grayscale opacity-40">
                <span className="text-5xl block mb-4">🗓️</span>
                <p className="font-black uppercase text-[10px] tracking-widest">
                  No active bookings found
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-8">Resource</th>
                    <th className="p-8">Time Period</th>
                    <th className="p-8">Purpose</th>
                    <th className="p-8">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {myBookings.map((b) => (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-8">
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">
                            {b.resource_type === "VEHICLE" ||
                            b.resource?.type === "VEHICLE"
                              ? "🚐"
                              : "🏛️"}
                          </span>
                          <span className="text-xs font-black text-slate-800">
                            {b.resource_name || b.resource?.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-8">
                        <div className="text-[10px] font-bold text-slate-600">
                          {new Date(b.start_time).toLocaleString()} <br />
                          <span className="text-slate-300 font-black px-1">
                            UNTIL
                          </span>{" "}
                          <br />
                          {new Date(b.end_time).toLocaleString()}
                        </div>
                      </td>
                      <td className="p-8">
                        <p className="text-xs font-medium text-slate-500 max-w-xs">
                          {b.purpose}
                        </p>
                        {b.destination && (
                          <span className="text-[9px] font-black text-[#1877F2] uppercase tracking-widest">
                            📍 {b.destination}
                          </span>
                        )}
                      </td>
                      <td className="p-8">
                        <span
                          className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${
                            b.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : b.status === "REJECTED"
                                ? "bg-red-50 text-red-600 border-red-100"
                                : "bg-blue-50 text-blue-600 border-blue-100"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : pendingBookings.length === 0 ? (
            <div className="py-20 text-center text-slate-300 italic grayscale opacity-40">
              <span className="text-5xl block mb-4">✅</span>
              <p className="font-black uppercase text-[10px] tracking-widest">
                No pending approvals remaining
              </p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="p-8">Officer</th>
                  <th className="p-8">Resource</th>
                  <th className="p-8">Time Period</th>
                  <th className="p-8">Purpose & Destination</th>
                  <th className="p-8">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingBookings.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="p-8">
                      <p className="text-xs font-black text-slate-800">
                        {b.officer_name || `Officer #${b.officer_id}`}
                      </p>
                    </td>
                    <td className="p-8">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🚐</span>
                        <span className="text-xs font-black text-slate-700">
                          {b.resource_name}
                        </span>
                      </div>
                    </td>
                    <td className="p-8">
                      <div className="text-[10px] font-bold text-slate-600">
                        {new Date(b.start_time).toLocaleString()} <br />
                        <span className="text-slate-300 font-black px-1">
                          UNTIL
                        </span>{" "}
                        <br />
                        {new Date(b.end_time).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-8">
                      <p className="text-xs font-medium text-slate-500 max-w-xs">
                        {b.purpose}
                      </p>
                      {b.destination && (
                        <span className="text-[9px] font-black text-[#1877F2] uppercase tracking-widest">
                          📍 {b.destination}
                        </span>
                      )}
                    </td>
                    <td className="p-8">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(b.id, "APPROVED")}
                          className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(b.id, "REJECTED")}
                          className="px-4 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  Resource Request
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Reserving {selectedResource?.name}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
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

            <form onSubmit={handleBook} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.start_time}
                    onChange={(e) => {
                      setForm({ ...form, start_time: e.target.value });
                      checkAiSuggestion(form.destination, e.target.value);
                    }}
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.end_time}
                    onChange={(e) =>
                      setForm({ ...form, end_time: e.target.value })
                    }
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {selectedResource?.type === "VEHICLE" && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Destination (GN Division/Village)
                  </label>
                  <input
                    type="text"
                    required={selectedResource?.type === "VEHICLE"}
                    value={form.destination}
                    onChange={(e) => {
                      setForm({ ...form, destination: e.target.value });
                      checkAiSuggestion(e.target.value, form.start_time);
                    }}
                    placeholder="e.g. Niyagama GN Division"
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Purpose of Booking
                </label>
                <textarea
                  required
                  value={form.purpose}
                  onChange={(e) =>
                    setForm({ ...form, purpose: e.target.value })
                  }
                  rows={3}
                  placeholder="Briefly explain the institutional requirement..."
                  className="w-full p-4 bg-slate-50 rounded-2xl font-medium text-sm border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner"
                />
              </div>

              {isAiLoading && (
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl animate-pulse flex items-center gap-3">
                  <span className="w-4 h-4 bg-blue-500 rounded-full animate-bounce"></span>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    AI Logistics Optimizer analyzing...
                  </span>
                </div>
              )}

              {aiSuggestion && (
                <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 bg-indigo-500 text-white text-[7px] font-black uppercase tracking-tighter rounded-bl-xl">
                    Smart Suggestion
                  </div>
                  <div className="flex gap-4 items-start">
                    <span className="text-2xl mt-1">✨</span>
                    <p className="text-xs font-bold text-indigo-900 leading-relaxed italic">
                      "{aiSuggestion}"
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4 hover:scale-105 active:scale-95 transition-all"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      )}

      {isManageModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto w-full h-full">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20 animate-scale-up">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {editingResource ? "Edit Resource" : "Add Resource"}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                  {editingResource
                    ? "Update details of the agency asset"
                    : "Create a new shareable institutional resource"}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsManageModalOpen(false);
                  setEditingResource(null);
                }}
                type="button"
                className="p-3 hover:bg-slate-200 rounded-full transition-colors"
                id="close-resource-modal-btn"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
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

            <form onSubmit={handleManageResourceSubmit} className="p-10 space-y-6">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Resource Name
                </label>
                <input
                  type="text"
                  required
                  value={manageForm.name}
                  onChange={(e) =>
                    setManageForm({ ...manageForm, name: e.target.value })
                  }
                  placeholder="e.g. Toyota Coaster, Main Conference Hall"
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner text-sm"
                  id="resource-name-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Resource Type
                  </label>
                  <select
                    value={manageForm.type}
                    onChange={(e) =>
                      setManageForm({ ...manageForm, type: e.target.value })
                    }
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm"
                    id="resource-type-select"
                  >
                    <option value="VEHICLE">VEHICLE (🚐)</option>
                    <option value="HALL">HALL (🏛️)</option>
                    <option value="EQUIPMENT">EQUIPMENT (⚙️)</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Status
                  </label>
                  <select
                    value={manageForm.status}
                    onChange={(e) =>
                      setManageForm({ ...manageForm, status: e.target.value })
                    }
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm"
                    id="resource-status-select"
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="UNAVAILABLE">UNAVAILABLE</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Specifications (details/capacity)
                </label>
                <input
                  type="text"
                  value={manageForm.specs}
                  onChange={(e) =>
                    setManageForm({ ...manageForm, specs: e.target.value })
                  }
                  placeholder="e.g. 15 Seater A/C, 150 PAX capacity"
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner text-sm"
                  id="resource-specs-input"
                />
              </div>

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Resource Description
                </label>
                <textarea
                  value={manageForm.description}
                  onChange={(e) =>
                    setManageForm({
                      ...manageForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Insert extra reservation requirements or notes..."
                  className="w-full p-4 bg-slate-50 rounded-2xl font-medium text-sm border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner"
                  id="resource-desc-input"
                />
              </div>

              <button
                type="submit"
                className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4 hover:scale-105 active:scale-95 transition-all text-center"
                id="submit-resource-btn"
              >
                {editingResource ? "Save Changes" : "Create Asset"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceBookingPage;
