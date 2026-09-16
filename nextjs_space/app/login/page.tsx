"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Mail, KeyRound, AlertCircle, ArrowRight, Loader2, Lock, Eye, EyeOff, UserPlus } from "lucide-react";

type Mode = "signin" | "signup-email" | "signup-otp" | "signup-password" | "forgot-email" | "forgot-otp" | "forgot-reset";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession() || {};
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // --- Sign In with password ---
  const handleSignIn = async () => {
    if (!email || !password) { setError("Please enter email and password"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password");
      } else if (result?.ok) {
        router.replace("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Signup Step 1: Send OTP ---
  const sendOtp = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setError("Please enter a valid email address"); return; }
    if (!name.trim()) { setError("Please enter your name"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
      } else {
        setMode("signup-otp");
        setCountdown(60);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Signup Step 2: Verify OTP ---
  const verifyOtp = async () => {
    if (otp.length !== 6) { setError("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid OTP");
      } else {
        // OTP verified, now set password
        setMode("signup-password");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Signup Step 3: Set Password & sign in ---
  const setPasswordAndSignIn = async () => {
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to set password");
        setLoading(false);
        return;
      }
      // Sign in with credentials
      const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
      if (result?.error) {
        setError("Sign-in failed. Please try logging in.");
      } else if (result?.ok) {
        router.replace("/onboarding");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Forgot Password Step 1: Send OTP ---
  const sendForgotOtp = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setError("Please enter a valid email address"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send reset code");
      } else {
        setMode("forgot-otp");
        setCountdown(60);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Forgot Password Step 2: Verify OTP ---
  const verifyForgotOtp = async () => {
    if (otp.length !== 6) { setError("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid OTP");
      } else {
        setMode("forgot-reset");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Forgot Password Step 3: Reset Password ---
  const resetPassword = async () => {
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password");
        setLoading(false);
        return;
      }
      // Sign in with new credentials
      const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
      if (result?.error) {
        setError("Password reset successful. Please sign in.");
        setMode("signin");
      } else if (result?.ok) {
        router.replace("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn("google", { redirect: true, callbackUrl: "/dashboard" });
  };

  const resetToSignIn = () => {
    setMode("signin");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const resetToSignUp = () => {
    setMode("signup-email");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const titles: Record<Mode, { h: string; p: string }> = {
    "signin": { h: "Welcome Back", p: "Sign in with your email and password" },
    "signup-email": { h: "Create Account", p: "We'll verify your email with a one-time code" },
    "signup-otp": { h: "Verify Email", p: `Enter the 6-digit code sent to ${email}` },
    "signup-password": { h: "Set Password", p: "Create a password for future logins" },
    "forgot-email": { h: "Reset Password", p: "We'll send a verification code to your email" },
    "forgot-otp": { h: "Verify Code", p: `Enter the 6-digit code sent to ${email}` },
    "forgot-reset": { h: "New Password", p: "Create your new password" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-gradient-to-br from-green-400 to-emerald-500 p-3 rounded-xl">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">HerWay</h1>
          </div>
          <p className="text-gray-400 text-sm">AI-powered safety navigation for women</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-1 text-center">{titles[mode].h}</h2>
          <p className="text-gray-400 text-sm text-center mb-6">{titles[mode].p}</p>

          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {/* SIGN IN MODE */}
          {mode === "signin" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && document.getElementById("pw")?.focus()}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input id="pw" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    placeholder="Enter password"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button onClick={handleSignIn} disabled={loading || !email || !password}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <button onClick={() => { setMode("forgot-email"); setOtp(""); setPassword(""); setConfirmPassword(""); setError(""); }}
                className="w-full text-center text-gray-500 hover:text-gray-300 text-sm transition mt-1">Forgot password?</button>
              <p className="text-center text-gray-400 text-sm">
                Don&apos;t have an account?{" "}
                <button onClick={resetToSignUp} className="text-green-400 hover:text-green-300 font-medium">Create Account</button>
              </p>
            </div>
          )}

          {/* FORGOT PASSWORD - EMAIL */}
          {mode === "forgot-email" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendForgotOtp()}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                </div>
              </div>
              <button onClick={sendForgotOtp} disabled={loading || !email}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                {loading ? "Sending..." : "Send Reset Code"}
              </button>
              <p className="text-center text-gray-400 text-sm">
                <button onClick={resetToSignIn} className="text-green-400 hover:text-green-300 font-medium">← Back to Sign In</button>
              </p>
            </div>
          )}

          {/* FORGOT PASSWORD - OTP */}
          {mode === "forgot-otp" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">6-Digit Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type="text" inputMode="numeric" maxLength={6} value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyForgotOtp()}
                    placeholder="Enter 6-digit code" autoFocus
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm tracking-widest text-center text-lg" />
                </div>
              </div>
              <button onClick={verifyForgotOtp} disabled={loading || otp.length !== 6}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {loading ? "Verifying..." : "Verify Code"}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setMode("forgot-email"); setOtp(""); setError(""); }} className="text-gray-400 hover:text-white text-sm transition">← Back</button>
                <button onClick={sendForgotOtp} disabled={countdown > 0 || loading} className="text-green-400 hover:text-green-300 text-sm transition disabled:text-gray-600">
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
                </button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD - NEW PASSWORD */}
          {mode === "forgot-reset" && (
            <div className="space-y-4">
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-green-300 text-sm">✓ Identity verified! Set your new password.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && resetPassword()}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                </div>
              </div>
              <button onClick={resetPassword} disabled={loading || password.length < 6}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? "Resetting..." : "Reset Password & Sign In"}
              </button>
            </div>
          )}

          {/* SIGNUP EMAIL MODE */}
          {mode === "signup-email" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your name" className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                </div>
              </div>
              <button onClick={sendOtp} disabled={loading || !email || !name.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                {loading ? "Sending OTP..." : "Send Verification Code"}
              </button>
              <p className="text-center text-gray-400 text-sm">
                Already have an account?{" "}
                <button onClick={resetToSignIn} className="text-green-400 hover:text-green-300 font-medium">Sign In</button>
              </p>
            </div>
          )}

          {/* SIGNUP OTP MODE */}
          {mode === "signup-otp" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">6-Digit OTP</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type="text" inputMode="numeric" maxLength={6} value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                    placeholder="Enter 6-digit code" autoFocus
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm tracking-widest text-center text-lg" />
                </div>
              </div>
              <button onClick={verifyOtp} disabled={loading || otp.length !== 6}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {loading ? "Verifying..." : "Verify Email"}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setMode("signup-email"); setOtp(""); setError(""); }} className="text-gray-400 hover:text-white text-sm transition">← Back</button>
                <button onClick={sendOtp} disabled={countdown > 0 || loading} className="text-green-400 hover:text-green-300 text-sm transition disabled:text-gray-600">
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
                </button>
              </div>
            </div>
          )}

          {/* SIGNUP SET PASSWORD MODE */}
          {mode === "signup-password" && (
            <div className="space-y-4">
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-green-300 text-sm">✓ Email verified! Now create a password.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                  <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setPasswordAndSignIn()}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition text-sm" />
                </div>
              </div>
              <button onClick={setPasswordAndSignIn} disabled={loading || password.length < 6}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? "Creating account..." : "Create Account & Continue"}
              </button>
            </div>
          )}

          {/* Google SSO */}
          {(mode === "signin" || mode === "signup-email" || mode === "forgot-email") && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
                <div className="relative flex justify-center text-sm"><span className="px-2 bg-slate-800 text-gray-500">or</span></div>
              </div>
              <button onClick={handleGoogleSignIn} disabled={loading}
                className="w-full py-2.5 bg-white/10 hover:bg-white/15 border border-slate-600 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
