"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import { User, Mail, Plus, Trash2, AlertCircle, Users } from "lucide-react";
import Header from "@/app/components/header";

interface EmergencyContact { id: string; email: string; name: string; relationship: string; }
interface UserProfile { id: string; name: string; email: string; emergencyContacts: EmergencyContact[]; }

export default function ProfilePage() {
  const { data: session, status } = useSession() || {};
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newContact, setNewContact] = useState({ name: "", email: "", relationship: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    else if (status === "authenticated") fetchProfile();
  }, [status]);

  const fetchProfile = async () => {
    try {
      const response = await fetch("/api/user/profile");
      if (response.ok) setProfile(await response.json());
    } catch { setError("Failed to load profile"); } finally { setLoading(false); }
  };

  const addContact = async () => {
    if (!newContact.name || !newContact.email || !newContact.relationship) { setError("Please fill all fields"); return; }
    try {
      const response = await fetch("/api/user/emergency-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newContact),
      });
      if (response.ok) {
        await fetchProfile();
        setNewContact({ name: "", email: "", relationship: "" });
        setShowAddForm(false); setError("");
      }
    } catch { setError("Failed to add contact"); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/user/profile", { method: "DELETE" });
      if (res.ok) {
        await signOut({ callbackUrl: "/login" });
      } else {
        setError("Failed to delete account. Please try again.");
      }
    } catch {
      setError("Failed to delete account. Please try again.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const removeContact = async (id: string) => {
    try {
      const response = await fetch("/api/user/emergency-contacts", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (response.ok) await fetchProfile();
    } catch { setError("Failed to remove contact"); }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{profile?.name || "User"}</h1>
              <p className="text-gray-400 flex items-center gap-2"><Mail className="w-4 h-4" />{profile?.email}</p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-slate-700/30 rounded-lg">
            <p className="text-gray-400 text-sm mb-1">Emergency Contacts</p>
            <p className="text-white font-semibold flex items-center gap-2"><Users className="w-4 h-4" />{profile?.emergencyContacts?.length ?? 0} contacts</p>
          </div>
        </div>

        {/* Delete Account */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-red-500/20 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Delete Account</h2>
              <p className="text-gray-400 text-sm mt-1">Permanently remove your account and all data</p>
            </div>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition text-sm font-medium">
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6">
              <div className="text-center mb-5">
                <div className="bg-red-500/20 p-3 rounded-full inline-flex mb-3">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Are you sure?</h2>
                <p className="text-gray-400 text-sm">This action is permanent. Your account, emergency contacts, saved routes, and all associated data will be deleted and <strong className="text-red-400">cannot be retrieved back</strong>.</p>
              </div>
              <div className="space-y-3">
                <button onClick={deleteAccount} disabled={deleting}
                  className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {deleting ? "Deleting..." : "Yes, Delete My Account"}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 font-semibold rounded-xl transition disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Emergency Contacts */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Emergency Contacts</h2>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition">
              <Plus className="w-4 h-4" /> Add Contact
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {showAddForm && (
            <div className="mb-8 p-6 bg-slate-700/30 border border-slate-600 rounded-lg">
              <h3 className="text-white font-semibold mb-4">Add New Contact</h3>
              <div className="space-y-4">
                <input type="text" placeholder="Full Name" value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600/50 border border-slate-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500" />
                <input type="email" placeholder="Email Address" value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600/50 border border-slate-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500" />
                <select value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600/50 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-green-500">
                  <option value="">Select Relationship</option>
                  <option value="family">Family</option>
                  <option value="friend">Friend</option>
                  <option value="spouse">Spouse / Partner</option>
                  <option value="colleague">Colleague</option>
                  <option value="other">Other</option>
                </select>
                <div className="flex gap-3">
                  <button onClick={addContact} className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition">Add Contact</button>
                  <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {profile?.emergencyContacts && profile.emergencyContacts.length > 0 ? (
            <div className="space-y-3">
              {profile.emergencyContacts.map((contact) => (
                <div key={contact.id} className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{contact.name}</p>
                    <p className="text-gray-400 text-sm">{contact.email}</p>
                    <p className="text-gray-500 text-xs mt-1 capitalize">{contact.relationship}</p>
                  </div>
                  <button onClick={() => removeContact(contact.id)} className="p-2 hover:bg-red-500/20 rounded-lg transition">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No emergency contacts yet. Add your first contact above.</p>
          )}
        </div>
      </main>
    </div>
  );
}
