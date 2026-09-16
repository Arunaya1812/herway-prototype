"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect, useRouter } from "next/navigation";
import { Plus, Trash2, Shield, AlertCircle, ChevronRight, CheckCircle, Users } from "lucide-react";

interface EmergencyContact {
  id: string;
  email: string;
  name: string;
  relationship: string;
}

export default function OnboardingPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newContact, setNewContact] = useState({ name: "", email: "", relationship: "" });

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
    if (status === "authenticated") {
      // Load existing contacts
      fetch("/api/user/emergency-contacts")
        .then((r) => r.ok ? r.json() : [])
        .then((data) => {
          if (Array.isArray(data)) setContacts(data);
          else if (data.contacts) setContacts(data.contacts);
        })
        .catch(() => {});
    }
  }, [status]);

  const addContact = async () => {
    if (!newContact.name || !newContact.email || !newContact.relationship) {
      setError("Please fill in all fields");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newContact.email)) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user/emergency-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContact),
      });
      if (response.ok) {
        const contact = await response.json();
        setContacts([...contacts, contact]);
        setNewContact({ name: "", email: "", relationship: "" });
      } else {
        const data = await response.json();
        setError(data.error || "Failed to add contact");
      }
    } catch {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const removeContact = async (id: string) => {
    try {
      const response = await fetch("/api/user/emergency-contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        setContacts(contacts.filter((c) => c.id !== id));
      }
    } catch {}
  };

  const completeOnboarding = () => {
    if (contacts.length < 3) {
      setError("Please add at least 3 emergency contacts to continue");
      return;
    }
    router.push("/dashboard");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-gradient-to-br from-green-400 to-emerald-500 p-3 rounded-xl">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">HerWay</h1>
          </div>
          <p className="text-gray-300">Set up your safety network</p>
          <p className="text-gray-500 text-sm mt-1">
            These contacts will be immediately notified during emergencies
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-bold text-white">Emergency Contacts</h2>
          </div>
          <p className="text-gray-400 mb-6 text-sm">
            Add at least 3 trusted people who should be notified if you trigger an SOS alert.
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {/* Add Contact Form */}
          <div className="mb-6 p-5 bg-slate-700/30 border border-slate-600/50 rounded-xl">
            <h3 className="text-white font-semibold mb-4 text-sm">Add New Contact</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-600/50 border border-slate-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 text-sm"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-600/50 border border-slate-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 text-sm"
              />
              <select
                value={newContact.relationship}
                onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-600/50 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-green-500 text-sm"
              >
                <option value="">Select Relationship</option>
                <option value="family">Family</option>
                <option value="friend">Friend</option>
                <option value="spouse">Spouse / Partner</option>
                <option value="colleague">Colleague</option>
                <option value="other">Other</option>
              </select>
              <button
                onClick={addContact}
                disabled={loading}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
          </div>

          {/* Contacts List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">
                Contacts Added
              </h3>
              <span className={`text-sm font-semibold ${contacts.length >= 3 ? "text-green-400" : "text-yellow-400"}`}>
                {contacts.length}/3 minimum
              </span>
            </div>
            {contacts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No contacts added yet</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-3 bg-slate-700/30 border border-slate-600/50 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="text-white font-medium text-sm">{contact.name}</p>
                      <p className="text-gray-400 text-xs">{contact.email} • {contact.relationship}</p>
                    </div>
                    <button
                      onClick={() => removeContact(contact.id)}
                      className="p-1.5 hover:bg-red-500/20 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Continue Button */}
          <button
            onClick={completeOnboarding}
            disabled={contacts.length < 3}
            className={`w-full py-3 font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
              contacts.length >= 3
                ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700"
                : "bg-slate-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {contacts.length >= 3 ? (
              <><CheckCircle className="w-5 h-5" /> Continue to Dashboard</>
            ) : (
              <>Add {3 - contacts.length} more contact{3 - contacts.length !== 1 ? "s" : ""} to continue</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
